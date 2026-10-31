import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { AuctionRepository } from '../auction-repository.js';
import {
  requireAdminAuth,
  requireCustomerAuth,
  requireVendorAuth,
  parseCookies,
  validateSession,
  createSession,
} from '../auth.js';

export function createPublicRouter(repo: AuctionRepository, db: Database.Database): Router {
  const router = Router();

  // Health check
  router.get('/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // ==========================================
  // REALM 1: ADMIN OPERATIONS DESK (ISOLATED)
  // ==========================================
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

  const sendLandingBundle = (_req: any, res: any) => {
    const viteDistTop = path.resolve('dist/client/index.html');
    const viteDistNested = path.resolve('dist/client/client/index.html');
    if (fs.existsSync(viteDistTop)) return res.sendFile(viteDistTop);
    if (fs.existsSync(viteDistNested)) return res.sendFile(viteDistNested);
    res.redirect('/admin/auctions');
  };

  router.get('/admin/login', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['nta_admin_session'];
    if (token && validateSession(db, token, 'admin')) {
      return res.redirect('/admin/auctions');
    }
    return sendAdminBundle(req, res);
  });

  // Guard all admin page views with requireAdminAuth
  const adminAuth = requireAdminAuth(db);

  router.get('/admin', adminAuth, (_req, res) => res.redirect('/admin/auctions'));
  router.get('/admin/auctions', adminAuth, sendAdminBundle);
  router.get('/admin/auction-editor', adminAuth, sendAdminBundle);
  router.get('/admin/clients', adminAuth, sendAdminBundle);
  router.get('/admin/vendors', adminAuth, sendAdminBundle);

  // ==========================================
  // REALM 2: CORPORATE BUYER WORKSPACE (TENANT ISOLATED)
  // ==========================================
  router.get('/customer/login', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['nta_customer_session'];
    if (token && validateSession(db, token, 'customer')) {
      return res.redirect('/customer/dashboard');
    }
    return sendCustomerBundle(req, res);
  });

  const customerAuth = requireCustomerAuth(db);

  router.get('/customer', customerAuth, (_req, res) => res.redirect('/customer/dashboard'));
  router.get('/customer/dashboard', customerAuth, sendCustomerBundle);
  router.get('/customer/request-tender', customerAuth, sendCustomerBundle);
  router.get('/customer/auctions/:id', customerAuth, (_req, res) => {
    res.sendFile(path.resolve('private/customer/auction-detail.html'));
  });
  router.get('/customer-request', (_req, res) => res.redirect('/customer/request-tender'));

  const sendObserverBundle = (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.resolve('dist/client/observer.html'));
  };

  // Executive Read-Only Spectator / Observer Room
  router.get('/observer/:id', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);

    // 1. Direct Access for Authenticated Corporate Buyer (Owner)
    const custSession = validateSession(db, cookies['nta_customer_session']);
    if (custSession && custSession.role === 'customer' && custSession.organizationId) {
      const auction = db.prepare('SELECT customer_org_id FROM auctions WHERE id = ?').get(req.params.id) as any;
      if (auction && auction.customer_org_id === custSession.organizationId) {
        return sendObserverBundle(req, res);
      }
    }

    // 2. Direct Access for Authenticated Admin / Operations Desk
    const adminSession = validateSession(db, cookies['nta_admin_session']);
    if (adminSession && adminSession.role === 'admin') {
      return sendObserverBundle(req, res);
    }

    // 3. Fallback for External Tokenized Spectator Links (?key=token_...)
    const token = req.query.key as string;
    if (token) {
      try {
        const invite = db
          .prepare('SELECT role, is_revoked, expires_at FROM auction_invites WHERE token = ? AND auction_id = ?')
          .get(token, req.params.id) as any;
        if (invite && (invite.role === 'customer_observer' || invite.role === 'spectator') && !invite.is_revoked) {
          return sendObserverBundle(req, res);
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
  // REALM 3: SUPPLIER / VENDOR PLATFORM & BIDDING ROOM
  // ==========================================
  const sendVendorBundle = (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const viteDistTop = path.resolve('dist/client/vendor.html');
    const viteDistNested = path.resolve('dist/client/client/vendor.html');
    if (fs.existsSync(viteDistTop)) return res.sendFile(viteDistTop);
    if (fs.existsSync(viteDistNested)) return res.sendFile(viteDistNested);
    res.status(500).send('Vendor React bundle not found. Please run: npm run build:client');
  };

  // Vendor Portal Public Views (Login, Onboarding KYC, PIN Setup)
  router.get('/vendor/login', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['nta_vendor_session'];
    if (token && validateSession(db, token, 'vendor')) {
      return res.redirect('/vendor/dashboard');
    }
    return sendVendorBundle(req, res);
  });

  router.get(['/vendor/register', '/vendor/onboard', '/vendor/setup-pin'], (req, res) => {
    return sendVendorBundle(req, res);
  });

  const vendorAuth = requireVendorAuth(db);
  router.get('/vendor', vendorAuth, (_req, res) => res.redirect('/vendor/dashboard'));
  router.get('/vendor/dashboard', vendorAuth, sendVendorBundle);

  // Vendor Live Room Handler (supports both Tokenized URL & In-Session Cookie)
  const handleVendorBiddingAccess = (req: Request, res: Response) => {
    let token = req.query.key as string;

    // If no token in query, check if user has active vendor session cookie
    if (!token) {
      const cookies = parseCookies(req.headers.cookie);
      const vendorSession = validateSession(db, cookies['nta_vendor_session'], 'vendor');
      if (vendorSession && vendorSession.organizationId) {
        const invite = db
          .prepare('SELECT token FROM auction_invites WHERE auction_id = ? AND vendor_id = ? AND is_revoked = 0')
          .get(req.params.id, vendorSession.organizationId) as any;
        if (invite) {
          token = invite.token;
          return res.redirect(`/live-auction/${req.params.id}?key=${encodeURIComponent(token)}`);
        }
      }

      return res.status(403).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><title>Invitation Required - NexTrade</title><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-4">
          <div class="max-w-md w-full bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center space-y-4 shadow-xl">
            <div class="text-amber-400 text-4xl">⚠️</div>
            <h1 class="text-xl font-bold">Vendor Magic Link Required</h1>
            <p class="text-xs text-slate-400">NexTrade live bidding rooms require an authorized invitation key. Please click the full invitation link received in your email or WhatsApp notification.</p>
            <div class="p-3 bg-slate-900 rounded-xl text-[11px] text-slate-400 font-mono">Example: /live-auction/${req.params.id}?key=token_...</div>
            <div class="pt-2">
              <a href="/vendor/login" class="inline-block bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-lg text-xs">Supplier Portal Login</a>
            </div>
          </div>
        </body>
        </html>
      `);
    }

    try {
      const invite = db
        .prepare('SELECT role, is_revoked, expires_at, vendor_id FROM auction_invites WHERE token = ? AND auction_id = ?')
        .get(token, req.params.id) as any;

      if (!invite || invite.is_revoked) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head><meta charset="UTF-8"><title>Invalid Invitation - NexTrade</title><script src="https://cdn.tailwindcss.com"></script></head>
          <body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-4">
            <div class="max-w-md w-full bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center space-y-4 shadow-xl">
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

      // Valid supplier token -> Auto-establish persistent vendor session cookie (Tier 1 Gateway)
      if (invite.vendor_id) {
        const uId = `usr_${invite.vendor_id}`;
        const vnd = db.prepare('SELECT * FROM vendors WHERE id = ?').get(invite.vendor_id) as any;
        if (vnd) {
          db.prepare(`
            INSERT OR IGNORE INTO platform_users (id, email, password_hash, role, organization_id, full_name)
            VALUES (?, ?, ?, 'vendor', NULL, ?)
          `).run(uId, vnd.email.toLowerCase().trim(), vnd.password_hash || '', vnd.company_name);
        }
        const sessionId = createSession(db, uId, 'vendor', invite.vendor_id, 30);
        res.setHeader(
          'Set-Cookie',
          `nta_vendor_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`
        );
      }

      // Valid supplier token -> serve compiled React vendor bundle
      return sendVendorBundle(req, res);
    } catch (e) {
      return sendVendorBundle(req, res);
    }
  };

  router.get('/live-auction/:id', handleVendorBiddingAccess);
  router.get('/auction/:id', handleVendorBiddingAccess);

  // Unified Home Gateway Landing Page
  router.get('/', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies['nta_admin_session'] && validateSession(db, cookies['nta_admin_session'], 'admin')) {
      return res.redirect('/admin/auctions');
    }
    if (cookies['nta_customer_session'] && validateSession(db, cookies['nta_customer_session'], 'customer')) {
      return res.redirect('/customer/dashboard');
    }
    if (cookies['nta_vendor_session'] && validateSession(db, cookies['nta_vendor_session'], 'vendor')) {
      return res.redirect('/vendor/dashboard');
    }
    return sendLandingBundle(req, res);
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
