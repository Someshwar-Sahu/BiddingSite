import { Router } from 'express';
import Database from 'better-sqlite3';
import { generateMagicToken, buildAccessUrl } from '../magic-link.js';

export function createCustomerRequestsRouter(db: Database.Database): Router {
  const router = Router();

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

      request.lots = JSON.parse(request.lots_json || '[]');
      request.suggested_vendors = JSON.parse(request.suggested_vendors_json || '[]');

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
        lots: JSON.parse(r.lots_json || '[]'),
        suggested_vendors: JSON.parse(r.suggested_vendors_json || '[]'),
      }));

      res.json({ requests: parsed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Admin: Convert Tender Request Directly into an Active/Scheduled Auction
  router.post('/admin/tender-requests/:id/convert', (req, res) => {
    try {
      const request = db
        .prepare('SELECT * FROM tender_requests WHERE id = ?')
        .get(req.params.id) as any;

      if (!request) return res.status(404).json({ error: 'Tender request not found.' });
      if (request.status === 'approved' && request.converted_auction_id) {
        return res.status(400).json({
          error: `This request is already converted to auction ${request.converted_auction_id}.`,
        });
      }

      const lots = JSON.parse(request.lots_json || '[]');
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

      // Insert auction
      db.prepare(`
        INSERT INTO auctions (
          id, title, customer_org_id, scheduled_start, scheduled_end, 
          duration_minutes, anti_sniping_minutes, extension_step_minutes, 
          max_buffer_minutes, current_end, status
        )
        VALUES (?, ?, ?, ?, ?, ?, 2, 3, 30, ?, ?)
      `).run(
        auctionId,
        request.title,
        request.customer_org_id,
        scheduledStart.toISOString(),
        scheduledEnd.toISOString(),
        durationMins,
        scheduledEnd.toISOString(),
        status
      );

      // Insert lots
      lots.forEach((lot: any, idx: number) => {
        const lotId = `lot_${auctionId.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${idx + 1}`;
        const reservePrice = Number(lot.reserve_price) || 1000;
        const bidDecrement = Number(lot.bid_decrement) || 5;
        const startPrice = reservePrice - bidDecrement;

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

      // Update tender request status
      db.prepare(`
        UPDATE tender_requests 
        SET status = 'approved', converted_auction_id = ? 
        WHERE id = ?
      `).run(auctionId, req.params.id);

      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
      const observerUrl = buildAccessUrl(baseUrl, auctionId, observerToken, 'customer_observer');

      res.json({
        success: true,
        auctionId,
        observerUrl,
        message: `Tender request converted to auction ${auctionId} successfully.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to convert tender request.' });
    }
  });

  return router;
}

