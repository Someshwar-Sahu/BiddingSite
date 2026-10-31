import path from 'path';
import { Router } from 'express';
import Database from 'better-sqlite3';
import { generateMagicToken, buildAccessUrl } from '../magic-link.js';
import { processAuctionVendors } from './admin-auctions.routes.js';
import { computeEventOutcome, type LotSettlementInput } from '../auction-outcome.js';
import { generateAuctionReportPdf } from '../report-generator.js';
import { requireCustomerAuth, requireAdminAuth } from '../auth.js';
import { Server as SocketIOServer } from 'socket.io';
import { createNotification } from '../notifications.js';

function safeJsonParse<T>(val: any, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

export function createCustomerRequestsRouter(db: Database.Database, io?: SocketIOServer): Router {
  const router = Router();

  // Ensure table existence defensively on router mount
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tender_amendments (
        id TEXT PRIMARY KEY,
        auction_id TEXT REFERENCES auctions(id) ON DELETE CASCADE NOT NULL,
        customer_org_id TEXT REFERENCES organizations(id) NOT NULL,
        amendment_type TEXT CHECK(amendment_type IN ('reschedule', 'quantity_ceiling', 'delivery_terms', 'comprehensive', 'general')) NOT NULL,
        details_json TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending_review', 'approved', 'rejected')) DEFAULT 'pending_review',
        admin_notes TEXT,
        applied_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) {
    // Handled if exists
  }

  const custAuth = requireCustomerAuth(db);
  const adminAuth = requireAdminAuth(db);

  router.use('/customer', custAuth);
  router.use('/admin', adminAuth);

  // 0. Retrieve Authenticated Corporate Buyer Profile, Facilities & Approved Vendor Pool
  router.get('/customer/profile', (req, res) => {
    try {
      const orgId = (req as any).customerOrgId;
      if (!orgId) return res.status(401).json({ error: 'Customer session required.' });

      let org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) as any;
      if (!org) {
        org = db.prepare('SELECT * FROM organizations ORDER BY created_at ASC LIMIT 1').get() as any;
      }

      if (!org) {
        return res.status(404).json({ error: 'No corporate organization found.' });
      }

      // Facilities / Plants
      const facilities = db
        .prepare('SELECT * FROM organization_facilities WHERE org_id = ? ORDER BY facility_name ASC')
        .all(org.id) as any[];

      // Pre-approved vendor pool
      const vendorPool = db
        .prepare(`
          SELECT v.id, v.company_name, v.contact_person, v.email, v.phone, v.status, v.gstin, v.pan 
          FROM vendors v 
          JOIN company_vendors cv ON v.id = cv.vendor_id 
          WHERE cv.company_id = ? AND v.status = 'approved'
          ORDER BY v.company_name ASC
        `)
        .all(org.id) as any[];

      // Recent tender requests
      const recentRequests = db
        .prepare(`
          SELECT id, request_number, title, status, created_at, converted_auction_id 
          FROM tender_requests 
          WHERE customer_org_id = ? 
          ORDER BY created_at DESC 
          LIMIT 5
        `)
        .all(org.id) as any[];

      res.json({
        organization: org,
        facilities,
        vendorPool,
        recentRequests,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 0.1 Corporate Customer Executive Command Center & Dashboard
  router.get('/customer/dashboard', (req, res) => {
    try {
      let orgId = (req as any).customerOrgId || (req as any).customerUser?.organization_id;

      let org = orgId ? (db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) as any) : null;
      if (!org) {
        org = db.prepare('SELECT * FROM organizations ORDER BY created_at ASC LIMIT 1').get() as any;
      }
      if (!org) {
        const defaultOrgId = orgId || 'org_epack';
        db.prepare(`
          INSERT OR IGNORE INTO organizations (id, name, gstin, email, phone)
          VALUES (?, 'Epack Petrochem Solutions Pvt Ltd', '03AAPCP3056IZE', 'procurement@epack.in', '9876543210')
        `).run(defaultOrgId);
        org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(defaultOrgId) as any;
      }

      if (!org) {
        return res.status(404).json({ error: 'No corporate organization found.' });
      }

      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

      // 1. Fetch All Auctions for this Org
      const auctions = db.prepare(`
        SELECT a.*,
          (SELECT token FROM auction_invites WHERE auction_id = a.id AND role = 'customer_observer' LIMIT 1) as observer_token
        FROM auctions a
        WHERE a.customer_org_id = ?
        ORDER BY a.created_at DESC
      `).all(org.id) as any[];

      let totalCommittedSpend = 0;
      let totalBaselineBudget = 0;
      let totalSavings = 0;

      const enrichedAuctions = auctions.map((auc) => {
        // Guarantee observer token always exists
        if (!auc.observer_token) {
          const obsToken = `token_${generateMagicToken().slice(0, 16)}`;
          db.prepare(`
            INSERT INTO auction_invites (id, auction_id, vendor_id, role, token, expires_at)
            VALUES (?, ?, NULL, 'customer_observer', ?, datetime('now', '+7 days'))
          `).run(`inv_obs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, auc.id, obsToken);
          auc.observer_token = obsToken;
        }

        // Auto-sync status if time passed
        if (auc.status === 'live' || auc.status === 'extended') {
          if (new Date() >= new Date(auc.current_end)) {
            db.prepare("UPDATE auctions SET status = 'ended' WHERE id = ?").run(auc.id);
            auc.status = 'ended';
          }
        }

        const lots = db.prepare(`
          SELECT l.*, v.company_name as l1_vendor_name 
          FROM lots l 
          LEFT JOIN vendors v ON l.current_l1_vendor_id = v.id 
          WHERE l.auction_id = ?
          ORDER BY l.lot_number ASC
        `).all(auc.id) as any[];

        let aucSpend = 0;
        let aucReserve = 0;

        lots.forEach((lot) => {
          const qty = Number(lot.quantity) || 0;
          const reserve = Number(lot.reserve_price) || 0;
          aucReserve += reserve * qty;

          if (lot.current_lowest_bid != null && lot.current_lowest_bid > 0) {
            aucSpend += Number(lot.current_lowest_bid) * qty;
          }
        });

        const aucSavings = Math.max(0, aucReserve - (aucSpend > 0 ? aucSpend : aucReserve));
        if (auc.status === 'ended') {
          totalCommittedSpend += aucSpend;
          totalBaselineBudget += aucReserve;
          totalSavings += aucSavings;
        }

        return {
          ...auc,
          lots,
          totalReserve: aucReserve,
          totalSpend: aucSpend,
          savings: aucSavings,
          observerUrl: buildAccessUrl(baseUrl, auc.id, auc.observer_token, 'customer_observer'),
        };
      });

      const activeAuctions = enrichedAuctions.filter((a) => a.status === 'live' || a.status === 'scheduled' || a.status === 'extended');
      const concludedAuctions = enrichedAuctions.filter((a) => a.status === 'ended');

      // 2. Tender Requests Pipeline
      const tenderRequests = db.prepare(`
        SELECT * FROM tender_requests 
        WHERE customer_org_id = ? OR company_name LIKE ?
        ORDER BY created_at DESC
      `).all(org.id, `%${org.name}%`).map((r: any) => ({
        ...r,
        lots: safeJsonParse(r.lots_json, []),
        suggested_vendors: safeJsonParse(r.suggested_vendors_json, [])
      }));

      // 3. Plant Facilities
      const facilities = db.prepare(`
        SELECT * FROM organization_facilities 
        WHERE org_id = ? 
        ORDER BY facility_name ASC
      `).all(org.id) as any[];

      // 4. Approved Vendor Pool
      const vendorPool = db.prepare(`
        SELECT v.id, v.company_name, v.contact_person, v.email, v.phone, v.status, v.gstin, v.pan 
        FROM vendors v 
        JOIN company_vendors cv ON v.id = cv.vendor_id 
        WHERE cv.company_id = ? AND v.status = 'approved'
        ORDER BY v.company_name ASC
      `).all(org.id) as any[];

      // 5. Tender Amendment Requests
      let amendments: any[] = [];
      try {
        amendments = db.prepare(`
          SELECT ta.*, a.title as auction_title, a.status as auction_status,
                 a.scheduled_start, a.duration_minutes, a.delivery_location
          FROM tender_amendments ta
          LEFT JOIN auctions a ON ta.auction_id = a.id
          WHERE ta.customer_org_id = ?
          ORDER BY ta.created_at DESC
        `).all(org.id).map((a: any) => ({
          ...a,
          details: safeJsonParse(a.details_json, {})
        }));
      } catch (amdErr) {
        console.warn('Amendments query fallback:', amdErr);
      }

      const savingsPercent = totalBaselineBudget > 0 ? ((totalSavings / totalBaselineBudget) * 100).toFixed(1) : '0.0';

      res.json({
        organization: org,
        kpis: {
          totalCommittedSpend,
          totalBaselineBudget,
          totalSavings,
          savingsPercent,
          activeCount: activeAuctions.length,
          concludedCount: concludedAuctions.length,
          pendingRequestsCount: tenderRequests.filter((r) => r.status === 'pending_review').length,
          facilityCount: facilities.length,
          vendorCount: vendorPool.length,
          amendmentsCount: amendments.length,
          pendingAmendmentsCount: amendments.filter((a) => a.status === 'pending_review').length
        },
        activeAuctions,
        concludedAuctions,
        tenderRequests,
        facilities,
        vendorPool,
        amendments
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 0.2 Detailed Tender Audit, Lots & Settlement Console (The Middle Page)
  router.get('/customer/auctions/:id', (req, res) => {
    try {
      const orgId = (req as any).customerOrgId;
      if (!orgId) return res.status(401).json({ error: 'Customer session required.' });

      const auctionId = req.params.id;

      const auction = db.prepare(`
        SELECT a.*, o.name as customer_name, o.gstin as customer_gstin,
          (SELECT token FROM auction_invites WHERE auction_id = a.id AND role = 'customer_observer' LIMIT 1) as observer_token
        FROM auctions a
        LEFT JOIN organizations o ON a.customer_org_id = o.id
        WHERE a.id = ? AND a.customer_org_id = ?
      `).get(auctionId, orgId) as any;

      if (!auction) {
        return res.status(404).json({ error: 'Auction not found or unauthorized for this corporate organization.' });
      }

      // Dynamic timer auto-sync
      if (auction.status === 'live' || auction.status === 'extended') {
        if (new Date() >= new Date(auction.current_end)) {
          db.prepare("UPDATE auctions SET status = 'ended' WHERE id = ?").run(auction.id);
          auction.status = 'ended';
        }
      }

      // Lots with winning supplier details
      const lots = db.prepare(`
        SELECT l.*, v.company_name as l1_vendor_name, v.contact_person as l1_contact, v.phone as l1_phone, v.email as l1_email
        FROM lots l
        LEFT JOIN vendors v ON l.current_l1_vendor_id = v.id
        WHERE l.auction_id = ?
        ORDER BY l.lot_number ASC
      `).all(auctionId) as any[];

      // Full chronological bid history
      const bids = db.prepare(`
        SELECT b.id, b.amount, b.created_at, v.company_name as vendor_name, l.product_name, l.uom, l.reserve_price
        FROM bids b
        JOIN lots l ON b.lot_id = l.id
        JOIN vendors v ON b.vendor_id = v.id
        WHERE l.auction_id = ?
        ORDER BY b.created_at DESC
      `).all(auctionId) as any[];

      // Participating / Invited suppliers
      const invitedVendors = db.prepare(`
        SELECT v.id, v.company_name, v.contact_person, v.email, v.phone, v.gstin, ai.role, ai.created_at as invited_at
        FROM auction_invites ai
        JOIN vendors v ON ai.vendor_id = v.id
        WHERE ai.auction_id = ? AND ai.role = 'vendor'
      `).all(auctionId) as any[];

      // Calculate totals
      let totalReserve = 0;
      let totalCommittedSpend = 0;
      lots.forEach((lot) => {
        const qty = Number(lot.quantity) || 0;
        const resPrice = Number(lot.reserve_price) || 0;
        totalReserve += resPrice * qty;

        if (lot.current_lowest_bid != null && lot.current_lowest_bid > 0) {
          totalCommittedSpend += Number(lot.current_lowest_bid) * qty;
        }
      });

      const totalSavings = Math.max(0, totalReserve - (totalCommittedSpend > 0 ? totalCommittedSpend : totalReserve));
      const savingsPercent = totalReserve > 0 ? ((totalSavings / totalReserve) * 100).toFixed(1) : '0.0';

      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
      const observerUrl = auction.observer_token
        ? buildAccessUrl(baseUrl, auction.id, auction.observer_token, 'customer_observer')
        : `${baseUrl}/observer/${auction.id}`;

      res.json({
        auction: {
          ...auction,
          totalReserve,
          totalCommittedSpend,
          totalSavings,
          savingsPercent,
          observerUrl,
        },
        lots,
        bids,
        invitedVendors,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 0.3 Download Official Settlement PDF for Corporate Buyer
  router.get('/customer/auctions/:id/pdf', async (req, res) => {
    try {
      const orgId = (req as any).customerOrgId;
      if (!orgId) return res.status(401).json({ error: 'Customer session required.' });

      const auction = db.prepare(`
        SELECT a.*, o.name as company_name, o.gstin 
        FROM auctions a 
        LEFT JOIN organizations o ON a.customer_org_id = o.id 
        WHERE a.id = ? AND a.customer_org_id = ?
      `).get(req.params.id, orgId) as any;

      if (!auction) {
        return res.status(404).json({ error: 'Auction not found or unauthorized for this corporate organization.' });
      }

      const lots = db.prepare('SELECT * FROM lots WHERE auction_id = ? ORDER BY lot_number ASC').all(req.params.id) as any[];
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

      res.download(pdfPath, `Settlement-Report-${auction.id}.pdf`);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add a new delivery facility for the organization
  router.post('/customer/facilities', (req, res) => {
    try {
      const org_id = (req as any).customerOrgId || req.body.org_id;
      const { facility_name, city, state, address } = req.body;
      if (!org_id || !facility_name || !city || !state) {
        return res.status(400).json({ error: 'Facility name, city, and state are required.' });
      }

      const id = `fac_${Date.now()}`;
      db.prepare(`
        INSERT INTO organization_facilities (id, org_id, facility_name, city, state, address)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, org_id, facility_name, city, state, address || null);

      res.json({ success: true, facility: { id, facility_name, city, state, address } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update an existing delivery facility
  router.put('/customer/facilities/:id', (req, res) => {
    try {
      const org_id = (req as any).customerOrgId || req.body.org_id;
      const { facility_name, city, state, address } = req.body;
      if (!facility_name || !city || !state) {
        return res.status(400).json({ error: 'Facility name, city, and state are required.' });
      }

      const result = db.prepare(`
        UPDATE organization_facilities 
        SET facility_name = ?, city = ?, state = ?, address = ?
        WHERE id = ? AND org_id = ?
      `).run(facility_name, city, state, address || null, req.params.id, org_id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Facility not found or unauthorized.' });
      }

      res.json({ success: true, message: 'Facility updated successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a delivery facility
  router.delete('/customer/facilities/:id', (req, res) => {
    try {
      const org_id = (req as any).customerOrgId || req.query.org_id;
      const result = db.prepare(`
        DELETE FROM organization_facilities 
        WHERE id = ? AND org_id = ?
      `).run(req.params.id, org_id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Facility not found or unauthorized.' });
      }

      res.json({ success: true, message: 'Facility removed successfully.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add a vendor to company's vetted supplier pool
  router.post('/customer/vendors', (req, res) => {
    try {
      const org_id = (req as any).customerOrgId || req.body.org_id;
      const { company_name, contact_person, email, phone, gstin, pan } = req.body;
      if (!org_id || !company_name || !email) {
        return res.status(400).json({ error: 'Company name and email are required.' });
      }

      let vendor = db.prepare('SELECT id FROM vendors WHERE email = ?').get(email) as any;
      let vendorId = vendor?.id;
      if (!vendorId) {
        vendorId = `vnd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        db.prepare(`
          INSERT INTO vendors (id, company_name, contact_person, email, phone, gstin, pan, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
        `).run(vendorId, company_name, contact_person || 'Representative', email, phone || 'N/A', gstin || null, pan || null);
      }

      db.prepare(`
        INSERT OR IGNORE INTO company_vendors (company_id, vendor_id)
        VALUES (?, ?)
      `).run(org_id, vendorId);

      res.json({ success: true, vendorId, message: 'Vendor added to corporate pool.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Remove a vendor from company's vetted supplier pool
  router.delete('/customer/vendors/:id', (req, res) => {
    try {
      const org_id = (req as any).customerOrgId || req.query.org_id;
      db.prepare(`
        DELETE FROM company_vendors 
        WHERE company_id = ? AND vendor_id = ?
      `).run(org_id, req.params.id);

      res.json({ success: true, message: 'Vendor removed from corporate pool.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Customer: List submitted tender amendments
  router.get('/customer/amendments', (req, res) => {
    try {
      const orgId = (req as any).customerOrgId;
      if (!orgId) return res.status(401).json({ error: 'Customer session required.' });

      const amendments = db.prepare(`
        SELECT ta.*, a.title as auction_title, a.status as auction_status,
               a.scheduled_start, a.duration_minutes, a.delivery_location
        FROM tender_amendments ta
        JOIN auctions a ON ta.auction_id = a.id
        WHERE ta.customer_org_id = ?
        ORDER BY ta.created_at DESC
      `).all(orgId).map((a: any) => ({
        ...a,
        details: safeJsonParse(a.details_json, {})
      }));

      res.json({ amendments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Customer: Submit a Tender Amendment Request
  router.post('/customer/auctions/:id/amendments', (req, res) => {
    try {
      const orgId = (req as any).customerOrgId;
      if (!orgId) return res.status(401).json({ error: 'Customer session required.' });

      const auctionId = req.params.id;
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ? AND customer_org_id = ?').get(auctionId, orgId) as any;
      if (!auction) {
        return res.status(404).json({ error: 'Auction not found or unauthorized for this company.' });
      }

      if (auction.status === 'live' || auction.status === 'extended') {
        return res.status(400).json({
          error: 'Cannot amend tender parameters while auction is actively LIVE. Lots, reserve ceilings, and rules are locked to protect live bidding.',
        });
      }

      if (auction.status === 'ended' || auction.status === 'cancelled') {
        return res.status(400).json({ error: 'Cannot amend a concluded or cancelled auction.' });
      }

      const { amendment_type, details, reason } = req.body;
      if (!amendment_type || !details || !reason || !reason.trim()) {
        return res.status(400).json({ error: 'Amendment category, specifications, and business justification are required.' });
      }

      const id = `amd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      db.prepare(`
        INSERT INTO tender_amendments (id, auction_id, customer_org_id, amendment_type, details_json, reason, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending_review')
      `).run(id, auctionId, orgId, amendment_type, JSON.stringify(details), reason.trim());

      createNotification(db, io || null, {
        recipient_role: 'admin',
        title: `New Tender Amendment Request: ${auctionId}`,
        message: `Corporate buyer requested an amendment (${amendment_type}) for auction ${auction.title || auctionId}.`,
        type: 'amendment_request',
        reference_id: auctionId,
        target_url: '/admin/auctions',
      });

      res.status(201).json({
        success: true,
        amendmentId: id,
        message: 'Tender amendment request submitted to NexTrade Operations Desk.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: List all pending and historical tender amendments
  router.get('/admin/amendments', (_req, res) => {
    try {
      const amendments = db.prepare(`
        SELECT ta.*, a.title as auction_title, a.status as auction_status,
               a.scheduled_start as current_scheduled_start, a.duration_minutes as current_duration,
               a.delivery_location as current_delivery_location,
               o.name as customer_org_name
        FROM tender_amendments ta
        JOIN auctions a ON ta.auction_id = a.id
        JOIN organizations o ON ta.customer_org_id = o.id
        ORDER BY ta.created_at DESC
      `).all().map((a: any) => ({
        ...a,
        details: safeJsonParse(a.details_json, {})
      }));

      res.json({ amendments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Approve and Auto-Apply Tender Amendment to DB
  router.post('/admin/amendments/:id/approve', (req, res) => {
    try {
      const amd = db.prepare('SELECT * FROM tender_amendments WHERE id = ?').get(req.params.id) as any;
      if (!amd) return res.status(404).json({ error: 'Amendment request not found.' });
      if (amd.status !== 'pending_review') {
        return res.status(400).json({ error: `Amendment has already been ${amd.status}.` });
      }

      const details = JSON.parse(amd.details_json || '{}');
      const notes = req.body.admin_notes || 'Approved by NexTrade Operations Desk';

      const applyTx = db.transaction(() => {
        if (amd.amendment_type === 'reschedule' || amd.amendment_type === 'comprehensive') {
          if (details.new_scheduled_start) {
            const newStart = new Date(details.new_scheduled_start);
            const duration = Number(details.duration_minutes) || 60;
            const newEnd = new Date(newStart.getTime() + duration * 60 * 1000);
            const now = new Date();
            const newStatus = newStart <= now ? 'live' : 'scheduled';

            db.prepare(`
              UPDATE auctions 
              SET scheduled_start = ?, scheduled_end = ?, current_end = ?, duration_minutes = ?, status = ?
              WHERE id = ?
            `).run(newStart.toISOString(), newEnd.toISOString(), newEnd.toISOString(), duration, newStatus, amd.auction_id);
          }
        }
        
        if (amd.amendment_type === 'quantity_ceiling' || amd.amendment_type === 'comprehensive') {
          if (Array.isArray(details.lots) && details.lots.length > 0) {
            for (const lot of details.lots) {
              if (lot.id) {
                db.prepare(`
                  UPDATE lots 
                  SET quantity = COALESCE(?, quantity),
                      reserve_price = COALESCE(?, reserve_price),
                      bid_decrement = COALESCE(?, bid_decrement)
                  WHERE id = ? AND auction_id = ?
                `).run(
                  lot.quantity != null && lot.quantity !== '' ? Number(lot.quantity) : null,
                  lot.reserve_price != null && lot.reserve_price !== '' ? Number(lot.reserve_price) : null,
                  lot.bid_decrement != null && lot.bid_decrement !== '' ? Number(lot.bid_decrement) : null,
                  lot.id,
                  amd.auction_id
                );
              }
            }
          }
        }
        
        if (amd.amendment_type === 'delivery_terms' || amd.amendment_type === 'comprehensive') {
          if (details.delivery_location || details.special_instructions) {
            db.prepare(`
              UPDATE auctions 
              SET delivery_location = COALESCE(?, delivery_location),
                  special_instructions = COALESCE(?, special_instructions)
              WHERE id = ?
            `).run(details.delivery_location || null, details.special_instructions || null, amd.auction_id);
          }
        }

        db.prepare(`
          UPDATE tender_amendments 
          SET status = 'approved', admin_notes = ?, applied_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(notes, amd.id);
      });

      applyTx();

      createNotification(db, io || null, {
        recipient_role: 'customer',
        recipient_org_id: amd.customer_org_id,
        title: `Amendment Approved & Applied: ${amd.auction_id}`,
        message: `Your amendment request for tender ${amd.auction_id} was approved by NexTrade Desk and auto-applied to the schedule.`,
        type: 'amendment_decision',
        reference_id: amd.auction_id,
        target_url: '/customer/dashboard?tab=amendments',
      });

      res.json({ success: true, message: 'Amendment approved and auto-applied to auction records.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Reject Tender Amendment
  router.post('/admin/amendments/:id/reject', (req, res) => {
    try {
      const amd = db.prepare('SELECT * FROM tender_amendments WHERE id = ?').get(req.params.id) as any;
      if (!amd) return res.status(404).json({ error: 'Amendment request not found.' });
      if (amd.status !== 'pending_review') {
        return res.status(400).json({ error: `Amendment has already been ${amd.status}.` });
      }

      const notes = req.body.admin_notes || 'Declined per standard procurement terms.';
      db.prepare(`
        UPDATE tender_amendments 
        SET status = 'rejected', admin_notes = ?
        WHERE id = ?
      `).run(notes, amd.id);

      createNotification(db, io || null, {
        recipient_role: 'customer',
        recipient_org_id: amd.customer_org_id,
        title: `Amendment Declined: ${amd.auction_id}`,
        message: `Your amendment request for tender ${amd.auction_id} was declined: ${notes}`,
        type: 'amendment_decision',
        reference_id: amd.auction_id,
        target_url: '/customer/dashboard?tab=amendments',
      });

      res.json({ success: true, message: 'Amendment request rejected.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 1. Submit Customer Tender Request
  router.post('/customer/tender-requests', (req, res) => {
    const {
      company_name,
      customer_org_id,
      contact_person,
      email,
      phone,
      title,
      category,
      target_date,
      duration_minutes,
      delivery_location,
      special_terms,
      lots,
      suggested_vendors,
    } = req.body;

    if (!company_name || !contact_person || !email || !phone || !title) {
      return res.status(400).json({ error: 'Please provide all required organization and tender details.' });
    }

    if (!Array.isArray(lots) || lots.length === 0) {
      return res.status(400).json({ error: 'Please specify at least one procurement lot item.' });
    }

    try {
      // 1. Ensure or find organization
      let orgId = customer_org_id;
      if (!orgId) {
        const existingOrg = db
          .prepare('SELECT id FROM organizations WHERE name LIKE ? OR email = ?')
          .get(`%${company_name}%`, email) as { id: string } | undefined;

        if (existingOrg) {
          orgId = existingOrg.id;
        } else {
          orgId = `org_${Date.now()}`;
          db.prepare(`
            INSERT INTO organizations (id, name, email, phone)
            VALUES (?, ?, ?, ?)
          `).run(orgId, company_name, email, phone);
        }
      }

      // 2. Generate clean request tracking number: REQ-{CODE}-{SEQ}
      const rawCode = (company_name || 'CLIENT').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase();
      const countRow = db.prepare('SELECT COUNT(*) as count FROM tender_requests').get() as { count: number };
      const seq = String(countRow.count + 1).padStart(2, '0');
      const requestNumber = `REQ-${rawCode}-${seq}`;
      const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      db.prepare(`
        INSERT INTO tender_requests (
          id, request_number, customer_org_id, company_name, contact_person, 
          email, phone, title, category, target_date, duration_minutes, 
          delivery_location, special_terms, lots_json, suggested_vendors_json, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review')
      `).run(
        requestId,
        requestNumber,
        orgId,
        company_name,
        contact_person,
        email,
        phone,
        title,
        category || 'Industrial Procurement',
        target_date || new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        duration_minutes ? Number(duration_minutes) : 45,
        delivery_location || 'Customer Facility',
        special_terms || 'Standard commercial settlement',
        JSON.stringify(lots),
        JSON.stringify(suggested_vendors || [])
      );

      createNotification(db, io || null, {
        recipient_role: 'admin',
        title: `New Tender Request: ${requestNumber}`,
        message: `${company_name} submitted tender specifications for "${title}" (${lots.length} lots).`,
        type: 'tender_request_new',
        reference_id: requestId,
        target_url: `/admin/auctions?reviewRequest=${requestId}`,
      });

      res.status(201).json({
        success: true,
        requestId,
        requestNumber,
        message: 'Tender request successfully submitted to NexTrade Procurement Desk.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to submit tender request.' });
    }
  });

  // Customer: Direct Edit for Pending Tender Request (Request Phase)
  router.put('/customer/tender-requests/:id', (req, res) => {
    try {
      const orgId = (req as any).customerOrgId;
      if (!orgId) return res.status(401).json({ error: 'Customer session required.' });

      const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) as any;
      const existing = db
        .prepare(`
          SELECT * FROM tender_requests 
          WHERE (id = ? OR request_number = ?) AND (customer_org_id = ? OR company_name LIKE ?)
        `)
        .get(req.params.id, req.params.id, orgId, `%${org?.name || ''}%`) as any;

      if (!existing) {
        return res.status(404).json({ error: 'Tender request not found or unauthorized for your company.' });
      }

      if (existing.status === 'approved') {
        return res.status(400).json({ error: 'Cannot edit a request that has already been launched into a live auction.' });
      }

      const {
        title,
        category,
        target_date,
        duration_minutes,
        delivery_location,
        special_terms,
        lots,
        suggested_vendors,
      } = req.body;

      db.prepare(`
        UPDATE tender_requests 
        SET title = COALESCE(?, title),
            category = COALESCE(?, category),
            target_date = COALESCE(?, target_date),
            duration_minutes = COALESCE(?, duration_minutes),
            delivery_location = COALESCE(?, delivery_location),
            special_terms = COALESCE(?, special_terms),
            lots_json = COALESCE(?, lots_json),
            suggested_vendors_json = COALESCE(?, suggested_vendors_json),
            admin_revised = 0,
            customer_approved = 0,
            customer_approved_at = NULL
        WHERE id = ?
      `).run(
        title || null,
        category || null,
        target_date || null,
        duration_minutes ? Number(duration_minutes) : null,
        delivery_location || null,
        special_terms || null,
        lots ? JSON.stringify(lots) : null,
        suggested_vendors ? JSON.stringify(suggested_vendors) : null,
        existing.id
      );

      createNotification(db, io || null, {
        recipient_role: 'admin',
        title: `Tender Request Updated by Buyer: ${existing.request_number}`,
        message: `${existing.company_name} updated specifications for "${title || existing.title}".`,
        type: 'tender_request_revised',
        reference_id: existing.id,
        target_url: `/admin/auctions?reviewRequest=${existing.id}`,
      });

      res.json({ success: true, message: 'Tender request updated successfully and desk notified.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Retrieve Specific Tender Request
  router.get('/customer/tender-requests/:id', (req, res) => {
    try {
      const request = db
        .prepare(`
          SELECT tr.*, o.name as org_registered_name, a.title as converted_auction_title 
          FROM tender_requests tr 
          LEFT JOIN organizations o ON tr.customer_org_id = o.id 
          LEFT JOIN auctions a ON tr.converted_auction_id = a.id 
          WHERE tr.id = ? OR tr.request_number = ?
        `)
        .get(req.params.id, req.params.id) as any;

      if (!request) {
        return res.status(404).json({ error: 'Tender request not found.' });
      }

      request.lots = safeJsonParse(request.lots_json, []);
      request.suggested_vendors = safeJsonParse(request.suggested_vendors_json, []);

      res.json({ request });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Admin: List All Tender Requests
  router.get('/admin/tender-requests', (req, res) => {
    try {
      const status = req.query.status as string;
      let query = 'SELECT * FROM tender_requests';
      const params: any[] = [];

      if (status) {
        query += ' WHERE status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC';
      const requests = db.prepare(query).all(...params) as any[];

      const parsed = requests.map((r) => ({
        ...r,
        lots: safeJsonParse(r.lots_json, []),
        suggested_vendors: safeJsonParse(r.suggested_vendors_json, []),
      }));

      res.json({ requests: parsed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Update / Edit Tender Request Details before approval
  router.put('/admin/tender-requests/:id', (req, res) => {
    try {
      const {
        title,
        category,
        target_date,
        duration_minutes,
        delivery_location,
        special_terms,
        lots,
        suggested_vendors,
      } = req.body;

      const existing = db.prepare('SELECT * FROM tender_requests WHERE id = ? OR request_number = ?').get(req.params.id, req.params.id) as any;
      if (!existing) return res.status(404).json({ error: 'Tender request not found.' });

      db.prepare(`
        UPDATE tender_requests 
        SET title = COALESCE(?, title),
            category = COALESCE(?, category),
            target_date = COALESCE(?, target_date),
            duration_minutes = COALESCE(?, duration_minutes),
            delivery_location = COALESCE(?, delivery_location),
            special_terms = COALESCE(?, special_terms),
            lots_json = COALESCE(?, lots_json),
            suggested_vendors_json = COALESCE(?, suggested_vendors_json),
            admin_revised = 1,
            admin_revised_at = CURRENT_TIMESTAMP,
            customer_approved = 0,
            customer_approved_at = NULL
        WHERE id = ?
      `).run(
        title || null,
        category || null,
        target_date || null,
        duration_minutes ? Number(duration_minutes) : null,
        delivery_location || null,
        special_terms || null,
        lots ? JSON.stringify(lots) : null,
        suggested_vendors ? JSON.stringify(suggested_vendors) : null,
        existing.id
      );

      createNotification(db, io || null, {
        recipient_role: 'customer',
        recipient_org_id: existing.customer_org_id,
        title: `Tender Specifications Revised: ${existing.request_number}`,
        message: `NexTrade Operations Desk revised specifications for "${title || existing.title}". Please inspect and sign off.`,
        type: 'tender_request_revised',
        reference_id: existing.id,
        target_url: `/customer/dashboard?inspectRequest=${existing.id}`,
      });

      res.json({ success: true, message: 'Tender request details updated and transmitted to Corporate Buyer for review.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Customer: Sign off & Approve Tender Specifications
  router.post('/customer/tender-requests/:id/approve-specs', (req, res) => {
    try {
      const orgId = (req as any).customerOrgId;
      if (!orgId) return res.status(401).json({ error: 'Customer session required.' });

      const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId) as any;
      const request = db
        .prepare(`
          SELECT * FROM tender_requests 
          WHERE (id = ? OR request_number = ?) AND (customer_org_id = ? OR company_name LIKE ?)
        `)
        .get(req.params.id, req.params.id, orgId, `%${org?.name || ''}%`) as any;

      if (!request) {
        return res.status(404).json({ error: 'Tender request not found or unauthorized for your company.' });
      }

      if (request.status === 'approved') {
        return res.status(400).json({ error: 'This tender request has already been launched into a live auction.' });
      }

      db.prepare(`
        UPDATE tender_requests 
        SET customer_approved = 1,
             customer_approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(request.id);

      createNotification(db, io || null, {
        recipient_role: 'admin',
        title: `Tender Specs Approved: ${request.request_number}`,
        message: `${org?.name || 'Corporate Buyer'} approved & signed off on specifications for "${request.title}". Authorized to launch live reverse auction.`,
        type: 'tender_request_approved',
        reference_id: request.id,
        target_url: `/admin/auctions?reviewRequest=${request.id}`,
      });

      res.json({
        success: true,
        message: 'Tender specifications approved and signed off. NexTrade Operations Desk has been notified to launch the live auction room.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Reject / Decline a Tender Request
  router.post('/admin/tender-requests/:id/reject', (req, res) => {
    try {
      const { reason } = req.body;
      const existing = db.prepare('SELECT * FROM tender_requests WHERE id = ? OR request_number = ?').get(req.params.id, req.params.id) as any;
      if (!existing) return res.status(404).json({ error: 'Tender request not found.' });

      db.prepare(`
        UPDATE tender_requests 
        SET status = 'rejected',
            rejection_reason = ?,
            customer_approved = 0
        WHERE id = ?
      `).run(reason || 'Declined by NexTrade Operations Desk.', existing.id);

      createNotification(db, io || null, {
        recipient_role: 'customer',
        recipient_org_id: existing.customer_org_id,
        title: `Tender Request Declined: ${existing.request_number}`,
        message: `NexTrade Desk declined request for "${existing.title}": ${reason || 'Declined by desk.'}`,
        type: 'tender_request_rejected',
        reference_id: existing.id,
        target_url: `/customer/dashboard?inspectRequest=${existing.id}`,
      });

      if (io) io.emit('requests_updated');
      res.json({ success: true, message: 'Tender request declined.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Delete / Remove a Tender Request (De-cluttering)
  router.delete('/admin/tender-requests/:id', (req, res) => {
    try {
      const existing = db.prepare('SELECT * FROM tender_requests WHERE id = ? OR request_number = ?').get(req.params.id, req.params.id) as any;
      if (!existing) return res.status(404).json({ error: 'Tender request not found.' });

      db.prepare('DELETE FROM tender_requests WHERE id = ?').run(existing.id);

      if (io) io.emit('requests_updated');
      res.json({ success: true, message: 'Tender request permanently removed from database.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Admin: Convert Tender Request Directly into an Active/Scheduled Auction
  router.post('/admin/tender-requests/:id/convert', (req, res) => {
    try {
      const request = db
        .prepare('SELECT * FROM tender_requests WHERE id = ? OR request_number = ?')
        .get(req.params.id, req.params.id) as any;

      if (!request) return res.status(404).json({ error: 'Tender request not found.' });
      if (request.status === 'approved' && request.converted_auction_id) {
        return res.status(400).json({
          error: `This request is already converted to auction ${request.converted_auction_id}.`,
        });
      }

      const lots = safeJsonParse(request.lots_json, []);
      const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(request.customer_org_id) as any;
      const orgCode = (org?.name || request.company_name || 'CORP')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 10);

      // Generate sequential auction ID NTA-{CODE}-{SEQ}
      const existing = db
        .prepare('SELECT id FROM auctions WHERE id LIKE ? ORDER BY id DESC')
        .all(`NTA-${orgCode}-%`) as { id: string }[];

      let nextSeq = 1;
      if (existing.length > 0) {
        const parts = existing[0].id.split('-');
        const lastNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastNum)) nextSeq = lastNum + 1;
      }
      const auctionId = `NTA-${orgCode}-${String(nextSeq).padStart(2, '0')}`;

      const now = new Date();
      const scheduledStart = request.target_date ? new Date(request.target_date) : now;
      const durationMins = request.duration_minutes || 45;
      const scheduledEnd = new Date(scheduledStart.getTime() + durationMins * 60 * 1000);
      const status = scheduledStart <= now ? 'live' : 'scheduled';

      // Insert auction with complete enterprise commercial fields
      db.prepare(`
        INSERT INTO auctions (
          id, title, customer_org_id, scheduled_start, scheduled_end, 
          duration_minutes, anti_sniping_minutes, extension_step_minutes, 
          max_buffer_minutes, current_end, status, category, delivery_location, 
          special_instructions
        )
        VALUES (?, ?, ?, ?, ?, ?, 2, 3, 30, ?, ?, ?, ?, ?)
      `).run(
        auctionId,
        request.title,
        request.customer_org_id,
        scheduledStart.toISOString(),
        scheduledEnd.toISOString(),
        durationMins,
        scheduledEnd.toISOString(),
        status,
        request.category || 'Industrial Procurement',
        request.delivery_location || 'Corporate Facility',
        request.special_terms || 'Standard Procurement Settlement'
      );

      // Insert lots
      lots.forEach((lot: any, idx: number) => {
        const lotId = `lot_${auctionId.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${idx + 1}`;
        const reservePrice = Number(lot.reserve_price) || 1000;
        const bidDecrement = Number(lot.bid_decrement) || 5;
        const startPrice = Number(lot.start_price) || reservePrice;

        db.prepare(`
          INSERT INTO lots (
            id, auction_id, lot_number, product_name, category, quantity, 
            uom, start_price, reserve_price, bid_decrement, status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
        `).run(
          lotId,
          auctionId,
          idx + 1,
          lot.product_name,
          lot.category || request.category || 'General',
          Number(lot.quantity) || 1,
          lot.uom || 'Nos',
          startPrice,
          reservePrice,
          bidDecrement
        );
      });

      // Generate Customer Observer Token
      const observerToken = `token_${generateMagicToken().slice(0, 16)}`;
      db.prepare(`
        INSERT INTO auction_invites (id, auction_id, vendor_id, role, token, expires_at)
        VALUES (?, ?, NULL, 'customer_observer', ?, datetime('now', '+3 days'))
      `).run(`inv_obs_${Date.now()}`, auctionId, observerToken);

      // Process and register all pre-approved and custom vendors from the intake wizard
      const suggestedVendors = safeJsonParse(request.suggested_vendors_json, []);
      if (Array.isArray(suggestedVendors) && suggestedVendors.length > 0) {
        processAuctionVendors(db, auctionId, request.customer_org_id, suggestedVendors);
      }

      // Update tender request status
      db.prepare(`
        UPDATE tender_requests 
        SET status = 'approved', converted_auction_id = ? 
        WHERE id = ?
      `).run(auctionId, request.id);

      createNotification(db, io || null, {
        recipient_role: 'customer',
        recipient_org_id: request.customer_org_id,
        title: `Reverse Auction Room Generated: ${auctionId}`,
        message: `Tender "${request.title}" converted into auction ${auctionId}. Your Executive Observer screen and supplier invites are active.`,
        type: 'auction_live',
        reference_id: auctionId,
        target_url: `/customer/dashboard?auctionId=${auctionId}`,
      });

      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
      const observerUrl = buildAccessUrl(baseUrl, auctionId, observerToken, 'customer_observer');

      // Fetch generated vendor tokens for admin review
      const vendorInvites = db.prepare(`
        SELECT ai.token, v.company_name, v.email, v.phone 
        FROM auction_invites ai 
        JOIN vendors v ON ai.vendor_id = v.id 
        WHERE ai.auction_id = ? AND ai.role = 'vendor'
      `).all(auctionId).map((v: any) => ({
        ...v,
        magicUrl: buildAccessUrl(baseUrl, auctionId, v.token, 'vendor')
      }));

      res.json({
        success: true,
        auctionId,
        observerUrl,
        vendorInvites,
        message: `Tender request converted to auction ${auctionId} with ${vendorInvites.length} supplier invites generated.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to convert tender request.' });
    }
  });

  return router;
}
