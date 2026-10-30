import path from 'path';
import { Router } from 'express';
import Database from 'better-sqlite3';
import { AuctionRepository } from '../auction-repository.js';
import { generateMagicToken, buildAccessUrl, buildWhatsAppShareUrl } from '../magic-link.js';
import { computeEventOutcome, type LotSettlementInput } from '../auction-outcome.js';
import { generateAuctionReportPdf } from '../report-generator.js';

/**
 * Robust helper to process assigned and custom vendors during auction creation and updates.
 * Guarantees that less input or partial fields never violate DB constraints,
 * always adds new custom vendors into the master `vendors` table,
 * links them to the corporate client in `company_vendors`,
 * and issues active Magic Link tokens in `auction_invites`.
 */
function processAuctionVendors(
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
      db.prepare(`
        INSERT INTO vendors (id, company_name, contact_person, email, phone, gstin, pan, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
      `).run(vId, companyName, contactPerson, email, phone, rawGstin || null, rawPan || null);
      vendor = { id: vId, company_name: companyName, email, phone };
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

export function createAdminAuctionsRouter(db: Database.Database, repo: AuctionRepository): Router {
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
    const { id, title, customer_org_id, scheduled_start, duration_minutes, anti_sniping_minutes, max_buffer_minutes, lots, customerVendors } = req.body;

    if (!id || !title || !customer_org_id) {
      return res.status(400).json({ error: 'Missing required auction fields (id, title, customer_org_id).' });
    }

    const duration = duration_minutes || 60;
    const start = new Date(scheduled_start || Date.now());
    const end = new Date(start.getTime() + duration * 60 * 1000);

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO auctions (id, title, customer_org_id, scheduled_start, scheduled_end, duration_minutes, anti_sniping_minutes, extension_step_minutes, max_buffer_minutes, current_end, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 3, ?, ?, 'scheduled')
      `).run(id, title, customer_org_id, start.toISOString(), end.toISOString(), duration, anti_sniping_minutes || 2, max_buffer_minutes || 30, end.toISOString());

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
      res.json({ success: true, auctionId: id });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 5. Update / Edit Auction
  router.put('/auctions/:id', (req, res) => {
    const auctionId = req.params.id;
    const { title, scheduled_start, duration_minutes, anti_sniping_minutes, max_buffer_minutes, lots, customerVendors, notify_vendors } = req.body;

    const existing = db.prepare('SELECT status, customer_org_id FROM auctions WHERE id = ?').get(auctionId) as any;
    if (!existing) return res.status(404).json({ error: 'Auction not found.' });
    if (existing.status === 'ended') return res.status(400).json({ error: 'Cannot edit an auction that has already ended.' });

    const duration = duration_minutes || 60;
    const start = new Date(scheduled_start || Date.now());
    const end = new Date(start.getTime() + duration * 60 * 1000);

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE auctions 
        SET title = ?, scheduled_start = ?, scheduled_end = ?, duration_minutes = ?, anti_sniping_minutes = ?, max_buffer_minutes = ?, current_end = ?
        WHERE id = ?
      `).run(title, start.toISOString(), end.toISOString(), duration, anti_sniping_minutes || 2, max_buffer_minutes || 30, end.toISOString(), auctionId);

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
        if (vendor && vendor.phone) {
          waUrl = buildWhatsAppShareUrl(vendor.phone, vendor.company_name, auctionId, accessUrl);
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
      db.prepare("UPDATE vendors SET status = 'approved' WHERE id = ?").run(req.params.id);
      res.json({ success: true });
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
