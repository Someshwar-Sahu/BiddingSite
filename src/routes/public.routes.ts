import path from 'path';
import fs from 'fs';
import { Router } from 'express';
import Database from 'better-sqlite3';
import { AuctionRepository } from '../auction-repository.js';
import { requireAdminAuth, requireCustomerAuth, parseCookies, validateSession } from '../auth.js';

export function createPublicRouter(repo: AuctionRepository, db: Database.Database): Router {
  const router = Router();

  // Health check
  router.get('/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // ==========================================
  // REALM 1: ADMIN OPERATIONS DESK (ISOLATED)
  // ==========================================
  router.get('/admin/login', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['nta_admin_session'];
    if (token && validateSession(db, token, 'admin')) {
      return res.redirect('/admin/auctions');
    }
    res.sendFile(path.resolve('private/admin/login.html'));
  });

  // Guard all admin page views with requireAdminAuth
  const adminAuth = requireAdminAuth(db);

  const sendAdminBundle = (_req: any, res: any) => {
    const viteDistTop = path.resolve('dist/client/admin.html');
    const viteDistNested = path.resolve('dist/client/client/admin.html');
    if (fs.existsSync(viteDistTop)) return res.sendFile(viteDistTop);
    if (fs.existsSync(viteDistNested)) return res.sendFile(viteDistNested);
    res.status(500).send('Admin React bundle not found. Please run: npm run build:client');
  };

  const sendCustomerBundle = (_req: any, res: any) => {
    const viteDistTop = path.resolve('dist/client/customer.html');
    const viteDistNested = path.resolve('dist/client/client/customer.html');
    if (fs.existsSync(viteDistTop)) return res.sendFile(viteDistTop);
    if (fs.existsSync(viteDistNested)) return res.sendFile(viteDistNested);
    res.status(500).send('Customer React bundle not found. Please run: npm run build:client');
  };

  router.get('/admin', adminAuth, (_req, res) => res.redirect('/admin/auctions'));
  router.get('/admin/auctions', adminAuth, sendAdminBundle);
  router.get('/admin/auction-editor', adminAuth, (_req, res) => res.sendFile(path.resolve('private/admin/auction-editor.html')));
  router.get('/admin/clients', adminAuth, (_req, res) => res.sendFile(path.resolve('private/admin/clients.html')));
  router.get('/admin/vendors', adminAuth, (_req, res) => res.sendFile(path.resolve('private/admin/vendors.html')));

  // ==========================================
  // REALM 2: CORPORATE BUYER WORKSPACE (TENANT ISOLATED)
  // ==========================================
  router.get('/customer/login', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['nta_customer_session'];
    if (token && validateSession(db, token, 'customer')) {
      return res.redirect('/customer/dashboard');
    }
    res.sendFile(path.resolve('public/customer/login.html'));
  });

  const customerAuth = requireCustomerAuth(db);

  router.get('/customer', customerAuth, (_req, res) => res.redirect('/customer/dashboard'));
  router.get('/customer/dashboard', customerAuth, sendCustomerBundle);
  router.get('/customer/request-tender', customerAuth, (_req, res) => {
    res.sendFile(path.resolve('private/customer/request-tender.html'));
  });
  router.get('/customer/auctions/:id', customerAuth, (_req, res) => {
    res.sendFile(path.resolve('private/customer/auction-detail.html'));
  });
  router.get('/customer-request', (_req, res) => res.redirect('/customer/request-tender'));

  // Executive Read-Only Spectator / Observer Room
  router.get('/observer/:id', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);

    // 1. Direct Access for Authenticated Corporate Buyer (Owner)
    const custSession = validateSession(db, cookies['nta_customer_session']);
    if (custSession && custSession.role === 'customer' && custSession.organizationId) {
      const auction = db.prepare('SELECT customer_org_id FROM auctions WHERE id = ?').get(req.params.id) as any;
      if (auction && auction.customer_org_id === custSession.organizationId) {
        return res.sendFile(path.resolve('public/customer-observer.html'));
      }
    }

    // 2. Direct Access for Authenticated Admin / Operations Desk
    const adminSession = validateSession(db, cookies['nta_admin_session']);
    if (adminSession && adminSession.role === 'admin') {
      return res.sendFile(path.resolve('public/customer-observer.html'));
    }

    // 3. Fallback for External Tokenized Spectator Links (?key=token_...)
    const token = req.query.key as string;
    if (token) {
      try {
        const invite = db
          .prepare('SELECT role, is_revoked, expires_at FROM auction_invites WHERE token = ? AND auction_id = ?')
          .get(token, req.params.id) as any;
        if (invite && invite.role === 'customer_observer' && !invite.is_revoked) {
          return res.sendFile(path.resolve('public/customer-observer.html'));
        }
      } catch (e) {
        // Fallback
      }
    }

    // If neither authenticated nor presenting a valid token:
    res.status(403).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head><meta charset="UTF-8"><title>Observer Access Denied - NexTrade</title><script src="https://cdn.tailwindcss.com"></script></head>
      <body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-4">
        <div class="max-w-md w-full bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center space-y-4">
          <div class="text-red-400 text-4xl">🔒</div>
          <h1 class="text-xl font-bold">Unauthorized Spectator Session</h1>
          <p class="text-xs text-slate-400">Please sign in to your corporate buyer workspace or click the official invitation link to access this auction room.</p>
          <a href="/customer/login" class="inline-block bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-lg text-xs">Customer Login</a>
        </div>
      </body>
      </html>
    `);
  });

  // ==========================================
  // REALM 3: SUPPLIER BIDDING ROOM (TOKENIZED)
  // ==========================================
  router.get('/', (_req, res) => res.sendFile(path.resolve('public/index.html')));

  router.get('/live-auction/:id', (req, res) => {
    const token = req.query.key as string;
    if (!token) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><title>Invitation Required - NexTrade</title><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-4">
          <div class="max-w-md w-full bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center space-y-4">
            <div class="text-amber-400 text-4xl">⚠️</div>
            <h1 class="text-xl font-bold">Vendor Magic Link Required</h1>
            <p class="text-xs text-slate-400">NexTrade live bidding rooms require an authorized invitation key. Please click the full invitation link received in your email or WhatsApp notification.</p>
            <div class="p-3 bg-slate-900 rounded-lg text-[11px] text-slate-400 font-mono">Example: /live-auction/${req.params.id}?key=token_...</div>
          </div>
        </body>
        </html>
      `);
    }

    try {
      const invite = db
        .prepare('SELECT role, is_revoked, expires_at FROM auction_invites WHERE token = ? AND auction_id = ?')
        .get(token, req.params.id) as any;

      if (!invite || invite.is_revoked) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head><meta charset="UTF-8"><title>Invalid Invitation - NexTrade</title><script src="https://cdn.tailwindcss.com"></script></head>
          <body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-4">
            <div class="max-w-md w-full bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center space-y-4">
              <div class="text-red-400 text-4xl">🚫</div>
              <h1 class="text-xl font-bold">Invalid or Revoked Invitation</h1>
              <p class="text-xs text-slate-400">The access token provided does not match any authorized supplier for auction <strong>${req.params.id}</strong>.</p>
            </div>
          </body>
          </html>
        `);
      }

      if (invite.role === 'customer_observer') {
        return res.redirect(`/observer/${req.params.id}?key=${encodeURIComponent(token)}`);
      }

      // Valid supplier token
      res.sendFile(path.resolve('public/index.html'));
    } catch (e) {
      res.sendFile(path.resolve('public/index.html'));
    }
  });

  // Live bidding room state & audit log
  router.get('/api/auctions/:id/room-state', (req, res) => {
    const auction = db
      .prepare(`
        SELECT a.*, o.name as customer_name, o.gstin as customer_gstin 
        FROM auctions a 
        LEFT JOIN organizations o ON a.customer_org_id = o.id 
        WHERE a.id = ?
      `)
      .get(req.params.id) as any;

    if (!auction) return res.status(404).json({ error: 'Auction not found' });

    // Dynamic timer check: Auto-sync 'ended' status in DB if duration elapsed
    if (auction.status === 'live' || auction.status === 'extended') {
      const now = new Date();
      const endTime = new Date(auction.current_end);
      if (now >= endTime) {
        db.prepare("UPDATE auctions SET status = 'ended' WHERE id = ?").run(auction.id);
        auction.status = 'ended';
      }
    }

    const lots = repo.getLotsForAuction(req.params.id);
    const bids = db
      .prepare(`
        SELECT b.*, v.company_name as vendor_name, l.product_name, l.uom, l.reserve_price
        FROM bids b 
        JOIN lots l ON b.lot_id = l.id 
        JOIN vendors v ON b.vendor_id = v.id 
        WHERE l.auction_id = ? 
        ORDER BY b.created_at DESC 
        LIMIT 100
      `)
      .all(req.params.id);

    res.json({ auction, lots, bids });
  });

  return router;
}
