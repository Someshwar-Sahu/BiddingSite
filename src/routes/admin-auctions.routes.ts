import path from 'path';
import { Router } from 'express';
import Database from 'better-sqlite3';
import { AuctionRepository } from '../auction-repository.js';
import { generateMagicToken, buildAccessUrl, buildWhatsAppShareUrl } from '../magic-link.js';
import { computeEventOutcome, type LotSettlementInput } from '../auction-outcome.js';
import { generateAuctionReportPdf } from '../report-generator.js';
import { Server as SocketIOServer } from 'socket.io';
import { createNotification } from '../notifications.js';
import {
  sendSupplierOnboardingInviteEmail,
  sendKycApprovalEmail,
  sendAuctionInvitationEmail,
  sendAuctionUpdateNotificationEmail,
} from '../email-service.js';

/**
 * Robust helper to process assigned and custom vendors during auction creation and updates.
 * Guarantees that less input or partial fields never violate DB constraints,
 * always adds new custom vendors into the master `vendors` table,
 * links them to the corporate client in `company_vendors`,
 * and issues active Magic Link tokens in `auction_invites`.
 */
export function processAuctionVendors(
  db: Database.Database,
  auctionId: string,
  customerOrgId: string,
  customerVendors: any[]
): void {
  if (!Array.isArray(customerVendors)) return;

  for (const cv of customerVendors) {
    if (!cv) continue;

    // Sanitize string inputs
    const rawCompany = typeof cv.company_name === 'string' ? cv.company_name.trim() : '';
    const rawEmail = typeof cv.email === 'string' ? cv.email.trim().toLowerCase() : '';
    const rawPhone = typeof cv.phone === 'string' ? cv.phone.trim() : '';
    const rawContact = typeof cv.contact_person === 'string' ? cv.contact_person.trim() : '';
    const rawGstin = typeof cv.gstin === 'string' ? cv.gstin.trim() : null;
    const rawPan = typeof cv.pan === 'string' ? cv.pan.trim() : null;

    // Skip if row is completely empty
    if (!rawCompany && !rawEmail && !rawPhone) {
      continue;
    }

    // Gracefully handle partial/less input:
    // 1. Email (must satisfy NOT NULL & UNIQUE in vendors table)
    let email = rawEmail;
    if (!email) {
      const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
      const cleanName = rawCompany.toLowerCase().replace(/[^a-z0-9]/g, '_');
      if (cleanPhone) {
        email = `vendor_${cleanPhone}@vendor.nextradeauctions.com`;
      } else if (cleanName) {
        email = `${cleanName}@vendor.nextradeauctions.com`;
      } else {
        email = `vendor_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@vendor.nextradeauctions.com`;
      }
    }

    // 2. Company Name (must satisfy NOT NULL)
    const companyName = rawCompany || email.split('@')[0].toUpperCase();

    // 3. Contact Person (must satisfy NOT NULL)
    const contactPerson = rawContact || 'Representative';

    // 4. Phone (must satisfy NOT NULL)
    const phone = rawPhone || 'N/A';

    // Check if vendor already exists by ID or email (case-insensitive)
    let vendor: any = null;
    if (cv.vendor_id || cv.id) {
      vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(cv.vendor_id || cv.id);
    }
    if (!vendor) {
      vendor = db.prepare('SELECT * FROM vendors WHERE LOWER(email) = LOWER(?)').get(email);
    }

    if (!vendor) {
      const vId = `vnd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const hasFullLegal = Boolean(rawGstin && rawPan && rawContact && rawContact !== 'Representative');
      const onboardingType = hasFullLegal ? 'pin_only' : 'full';
      const initialStatus = hasFullLegal ? 'approved' : 'unregistered';
      const vToken = 'vtok_' + generateMagicToken();
      const vExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO vendors (id, company_name, contact_person, email, phone, gstin, pan, onboarding_token, onboarding_type, onboarding_token_expires_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(vId, companyName, contactPerson, email, phone, rawGstin || null, rawPan || null, vToken, onboardingType, vExpiry, initialStatus);
      vendor = { id: vId, company_name: companyName, email, phone, status: initialStatus };
    } else {
      // Update vendor details if incoming data is more complete
      const updates: string[] = [];
      const params: any[] = [];

      if (rawCompany && vendor.company_name !== companyName && (!vendor.company_name || vendor.company_name.includes('@'))) {
        updates.push('company_name = ?');
        params.push(companyName);
      }

      if (rawContact && (vendor.contact_person === 'Representative' || !vendor.contact_person)) {
        updates.push('contact_person = ?');
        params.push(rawContact);
      }

      if (rawPhone && (vendor.phone === '9999999999' || vendor.phone === 'N/A' || !vendor.phone)) {
        updates.push('phone = ?');
        params.push(rawPhone);
      }

      if (rawGstin && !vendor.gstin) {
        updates.push('gstin = ?');
        params.push(rawGstin);
      }

      if (updates.length > 0) {
        params.push(vendor.id);
        db.prepare(`UPDATE vendors SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
    }

    // Always link vendor to corporate client
    if (customerOrgId) {
      db.prepare('INSERT OR IGNORE INTO company_vendors (company_id, vendor_id) VALUES (?, ?)').run(customerOrgId, vendor.id);
    }

    // Always ensure auction invite exists
    const hasInvite = db.prepare('SELECT id FROM auction_invites WHERE auction_id = ? AND vendor_id = ?').get(auctionId, vendor.id);
    if (!hasInvite) {
      const token = generateMagicToken();
      db.prepare(`
        INSERT INTO auction_invites (id, auction_id, vendor_id, role, token, expires_at)
        VALUES (?, ?, ?, 'vendor', ?, datetime('now', '+7 days'))
      `).run(`inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, auctionId, vendor.id, token);
    }
  }
}

export function createAdminAuctionsRouter(db: Database.Database, repo: AuctionRepository, io?: SocketIOServer): Router {
  const router = Router();

  // 1. Overview
  router.get('/overview', (_req, res) => {
    const auctions = db.prepare(`
      SELECT a.*, o.name as customer_name,
        (SELECT COUNT(*) FROM lots WHERE auction_id = a.id) as lot_count
      FROM auctions a
      LEFT JOIN organizations o ON a.customer_org_id = o.id
      ORDER BY a.created_at DESC
    `).all();

    const vendors = db.prepare(`
      SELECT v.*,
        (SELECT GROUP_CONCAT(o.name, ', ') 
         FROM company_vendors cv 
         JOIN organizations o ON cv.company_id = o.id 
         WHERE cv.vendor_id = v.id) as assigned_companies,
        (SELECT GROUP_CONCAT(cv.company_id, ',') 
         FROM company_vendors cv 
         WHERE cv.vendor_id = v.id) as assigned_company_ids
      FROM vendors v 
      ORDER BY v.created_at DESC
    `).all();

    const invites = db.prepare(`
      SELECT i.*, v.company_name, v.phone, v.email
      FROM auction_invites i
      LEFT JOIN vendors v ON i.vendor_id = v.id
      ORDER BY i.created_at DESC
    `).all() as any[];

    const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const enrichedInvites = invites.map((inv) => {
      const accessUrl = buildAccessUrl(baseUrl, inv.auction_id, inv.token);
      const waUrl = inv.phone
        ? buildWhatsAppShareUrl(inv.phone, inv.company_name || 'Partner', inv.auction_id, accessUrl)
        : null;
      return { ...inv, accessUrl, waUrl };
    });

    res.json({ auctions, vendors, invites: enrichedInvites });
  });

  // 2. Next sequential Auction ID
  router.get('/next-auction-id', (req, res) => {
    const orgId = req.query.orgId as string;
    let prefix = 'NTA';

    if (orgId) {
      const org = db.prepare('SELECT name FROM organizations WHERE id = ?').get(orgId) as any;
      if (org) {
        const code = org.name.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '');
        prefix = `NTA-${code}`;
      }
    }

    const existing = db.prepare('SELECT id FROM auctions WHERE id LIKE ?').all(`${prefix}-%`) as { id: string }[];
    let maxSeq = 0;
    existing.forEach((row) => {
      const parts = row.id.split('-');
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    });

    const nextSeq = String(maxSeq + 1).padStart(2, '0');
    res.json({ nextId: `${prefix}-${nextSeq}` });
  });

  // 3. Single Auction details (for editing)
  router.get('/auctions/:id', (req, res) => {
    const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(req.params.id) as any;
    if (!auction) return res.status(404).json({ error: 'Auction not found' });

    const lots = repo.getLotsForAuction(req.params.id);
    const assignedVendors = db.prepare(`
      SELECT i.id as invite_id, i.token, i.role, v.id as vendor_id, v.company_name, v.contact_person, v.email, v.phone, v.gstin, v.status as vendor_status
      FROM auction_invites i
      LEFT JOIN vendors v ON i.vendor_id = v.id
      WHERE i.auction_id = ?
    `).all(req.params.id);

    res.json({ auction, lots, assignedVendors });
  });

  // 4. Create Auction with lots & assigned vendors
  router.post('/auctions', (req, res) => {
    const {
      id,
      title,
      customer_org_id,
      scheduled_start,
      duration_minutes,
      anti_sniping_minutes,
      max_buffer_minutes,
      category,
      delivery_location,
      special_instructions,
      lots,
      customerVendors,
    } = req.body;

    if (!id || !title || !customer_org_id) {
      return res.status(400).json({ error: 'Missing required auction fields (id, title, customer_org_id).' });
    }

    const duration = duration_minutes || 60;
    const start = new Date(scheduled_start || Date.now());
    const end = new Date(start.getTime() + duration * 60 * 1000);

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO auctions (
          id, title, customer_org_id, scheduled_start, scheduled_end, 
          duration_minutes, anti_sniping_minutes, extension_step_minutes, 
          max_buffer_minutes, current_end, status, category, delivery_location, 
          special_instructions
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 3, ?, ?, 'scheduled', ?, ?, ?)
      `).run(
        id,
        title,
        customer_org_id,
        start.toISOString(),
        end.toISOString(),
        duration,
        anti_sniping_minutes || 2,
        max_buffer_minutes || 30,
        end.toISOString(),
        category || 'General Procurement',
        delivery_location || 'Corporate Site',
        special_instructions || 'Standard commercial settlement terms'
      );

      if (Array.isArray(lots)) {
        lots.forEach((lot: any, index: number) => {
          db.prepare(`
            INSERT INTO lots (id, auction_id, lot_number, product_name, category, quantity, uom, start_price, reserve_price, bid_decrement)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `lot_${id}_${index + 1}`,
            id,
            index + 1,
            lot.product_name,
            lot.category || 'Standard',
            lot.quantity,
            lot.uom || 'Units',
            lot.start_price,
            lot.reserve_price,
            lot.bid_decrement
          );
        });
      }

      // Robust processing of customer vendors (custom or pool)
      processAuctionVendors(db, id, customer_org_id, customerVendors);
    });

    try {
      transaction();

      // Dispatch automated transactional invitations to all assigned suppliers
      const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const createdInvites = db.prepare(`
        SELECT ai.token, v.company_name, v.email
        FROM auction_invites ai
        JOIN vendors v ON ai.vendor_id = v.id
        WHERE ai.auction_id = ? AND ai.role = 'vendor'
      `).all(id) as any[];

      for (const inv of createdInvites) {
        if (inv.email) {
          const accessUrl = buildAccessUrl(baseUrl, id, inv.token);
          sendAuctionInvitationEmail(inv.email, inv.company_name, id, title, start.toISOString(), accessUrl).catch((err) =>
            console.error(`Error emailing invited supplier ${inv.email}:`, err)
          );
        }
      }

      res.json({ success: true, auctionId: id });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 5. Update / Edit Auction
  router.put('/auctions/:id', (req, res) => {
    const auctionId = req.params.id;
    const {
      title,
      scheduled_start,
      duration_minutes,
      anti_sniping_minutes,
      max_buffer_minutes,
      category,
      delivery_location,
      special_instructions,
      lots,
      customerVendors,
      notify_vendors,
    } = req.body;

    const existing = db.prepare('SELECT status, customer_org_id FROM auctions WHERE id = ?').get(auctionId) as any;
    if (!existing) return res.status(404).json({ error: 'Auction not found.' });

    if (existing.status === 'live' || existing.status === 'extended') {
      return res.status(400).json({
        error: 'Cannot edit an auction while live bidding is active. Procurement lots, reserve ceilings, and rules are locked to protect bidding integrity.',
      });
    }

    if (existing.status === 'ended') {
      return res.status(400).json({ error: 'Cannot edit an auction that has already ended.' });
    }

    const duration = duration_minutes || 60;
    const start = new Date(scheduled_start || Date.now());
    const end = new Date(start.getTime() + duration * 60 * 1000);

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE auctions 
        SET title = ?, scheduled_start = ?, scheduled_end = ?, duration_minutes = ?, 
            anti_sniping_minutes = ?, max_buffer_minutes = ?, current_end = ?,
            category = COALESCE(?, category),
            delivery_location = COALESCE(?, delivery_location),
            special_instructions = COALESCE(?, special_instructions)
        WHERE id = ?
      `).run(
        title,
        start.toISOString(),
        end.toISOString(),
        duration,
        anti_sniping_minutes || 2,
        max_buffer_minutes || 30,
        end.toISOString(),
        category || null,
        delivery_location || null,
        special_instructions || null,
        auctionId
      );

      if (Array.isArray(lots)) {
        db.prepare('DELETE FROM lots WHERE auction_id = ?').run(auctionId);
        lots.forEach((lot: any, index: number) => {
          db.prepare(`
            INSERT INTO lots (id, auction_id, lot_number, product_name, category, quantity, uom, start_price, reserve_price, bid_decrement)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `lot_${auctionId}_${index + 1}`,
            auctionId,
            index + 1,
            lot.product_name,
            lot.category || 'Standard',
            lot.quantity,
            lot.uom || 'Units',
            lot.start_price,
            lot.reserve_price,
            lot.bid_decrement
          );
        });
      }

      // Robust processing of customer vendors (custom or pool)
      processAuctionVendors(db, auctionId, existing.customer_org_id, customerVendors);
    });

    try {
      transaction();

      createNotification(db, io || null, {
        recipient_role: 'customer',
        recipient_org_id: existing.customer_org_id,
        title: `Scheduled Tender Parameters Updated: ${auctionId}`,
        message: `NexTrade Desk updated the scheduled parameters and specifications for ${title || auctionId}.`,
        type: 'amendment_decision',
        reference_id: auctionId,
        target_url: `/customer/dashboard?auctionId=${auctionId}`,
      });

      // If notify_vendors was checked by the Admin, dispatch update notification emails
      if (notify_vendors === true) {
        const invites = db.prepare(`
          SELECT ai.token, v.company_name, v.email
          FROM auction_invites ai
          JOIN vendors v ON ai.vendor_id = v.id
          WHERE ai.auction_id = ? AND ai.role = 'vendor' AND ai.is_revoked = 0
        `).all(auctionId) as any[];

        const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        for (const inv of invites) {
          if (inv.email) {
            const accessUrl = buildAccessUrl(baseUrl, auctionId, inv.token);
            sendAuctionUpdateNotificationEmail(
              inv.email,
              inv.company_name,
              auctionId,
              title || existing.title || auctionId,
              start.toISOString(),
              duration,
              accessUrl
            ).catch((err) => console.error(`Error notifying supplier ${inv.email}:`, err));
          }
        }
      }

      res.json({
        success: true,
        message: `Auction ${auctionId} updated successfully.`,
        notifiedVendors: notify_vendors === true,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 6. Invite Vendor & Generate Magic Link
  router.post('/auctions/:id/invite', (req, res) => {
    const { vendor_id, role } = req.body;
    const auctionId = req.params.id;
    const token = generateMagicToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    try {
      const inviteId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO auction_invites (id, auction_id, vendor_id, role, token, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(inviteId, auctionId, vendor_id || null, role || 'vendor', token, expiresAt.toISOString());

      const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const accessUrl = buildAccessUrl(baseUrl, auctionId, token);

      let waUrl = null;
      if (vendor_id) {
        const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendor_id) as any;
        const auction = db.prepare('SELECT title, scheduled_start FROM auctions WHERE id = ?').get(auctionId) as any;
        if (vendor && vendor.phone) {
          waUrl = buildWhatsAppShareUrl(vendor.phone, vendor.company_name, auctionId, accessUrl);
        }
        if (vendor && vendor.email && auction) {
          sendAuctionInvitationEmail(vendor.email, vendor.company_name, auctionId, auction.title, auction.scheduled_start, accessUrl).catch(() => {});
        }
      }

      res.json({ success: true, token, accessUrl, waUrl });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 7. Approve Vendor KYC
  router.post('/vendors/:id/approve', (req, res) => {
    try {
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id) as any;
      if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

      // Enforce strict enterprise KYC requirement: GSTIN and PAN must be present
      if (!vendor.gstin || !vendor.pan || !vendor.gstin.trim() || !vendor.pan.trim()) {
        return res.status(400).json({
          error: `Cannot approve "${vendor.company_name}": Legal KYC details (GSTIN & PAN) have not been submitted yet. The supplier must first complete their registration form.`,
        });
      }

      db.prepare("UPDATE vendors SET status = 'approved' WHERE id = ?").run(req.params.id);
      if (vendor.email) {
        const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        sendKycApprovalEmail(vendor.email, vendor.company_name, `${baseUrl}/vendor/login`).catch(() => {});
      }
      res.json({ success: true, message: `Supplier "${vendor.company_name}" KYC approved successfully.` });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 7a. Revoke Vendor Approval back to unregistered
  router.post('/vendors/:id/revoke', (req, res) => {
    try {
      db.prepare("UPDATE vendors SET status = 'unregistered' WHERE id = ?").run(req.params.id);
      res.json({ success: true, message: 'Supplier approval revoked. Status set to unregistered.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 7a. Invite New Supplier (Track A: Email-Only or Track B: Pre-filled PIN Setup)
  router.post('/vendors/invite', async (req, res) => {
    try {
      const { email, company_name, contact_person, phone, gstin, pan, address, company_id } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Supplier email address is required.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      let vendor = db.prepare('SELECT * FROM vendors WHERE LOWER(email) = ?').get(cleanEmail) as any;

      // Reuse existing valid token if still active, otherwise generate a fresh token
      let token = vendor?.onboarding_token;
      const isExpired = vendor?.onboarding_token_expires_at && new Date(vendor.onboarding_token_expires_at).getTime() < Date.now();
      if (!token || isExpired) {
        token = 'vtok_' + generateMagicToken();
      }

      // Preserve previous token in history so previously emailed links never become 404
      let tokenHistory = vendor?.token_history || '';
      if (vendor?.onboarding_token && vendor.onboarding_token !== token) {
        tokenHistory = tokenHistory ? `${tokenHistory},${vendor.onboarding_token}` : vendor.onboarding_token;
      }

      const tokenExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const hasAllDetails = Boolean(gstin?.trim() && pan?.trim() && contact_person?.trim());
      const onboardingType = hasAllDetails ? 'pin_only' : 'full';
      const initialStatus = hasAllDetails ? 'approved' : 'unregistered';

      if (!vendor) {
        const vId = `vnd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        db.prepare(`
          INSERT INTO vendors (id, company_name, contact_person, email, phone, gstin, pan, address, onboarding_token, onboarding_type, onboarding_token_expires_at, token_history, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          vId,
          (company_name || cleanEmail.split('@')[0]).trim(),
          (contact_person || 'Representative').trim(),
          cleanEmail,
          (phone || 'N/A').trim(),
          gstin ? gstin.trim().toUpperCase() : null,
          pan ? pan.trim().toUpperCase() : null,
          address ? address.trim() : null,
          token,
          onboardingType,
          tokenExpiry,
          tokenHistory || null,
          initialStatus
        );
        vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vId) as any;
      } else {
        // Refresh token for existing vendor while preserving token history
        db.prepare(`
          UPDATE vendors 
          SET onboarding_token = ?, onboarding_type = ?, onboarding_token_expires_at = ?,
              token_history = ?,
              company_name = COALESCE(?, company_name),
              contact_person = CASE WHEN contact_person = 'Representative' AND ? IS NOT NULL THEN ? ELSE contact_person END,
              gstin = COALESCE(?, gstin),
              pan = COALESCE(?, pan)
          WHERE id = ?
        `).run(
          token,
          onboardingType,
          tokenExpiry,
          tokenHistory || null,
          company_name ? company_name.trim() : null,
          contact_person ? contact_person.trim() : null,
          contact_person ? contact_person.trim() : null,
          gstin ? gstin.trim().toUpperCase() : null,
          pan ? pan.trim().toUpperCase() : null,
          vendor.id
        );
        vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendor.id) as any;
      }

      if (company_id) {
        db.prepare('INSERT OR IGNORE INTO company_vendors (company_id, vendor_id) VALUES (?, ?)').run(company_id, vendor.id);
      }

      const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const inviteUrl =
        onboardingType === 'pin_only'
          ? `${baseUrl}/vendor/setup-pin?token=${token}`
          : `${baseUrl}/vendor/onboard?token=${token}`;

      // Dispatch automated transactional invitation email
      const emailResult = await sendSupplierOnboardingInviteEmail(cleanEmail, vendor.company_name, inviteUrl, onboardingType);

      res.json({
        success: true,
        vendor,
        token,
        onboardingType,
        inviteUrl,
        emailSent: emailResult.success,
        emailError: emailResult.error || null,
        message:
          onboardingType === 'pin_only'
            ? 'Supplier pre-registered! Link generated for PIN setup only.'
            : 'Supplier invited! Registration link generated for full KYC completion.',
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 7b. Retrieve active Invite / Setup Link for any vendor
  router.get('/vendors/:id/invite-link', (req, res) => {
    try {
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id) as any;
      if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

      let token = vendor.onboarding_token;
      const tokenExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      if (!token) {
        token = 'vtok_' + generateMagicToken();
        db.prepare('UPDATE vendors SET onboarding_token = ?, onboarding_token_expires_at = ? WHERE id = ?').run(
          token,
          tokenExpiry,
          vendor.id
        );
      }

      const hasAllDetails = Boolean(
        vendor.gstin && vendor.pan && vendor.contact_person && vendor.contact_person !== 'Representative'
      );
      const onboardingType = vendor.onboarding_type || (hasAllDetails ? 'pin_only' : 'full');
      const baseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const inviteUrl =
        onboardingType === 'pin_only'
          ? `${baseUrl}/vendor/setup-pin?token=${token}`
          : `${baseUrl}/vendor/onboard?token=${token}`;

      res.json({
        success: true,
        token,
        onboardingType,
        inviteUrl,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 7c. Delete or Deactivate Vendor
  router.delete('/vendors/:id', (req, res) => {
    try {
      const vendorId = req.params.id;
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendorId) as any;
      if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

      const bidRow = db.prepare('SELECT count(*) as count FROM bids WHERE vendor_id = ?').get(vendorId) as any;
      const bidCount = bidRow?.count || 0;

      const isForce = req.query.force === 'true';
      const action = req.query.action as string;

      // Handle Safe Deactivation / Blacklisting
      if (action === 'deactivate') {
        db.prepare("UPDATE vendors SET status = 'blacklisted' WHERE id = ?").run(vendorId);
        db.prepare("UPDATE auction_invites SET is_revoked = 1 WHERE vendor_id = ? AND expires_at > datetime('now')").run(
          vendorId
        );
        db.prepare("DELETE FROM user_sessions WHERE user_id = ? OR organization_id = ?").run(`usr_${vendorId}`, vendorId);
        return res.json({
          success: true,
          action: 'deactivated',
          message: `Supplier "${vendor.company_name}" has been deactivated and blacklisted from active auctions.`,
        });
      }

      // If supplier has placed bids and force is not specified, return 409 Conflict
      if (bidCount > 0 && !isForce) {
        const aucRow = db
          .prepare(
            'SELECT count(DISTINCT l.auction_id) as count FROM bids b JOIN lots l ON b.lot_id = l.id WHERE b.vendor_id = ?'
          )
          .get(vendorId) as any;
        const auctionCount = aucRow?.count || 0;
        return res.status(409).json({
          conflict: true,
          hasBids: true,
          bidCount,
          auctionCount,
          companyName: vendor.company_name,
          error: `Supplier "${vendor.company_name}" has placed ${bidCount} bids in ${auctionCount} past tenders. Deleting them directly will alter historical audit records. You can Deactivate them safely, or Force Delete to permanently wipe all test data.`,
        });
      }

      // Hard Delete Transaction
      const deleteTx = db.transaction(() => {
        if (isForce) {
          db.prepare('DELETE FROM bids WHERE vendor_id = ?').run(vendorId);
          db.prepare('UPDATE lots SET current_l1_vendor_id = NULL WHERE current_l1_vendor_id = ?').run(vendorId);
        }
        db.prepare('DELETE FROM auction_invites WHERE vendor_id = ?').run(vendorId);
        db.prepare('DELETE FROM company_vendors WHERE vendor_id = ?').run(vendorId);
        db.prepare("DELETE FROM user_sessions WHERE user_id = ? OR organization_id = ?").run(`usr_${vendorId}`, vendorId);
        db.prepare("DELETE FROM platform_users WHERE id = ? OR LOWER(email) = ?").run(
          `usr_${vendorId}`,
          vendor.email.toLowerCase().trim()
        );
        db.prepare('DELETE FROM vendors WHERE id = ?').run(vendorId);
      });

      deleteTx();

      res.json({
        success: true,
        deleted: true,
        message: `Supplier "${vendor.company_name}" has been permanently deleted.`,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 8. Generate & Download Official Settlement PDF Report
  router.get('/auctions/:id/pdf', async (req, res) => {
    const auction = db.prepare(`
      SELECT a.*, o.name as company_name, o.gstin 
      FROM auctions a 
      LEFT JOIN organizations o ON a.customer_org_id = o.id 
      WHERE a.id = ?
    `).get(req.params.id) as any;

    if (!auction) return res.status(404).send('Auction not found');

    const lots = repo.getLotsForAuction(req.params.id);
    const lotInputs: LotSettlementInput[] = lots.map((l) => {
      const bids = db.prepare(`
        SELECT b.vendor_id as vendorId, v.company_name as vendorName, b.amount, b.created_at as timestamp
        FROM bids b
        LEFT JOIN vendors v ON b.vendor_id = v.id
        WHERE b.lot_id = ?
        ORDER BY b.amount ASC
      `).all(l.id) as any[];

      return {
        lotId: l.id,
        productName: l.product_name,
        quantity: l.quantity,
        uom: l.uom,
        reservePrice: l.reserve_price,
        bids: bids.map((b) => ({ ...b, timestamp: new Date(b.timestamp) })),
      };
    });

    const outcome = computeEventOutcome(auction.id, lotInputs);
    const pdfPath = path.resolve(`storage/reports/Auction-Report-${auction.id}.pdf`);

    await generateAuctionReportPdf(
      {
        auctionId: auction.id,
        companyName: auction.company_name || 'Corporate Buyer',
        gstin: auction.gstin || '07AABCN1234F1Z5',
        scheduledStart: new Date(auction.scheduled_start).toLocaleString('en-IN'),
        actualEnd: new Date(auction.current_end).toLocaleString('en-IN'),
        auctionType: 'Reverse Auction',
        currency: 'INR',
        platformUrl: 'www.nextradeauctions.com',
      },
      outcome,
      pdfPath
    );

    res.download(pdfPath, `Auction-Report-${auction.id}.pdf`);
  });

  return router;
}
