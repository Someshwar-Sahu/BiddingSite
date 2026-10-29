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
  router.get('/live-auction/:id', (_req, res) => res.sendFile(path.resolve('public/index.html')));

  // Admin dedicated pages
  router.get('/admin', (_req, res) => res.redirect('/admin/auctions'));
  router.get('/admin/auctions', (_req, res) => res.sendFile(path.resolve('public/admin/auctions.html')));
  router.get('/admin/auction-editor', (_req, res) => res.sendFile(path.resolve('public/admin/auction-editor.html')));
  router.get('/admin/clients', (_req, res) => res.sendFile(path.resolve('public/admin/clients.html')));
  router.get('/admin/vendors', (_req, res) => res.sendFile(path.resolve('public/admin/vendors.html')));

  // Live bidding room state
  router.get('/api/auctions/:id/room-state', (req, res) => {
    const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(req.params.id);
    if (!auction) return res.status(404).json({ error: 'Auction not found' });
    const lots = repo.getLotsForAuction(req.params.id);
    res.json({ auction, lots });
  });

  return router;
}

