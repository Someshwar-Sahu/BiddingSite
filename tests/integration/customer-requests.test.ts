import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type http from 'http';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db.js';
import { createAuctionServer } from '../../src/server.js';

describe('Customer Tender Request Intake & Admin Conversion Integration', () => {
  let db: Database.Database;
  let httpServer: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = initializeDatabase(':memory:');

    // Seed test organization
    db.prepare("INSERT INTO organizations VALUES ('org_epack', 'Epack Petrochem Solutions', '03AAPCP3056IZE', 'procurement@epack.in', '9876543210', datetime('now'))").run();

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
    it('fetches corporate buyer profile with facilities and approved vendor pool', async () => {
      // Seed a facility and a vendor
      db.prepare("INSERT INTO organization_facilities VALUES ('fac_dahej', 'org_epack', 'Dahej Plant', 'Dahej', 'Gujarat', 'Plot 42', datetime('now'))").run();
      db.prepare("INSERT INTO vendors VALUES ('vnd_gold', 'Gold Global', 'Harsh', 'gold@test.com', '9876543210', '27AAPFU0939F1ZV', 'AAPFU0939F', 'approved', datetime('now'))").run();
      db.prepare("INSERT INTO company_vendors VALUES ('org_epack', 'vnd_gold', datetime('now'))").run();

      const res = await fetch(`${baseUrl}/api/customer/profile?org=org_epack`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.organization.name).toBe('Epack Petrochem Solutions');
      expect(data.facilities).toHaveLength(1);
      expect(data.facilities[0].facility_name).toBe('Dahej Plant');
      expect(data.vendorPool).toHaveLength(1);
      expect(data.vendorPool[0].company_name).toBe('Gold Global');
    });

    it('allows corporate buyer to register a new plant facility', async () => {
      const res = await fetch(`${baseUrl}/api/customer/facilities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: 'org_epack',
          facility_name: 'Bhiwadi Packaging Hub',
          city: 'Bhiwadi',
          state: 'Rajasthan',
          address: 'RIICO Phase III',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.facility.facility_name).toBe('Bhiwadi Packaging Hub');

      const saved = db.prepare("SELECT * FROM organization_facilities WHERE facility_name = 'Bhiwadi Packaging Hub'").get() as any;
      expect(saved).toBeTruthy();
      expect(saved.city).toBe('Bhiwadi');
    });

    it('submits a new customer tender request with multiple lots', async () => {
      const payload = {
        company_name: 'Epack Petrochem Solutions',
        customer_org_id: 'org_epack',
        contact_person: 'Saurabh Verma',
        email: 'procurement@epack.in',
        phone: '9876543210',
        title: 'Q4 Polymer & Solvent Sourcing',
        category: 'Petrochemicals',
        duration_minutes: 45,
        delivery_location: 'Dahej, Gujarat',
        special_terms: 'Payment 30 days post-delivery',
        lots: [
          { product_name: 'HDPE Drums 200L', category: 'Packaging', quantity: 2000, uom: 'Nos', reserve_price: 1200, bid_decrement: 10 },
          { product_name: 'Industrial Solvent Grade-A', category: 'Chemicals', quantity: 100, uom: 'MT', reserve_price: 50000, bid_decrement: 200 },
        ],
        suggested_vendors: [
          { company_name: 'Apex Drums Ltd', contact_person: 'Karan', phone: '9811223344', email: 'apex@test.com' },
        ],
      };

      const res = await fetch(`${baseUrl}/api/customer/tender-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.requestId).toBeTruthy();
      expect(data.requestNumber).toMatch(/^REQ-EPACK-\d{2}$/);

      // Verify stored in DB
      const row = db.prepare('SELECT * FROM tender_requests WHERE id = ?').get(data.requestId) as any;
      expect(row.status).toBe('pending_review');
      expect(row.title).toBe('Q4 Polymer & Solvent Sourcing');
      const lots = JSON.parse(row.lots_json);
      expect(lots).toHaveLength(2);
      expect(lots[0].product_name).toBe('HDPE Drums 200L');
    });

    it('allows Admin to review and convert a tender request into an active auction event', async () => {
      // 1. Submit request
      const submitRes = await fetch(`${baseUrl}/api/customer/tender-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: 'Epack Petrochem Solutions',
          customer_org_id: 'org_epack',
          contact_person: 'Saurabh Verma',
          email: 'procurement@epack.in',
          phone: '9876543210',
          title: 'Immediate Scrap Disposal Tender',
          category: 'Scrap',
          lots: [
            { product_name: 'Heavy Melting Steel Scrap', quantity: 500, uom: 'MT', reserve_price: 32000, bid_decrement: 100 },
          ],
        }),
      });

      const submitData = await submitRes.json();
      const requestId = submitData.requestId;

      // 2. Admin converts the request to an auction
      const convertRes = await fetch(`${baseUrl}/api/admin/tender-requests/${requestId}/convert`, {
        method: 'POST',
      });

      expect(convertRes.status).toBe(200);
      const convertData = await convertRes.json();
      expect(convertData.success).toBe(true);
      expect(convertData.auctionId).toMatch(/^NTA-EpackPetro-\d{2}$/);
      expect(convertData.observerUrl).toContain('/observer/');

      // 3. Verify auction and lots created in database
      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(convertData.auctionId) as any;
      expect(auction).toBeTruthy();
      expect(auction.title).toBe('Immediate Scrap Disposal Tender');

      const lots = db.prepare('SELECT * FROM lots WHERE auction_id = ?').all(convertData.auctionId) as any[];
      expect(lots).toHaveLength(1);
      expect(lots[0].product_name).toBe('Heavy Melting Steel Scrap');
      expect(lots[0].reserve_price).toBe(32000);
      expect(lots[0].start_price).toBe(31900); // reserve_price - bid_decrement

      // 4. Verify customer observer invite token was created
      const invite = db.prepare("SELECT * FROM auction_invites WHERE auction_id = ? AND role = 'customer_observer'").get(convertData.auctionId) as any;
      expect(invite).toBeTruthy();
      expect(invite.token).toBeTruthy();

      // 5. Verify tender request marked as approved
      const updatedReq = db.prepare('SELECT * FROM tender_requests WHERE id = ?').get(requestId) as any;
      expect(updatedReq.status).toBe('approved');
      expect(updatedReq.converted_auction_id).toBe(convertData.auctionId);
    });
  });

  // ==========================================
  // NEGATIVE TESTS (Validation & Error Handling)
  // ==========================================
  describe('Negative Test Cases', () => {
    it('rejects tender request when required fields are missing', async () => {
      const res = await fetch(`${baseUrl}/api/customer/tender-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: 'Incomplete Corp',
          // missing contact_person, email, phone, title
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeTruthy();
    });

    it('rejects tender request when lots array is empty', async () => {
      const res = await fetch(`${baseUrl}/api/customer/tender-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: 'Valid Corp',
          contact_person: 'John Doe',
          email: 'john@valid.com',
          phone: '9876543210',
          title: 'Empty Tender',
          lots: [],
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('lot');
    });

    it('returns 404 when converting non-existent request', async () => {
      const res = await fetch(`${baseUrl}/api/admin/tender-requests/req_non_existent/convert`, {
        method: 'POST',
      });

      expect(res.status).toBe(404);
    });
  });
});

