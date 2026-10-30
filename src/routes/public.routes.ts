import path from 'path';
import { Router } from 'express';
import Database from 'better-sqlite3';
import { AuctionRepository } from '../auction-repository.js';

export function createPublicRouter(repo: AuctionRepository, db: Database.Database): Router {
  const router = Router();

  // Health check
  router.get('/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Client pages
  router.get('/', (_req, res) => res.sendFile(path.resolve('public/index.html')));
  router.get('/live-auction/:id', (req, res) => {
    const token = req.query.key as string;
    if (token) {
      try {
        const invite = db
          .prepare('SELECT role FROM auction_invites WHERE token = ? AND auction_id = ?')
          .get(token, req.params.id) as { role: string } | undefined;
        if (invite?.role === 'customer_observer') {
          return res.redirect(`/observer/${req.params.id}?key=${encodeURIComponent(token)}`);
        }
      } catch (e) {
        // Fallback to serving index.html if db query fails
      }
    }
    res.sendFile(path.resolve('public/index.html'));
  });
  router.get('/observer/:id', (_req, res) => res.sendFile(path.resolve('public/customer-observer.html')));

  // Customer Tender Request / Creation Page
  router.get('/customer/request-tender', (_req, res) => res.sendFile(path.resolve('public/customer/request-tender.html')));
  router.get('/customer-request', (_req, res) => res.redirect('/customer/request-tender'));

  // Admin dedicated pages
  router.get('/admin', (_req, res) => res.redirect('/admin/auctions'));
  router.get('/admin/auctions', (_req, res) => res.sendFile(path.resolve('public/admin/auctions.html')));
  router.get('/admin/auction-editor', (_req, res) => res.sendFile(path.resolve('public/admin/auction-editor.html')));
  router.get('/admin/clients', (_req, res) => res.sendFile(path.resolve('public/admin/clients.html')));
  router.get('/admin/vendors', (_req, res) => res.sendFile(path.resolve('public/admin/vendors.html')));

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
