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

    it('creates a custom vendor during auction creation and auto-includes them in master vendors and company pool', async () => {
      const payload = {
        id: 'NTA-CUSTOM-01',
        title: 'Custom Vendor Tender',
        customer_org_id: 'org_epack',
        duration_minutes: 45,
        lots: [
          { product_name: 'Coal', quantity: 500, uom: 'MT', start_price: 10000, reserve_price: 10000, bid_decrement: 50 },
        ],
        customerVendors: [
          {
            company_name: 'Apex Petro Supplies',
            contact_person: 'Vikram Singh',
            email: 'vikram@apexpetro.com',
            phone: '9876500001',
          },
        ],
      };

      const res = await fetch(`${baseUrl}/api/admin/auctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);

      // Verify custom vendor was inserted into master vendors table
      const vendor = db.prepare("SELECT * FROM vendors WHERE email = 'vikram@apexpetro.com'").get() as any;
      expect(vendor).toBeDefined();
      expect(vendor.company_name).toBe('Apex Petro Supplies');
      expect(vendor.contact_person).toBe('Vikram Singh');
      expect(vendor.phone).toBe('9876500001');
      expect(vendor.status).toBe('approved');

      // Verify custom vendor is linked to the corporate client's pool
      const poolEntry = db.prepare('SELECT * FROM company_vendors WHERE company_id = ? AND vendor_id = ?').get('org_epack', vendor.id);
      expect(poolEntry).toBeDefined();

      // Verify vendor has an active invite in auction_invites
      const invite = db.prepare('SELECT * FROM auction_invites WHERE auction_id = ? AND vendor_id = ?').get('NTA-CUSTOM-01', vendor.id);
      expect(invite).toBeDefined();
    });

    it('gracefully handles custom vendors with less input without violating DB constraints', async () => {
      const payload = {
        id: 'NTA-LESS-INPUT-01',
        title: 'Partial Input Tender',
        customer_org_id: 'org_epack',
        duration_minutes: 30,
        lots: [
          { product_name: 'Pallets', quantity: 100, uom: 'Nos', start_price: 1500, reserve_price: 1400, bid_decrement: 10 },
        ],
        customerVendors: [
          // Vendor A: Only company name and email (missing phone, contact person, GSTIN)
          { company_name: 'Minimal Vendor Ltd', email: 'minimal@vendor.com' },
          // Vendor B: Only company name and phone (missing email)
          { company_name: 'Phone Only Supplier', phone: '9811223344' },
        ],
      };

      const res = await fetch(`${baseUrl}/api/admin/auctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);

      // Verify Vendor A (missing phone) received non-null fallback and was created
      const vendorA = db.prepare("SELECT * FROM vendors WHERE email = 'minimal@vendor.com'").get() as any;
      expect(vendorA).toBeDefined();
      expect(vendorA.company_name).toBe('Minimal Vendor Ltd');
      expect(vendorA.contact_person).toBe('Representative');
      expect(vendorA.phone).toBe('N/A');

      // Verify Vendor B (missing email) received valid unique auto-derived email and was created
      const vendorB = db.prepare("SELECT * FROM vendors WHERE company_name = 'Phone Only Supplier'").get() as any;
      expect(vendorB).toBeDefined();
      expect(vendorB.phone).toBe('9811223344');
      expect(vendorB.email).toContain('@vendor.nextradeauctions.com');

      // Verify both are linked in company_vendors
      const poolEntries = db.prepare("SELECT * FROM company_vendors WHERE company_id = 'org_epack'").all();
      expect(poolEntries.length).toBeGreaterThanOrEqual(2);
    });

    it('updates an existing auction and adds new custom vendor to master list and company pool', async () => {
      // Create initial auction
      const payload = {
        id: 'NTA-EDIT-01',
        title: 'Initial Title',
        customer_org_id: 'org_epack',
        lots: [{ product_name: 'Item A', quantity: 50, uom: 'MT', start_price: 500, reserve_price: 500, bid_decrement: 5 }],
      };
      await fetch(`${baseUrl}/api/admin/auctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Update with new custom vendor
      const updatePayload = {
        title: 'Updated Title',
        lots: [{ product_name: 'Item A', quantity: 50, uom: 'MT', start_price: 500, reserve_price: 500, bid_decrement: 5 }],
        customerVendors: [
          { company_name: 'Newly Added Custom Supplier', email: 'newcustom@supplier.in', phone: '9988776655' },
        ],
      };

      const putRes = await fetch(`${baseUrl}/api/admin/auctions/NTA-EDIT-01`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });

      expect(putRes.status).toBe(200);

      // Verify newly added custom vendor exists in vendors and company_vendors
      const newVendor = db.prepare("SELECT * FROM vendors WHERE email = 'newcustom@supplier.in'").get() as any;
      expect(newVendor).toBeDefined();
      expect(newVendor.company_name).toBe('Newly Added Custom Supplier');

      const companyLink = db.prepare('SELECT * FROM company_vendors WHERE company_id = ? AND vendor_id = ?').get('org_epack', newVendor.id);
      expect(companyLink).toBeDefined();
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
