import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type http from 'http';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db.js';
import { createAuctionServer } from '../../src/server.js';

describe('Admin REST API Integration', () => {
  let db: Database.Database;
  let httpServer: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = initializeDatabase(':memory:');

    // Seed test organization
    db.prepare("INSERT INTO organizations VALUES ('org_epack', 'Epack Petrochem', '03AAPCP3056IZE', 'epack@test.com', '9876543210', datetime('now'))").run();
    db.prepare("INSERT INTO vendors VALUES ('vnd_pending', 'New Vendor Corp', 'Sunil', 'sunil@test.com', '9876543210', '27AAPFU0939F1ZV', 'AAPFU0939F', 'pending_approval', datetime('now'))").run();

    const serverInstance = createAuctionServer(db);
    httpServer = serverInstance.httpServer;

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address() as any;
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    httpServer?.close();
  });

  // ==========================================
  // POSITIVE TESTS (Happy Paths)
  // ==========================================
  describe('Positive Test Cases', () => {
    it('creates a new auction with lots and retrieves it in overview', async () => {
      const payload = {
        id: 'PTA-EPACKPetro-08',
        title: 'New Procurement Event',
        customer_org_id: 'org_epack',
        duration_minutes: 60,
        lots: [
          { product_name: 'Industrial Pallets', quantity: 1000, uom: 'Nos', start_price: 1500, reserve_price: 1600, bid_decrement: 10 },
        ],
      };

      const res = await fetch(`${baseUrl}/api/admin/auctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.auctionId).toBe('PTA-EPACKPetro-08');

      // Verify overview returns it
      const overviewRes = await fetch(`${baseUrl}/api/admin/overview`);
      const overview = await overviewRes.json();
      expect(overview.auctions.some((a: any) => a.id === 'PTA-EPACKPetro-08')).toBe(true);
    });

    it('approves a pending vendor', async () => {
      const res = await fetch(`${baseUrl}/api/admin/vendors/vnd_pending/approve`, { method: 'POST' });
      expect(res.status).toBe(200);

      const vendor = db.prepare("SELECT status FROM vendors WHERE id = 'vnd_pending'").get() as any;
      expect(vendor.status).toBe('approved');
    });

    it('generates a valid vendor magic link and WhatsApp URL', async () => {
      // First create auction
      db.prepare("INSERT INTO auctions VALUES ('PTA-01', 'Test', 'org_epack', datetime('now'), datetime('now', '+1 hour'), 60, 2, 3, 30, datetime('now', '+1 hour'), 'scheduled', datetime('now'))").run();

      const res = await fetch(`${baseUrl}/api/admin/auctions/PTA-01/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: 'vnd_pending', role: 'vendor' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.accessUrl).toContain('PTA-01?key=');
      expect(data.waUrl).toContain('https://wa.me/919876543210');
    });
  });

  // ==========================================
  // NEGATIVE TESTS (Boundaries & Rejections)
  // ==========================================
  describe('Negative Test Cases', () => {
    it('rejects auction creation when required fields are missing', async () => {
      const invalidPayload = { title: 'Missing ID and Org' };

      const res = await fetch(`${baseUrl}/api/admin/auctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPayload),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Missing required');
    });

    it('rejects duplicate auction IDs', async () => {
      const payload = { id: 'DUP-01', title: 'First', customer_org_id: 'org_epack' };

      await fetch(`${baseUrl}/api/admin/auctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Second attempt with same ID
      const dupRes = await fetch(`${baseUrl}/api/admin/auctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(dupRes.status).toBe(400);
    });
  });
});