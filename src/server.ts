import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { Server as SocketIOServer, Socket } from 'socket.io';
import Database from 'better-sqlite3';
import { AuctionRepository } from './auction-repository.js';
import {
  verifyInviteToken,
  generateMagicToken,
  buildAccessUrl,
  buildWhatsAppShareUrl,
  type InviteRecord,
} from './magic-link.js';
import {
  evaluateAntiSniping,
  getAuctionTimerState,
  type AuctionTimerConfig,
} from './auction-timer.js';
import { computeEventOutcome, type LotSettlementInput } from './auction-outcome.js';
import { generateAuctionReportPdf } from './report-generator.js';

export interface ServerInstance {
  app: express.Express;
  httpServer: http.Server;
  io: SocketIOServer;
}

export function createAuctionServer(db: Database.Database): ServerInstance {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static('public'));

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  const repo = new AuctionRepository(db);

  // ==========================================
  // 1. PUBLIC & CLIENT PAGE ROUTES
  // ==========================================
  app.get('/', (_req, res) => res.sendFile(path.resolve('public/index.html')));
  app.get('/live-auction/:id', (_req, res) => res.sendFile(path.resolve('public/index.html')));
  app.get('/health', (_req, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString() }));

  // ==========================================
  // 2. DEDICATED ADMIN MULTI-PAGE ROUTES
  // ==========================================
  app.get('/admin', (_req, res) => res.redirect('/admin/auctions'));
  app.get('/admin/auctions', (_req, res) => res.sendFile(path.resolve('public/admin/auctions.html')));
  app.get('/admin/auction-editor', (_req, res) => res.sendFile(path.resolve('public/admin/auction-editor.html')));
  app.get('/admin/clients', (_req, res) => res.sendFile(path.resolve('public/admin/clients.html')));
  app.get('/admin/vendors', (_req, res) => res.sendFile(path.resolve('public/admin/vendors.html')));

  // ==========================================
  // 3. CORPORATE CLIENTS & VENDOR POOL APIS
  // ==========================================
  // List all client companies
  app.get('/api/admin/companies', (_req, res) => {
    const companies = db.prepare('SELECT * FROM organizations ORDER BY name ASC').all();
    res.json(companies);
  });

  // Create a new client company
  app.post('/api/admin/companies', (req, res) => {
    const { name, gstin, email, phone, shortCode } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

    const id = `org_${(shortCode || name).toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8)}`;
    try {
      db.prepare(`
        INSERT INTO organizations (id, name, gstin, email, phone)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, name, gstin || null, email, phone || null);
      res.json({ success: true, company: { id, name } });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Get specific company's vendor pool
  app.get('/api/admin/companies/:id/vendors', (req, res) => {
    const vendors = db.prepare(`
      SELECT v.* 
      FROM vendors v
      JOIN company_vendors cv ON v.id = cv.vendor_id
      WHERE cv.company_id = ?
      ORDER BY v.company_name ASC
    `).all(req.params.id);
    res.json(vendors);
  });

  // Add a vendor into a company's specific pool
  app.post('/api/admin/companies/:id/vendors', (req, res) => {
    const companyId = req.params.id;
    const { company_name, contact_person, email, phone, gstin, pan } = req.body;

    if (!email || !company_name) {
      return res.status(400).json({ error: 'Company name and email are required.' });
    }

    const transaction = db.transaction(() => {
      let vendor = db.prepare('SELECT id FROM vendors WHERE email = ?').get(email) as any;
      if (!vendor) {
        const vId = `vnd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        db.prepare(`
          INSERT INTO vendors (id, company_name, contact_person, email, phone, gstin, pan, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
        `).run(vId, company_name, contact_person || 'Representative', email, phone || '9999999999', gstin || null, pan || null);
        vendor = { id: vId };
      }

      db.prepare(`
        INSERT OR IGNORE INTO company_vendors (company_id, vendor_id)
        VALUES (?, ?)
      `).run(companyId, vendor.id);

      return vendor.id;
    });

    try {
      const vendorId = transaction();
      res.json({ success: true, vendorId });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ==========================================
  // 4. AUCTION MANAGEMENT REST APIS
  // ==========================================
  // Overview of all auctions, vendors, and invites
  app.get('/api/admin/overview', (_req, res) => {
    const auctions = db.prepare(`
      SELECT a.*, o.name as customer_name,
        (SELECT COUNT(*) FROM lots WHERE auction_id = a.id) as lot_count
      FROM auctions a
      LEFT JOIN organizations o ON a.customer_org_id = o.id
      ORDER BY a.created_at DESC
    `).all();

    const vendors = db.prepare('SELECT * FROM vendors ORDER BY created_at DESC').all();

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

  // Auto-generate next sequential Auction ID based on Company
  app.get('/api/admin/next-auction-id', (req, res) => {
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

  // Get single auction with lots & assigned vendors (for editing)
  app.get('/api/admin/auctions/:id', (req, res) => {
    const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(req.params.id) as any;
    if (!auction) return res.status(404).json({ error: 'Auction not found' });

    const lots = repo.getLotsForAuction(req.params.id);
    const assignedVendors = db.prepare(`
      SELECT i.id as invite_id, i.token, i.role, v.id as vendor_id, v.company_name, v.email, v.phone, v.status as vendor_status
      FROM auction_invites i
      LEFT JOIN vendors v ON i.vendor_id = v.id
      WHERE i.auction_id = ?
    `).all(req.params.id);

    res.json({ auction, lots, assignedVendors });
  });

  // Create new auction
  app.post('/api/admin/auctions', (req, res) => {
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

      // Add & invite customer-provided vendors
      if (Array.isArray(customerVendors)) {
        customerVendors.forEach((cv: any) => {
          if (!cv.email) return;
          let vendor = db.prepare('SELECT id FROM vendors WHERE email = ?').get(cv.email) as any;
          if (!vendor) {
            const vId = `vnd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            db.prepare(`
              INSERT INTO vendors (id, company_name, contact_person, email, phone, status)
              VALUES (?, ?, ?, ?, ?, 'approved')
            `).run(vId, cv.company_name || cv.email, cv.contact_person || 'Representative', cv.email, cv.phone || '9999999999');
            vendor = { id: vId };
          }

          // Link to company pool
          db.prepare('INSERT OR IGNORE INTO company_vendors VALUES (?, ?)').run(customer_org_id, vendor.id);

          // Generate invite
          const token = generateMagicToken();
          db.prepare(`
            INSERT INTO auction_invites (id, auction_id, vendor_id, role, token, expires_at)
            VALUES (?, ?, ?, 'vendor', ?, datetime('now', '+7 days'))
          `).run(`inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, id, vendor.id, token);
        });
      }
    });

    try {
      transaction();
      res.json({ success: true, auctionId: id });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

    // Invite vendor & generate magic link
  app.post('/api/admin/auctions/:id/invite', (req, res) => {
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

  // Edit / Update an existing auction
  app.put('/api/admin/auctions/:id', (req, res) => {
    const auctionId = req.params.id;
    const { title, scheduled_start, duration_minutes, anti_sniping_minutes, max_buffer_minutes, lots, customerVendors, notify_vendors } = req.body;

    const existing = db.prepare('SELECT status FROM auctions WHERE id = ?').get(auctionId) as any;
    if (!existing) return res.status(404).json({ error: 'Auction not found.' });
    if (existing.status === 'ended') return res.status(400).json({ error: 'Cannot edit an ended auction.' });

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

      if (Array.isArray(customerVendors)) {
        customerVendors.forEach((cv: any) => {
          if (!cv.email) return;
          let vendor = db.prepare('SELECT id FROM vendors WHERE email = ?').get(cv.email) as any;
          if (!vendor) {
            const vId = `vnd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            db.prepare(`
              INSERT INTO vendors (id, company_name, contact_person, email, phone, status)
              VALUES (?, ?, ?, ?, ?, 'approved')
            `).run(vId, cv.company_name || cv.email, cv.contact_person || 'Representative', cv.email, cv.phone || '9999999999');
            vendor = { id: vId };
          }

          const hasInvite = db.prepare('SELECT id FROM auction_invites WHERE auction_id = ? AND vendor_id = ?').get(auctionId, vendor.id);
          if (!hasInvite) {
            const token = generateMagicToken();
            db.prepare(`
              INSERT INTO auction_invites (id, auction_id, vendor_id, role, token, expires_at)
              VALUES (?, ?, ?, 'vendor', ?, datetime('now', '+7 days'))
            `).run(`inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, auctionId, vendor.id, token);
          }
        });
      }
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

  // Approve a vendor KYC
  app.post('/api/admin/vendors/:id/approve', (req, res) => {
    try {
      db.prepare("UPDATE vendors SET status = 'approved' WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Download official settlement PDF
  app.get('/api/admin/auctions/:id/pdf', async (req, res) => {
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

  // Room state for bidding room
  app.get('/api/auctions/:id/room-state', (req, res) => {
    const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(req.params.id);
    if (!auction) return res.status(404).json({ error: 'Auction not found' });
    const lots = repo.getLotsForAuction(req.params.id);
    res.json({ auction, lots });
  });

  // ==========================================
  // 5. WEBSOCKET REAL-TIME BIDDING ENGINE
  // ==========================================
  io.on('connection', (socket: Socket) => {
    socket.on('join_room', (data: { auctionId: string; token: string }) => {
      const invite = db
        .prepare(`
          SELECT i.*, v.company_name as vendorCompanyName, v.status as vendorStatus 
          FROM auction_invites i 
          LEFT JOIN vendors v ON i.vendor_id = v.id 
          WHERE i.token = ? AND i.auction_id = ?
        `)
        .get(data.token, data.auctionId) as (InviteRecord & { vendor_id?: string }) | undefined;

      if (invite) {
        invite.expiresAt = new Date(invite.expiresAt);
      }

      const auth = verifyInviteToken(invite);
      if (!auth.isAuthorized) {
        return socket.emit('error_message', { code: auth.errorCode, message: auth.errorMessage });
      }

      socket.data = {
        auctionId: data.auctionId,
        role: auth.role,
        vendorId: invite?.vendor_id,
        companyName: auth.companyName,
      };

      const roomName = `auction:${data.auctionId}`;
      socket.join(roomName);

      const lots = repo.getLotsForAuction(data.auctionId);
      socket.emit('room_joined', {
        auctionId: data.auctionId,
        role: auth.role,
        companyName: auth.companyName,
        lots,
      });
    });

    socket.on('submit_bid', (data: { lotId: string; amount: number }) => {
      const session = socket.data;

      if (!session || !session.auctionId) {
        return socket.emit('error_message', { code: 'UNAUTHORIZED', message: 'You must join the room first.' });
      }

      if (session.role === 'customer_observer') {
        return socket.emit('error_message', {
          code: 'OBSERVER_CANNOT_BID',
          message: 'Customer Observers are in read-only mode and cannot place bids.',
        });
      }

      const prevLot = db.prepare('SELECT current_l1_vendor_id FROM lots WHERE id = ?').get(data.lotId) as { current_l1_vendor_id: string | null } | undefined;
      const previousL1VendorId = prevLot?.current_l1_vendor_id;

      try {
        const bidResult = repo.placeBid(data.lotId, session.vendorId, data.amount);
        const roomName = `auction:${session.auctionId}`;

        io.to(roomName).emit('bid_placed', {
          lotId: data.lotId,
          amount: bidResult.amount,
          newMaxAllowedBid: bidResult.newMaxAllowedBid,
          vendorCompanyName: session.companyName,
          timestamp: new Date().toISOString(),
        });

        if (previousL1VendorId && previousL1VendorId !== session.vendorId) {
          io.to(roomName).emit('outbid_alert', {
            lotId: data.lotId,
            outbidVendorId: previousL1VendorId,
            newLowestBid: bidResult.amount,
          });
        }

        const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(session.auctionId) as any;
        if (auction) {
          const config: AuctionTimerConfig = {
            scheduledStartTime: new Date(auction.scheduled_start),
            scheduledEndTime: new Date(auction.scheduled_end),
            antiSnipingTriggerMinutes: auction.anti_sniping_minutes,
            extensionStepMinutes: auction.extension_step_minutes,
            maxBufferMinutes: auction.max_buffer_minutes,
          };

          const currentEnd = new Date(auction.current_end);
          const extension = evaluateAntiSniping(config, currentEnd);

          if (extension.extended) {
            db.prepare('UPDATE auctions SET current_end = ?, status = ? WHERE id = ?')
              .run(extension.newEndTime.toISOString(), 'extended', session.auctionId);

            io.to(roomName).emit('auction_extended', {
              newEndTime: extension.newEndTime.toISOString(),
              isHardStopReached: extension.isHardStopReached,
            });
          }
        }
      } catch (err: any) {
        socket.emit('error_message', { code: 'INVALID_BID', message: err.message });
      }
    });
  });

  // ==========================================
  // 6. 1-SECOND NTP CLOCK TICKER
  // ==========================================
  const ticker = setInterval(() => {
    const activeAuctions = db.prepare("SELECT * FROM auctions WHERE status IN ('live', 'extended', 'scheduled')").all() as any[];
    for (const auction of activeAuctions) {
      const config: AuctionTimerConfig = {
        scheduledStartTime: new Date(auction.scheduled_start),
        scheduledEndTime: new Date(auction.scheduled_end),
        antiSnipingTriggerMinutes: auction.anti_sniping_minutes,
        extensionStepMinutes: auction.extension_step_minutes,
        maxBufferMinutes: auction.max_buffer_minutes,
      };
      const state = getAuctionTimerState(config, new Date(auction.current_end));

      const hours = Math.floor(state.remainingSeconds / 3600);
      const minutes = Math.floor((state.remainingSeconds % 3600) / 60);
      const seconds = state.remainingSeconds % 60;
      const formattedTime = `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;

      io.to(`auction:${auction.id}`).emit('clock_tick', {
        remainingSeconds: state.remainingSeconds,
        formattedTime,
        status: state.status,
        isHardStopReached: state.isHardStopReached,
      });

      if (state.status === 'ended' && auction.status !== 'ended') {
        db.prepare("UPDATE auctions SET status = 'ended' WHERE id = ?").run(auction.id);
        io.to(`auction:${auction.id}`).emit('auction_ended', { auctionId: auction.id });
      }
    }
  }, 1000);

  httpServer.on('close', () => clearInterval(ticker));

  return { app, httpServer, io };
}