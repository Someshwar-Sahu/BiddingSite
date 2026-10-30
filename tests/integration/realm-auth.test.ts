import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type http from 'http';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db.js';
import { createAuctionServer } from '../../src/server.js';

describe('Zero-Trust Realm Security & Multi-Tenant Domain Isolation', () => {
  let db: Database.Database;
  let httpServer: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = initializeDatabase(':memory:');

    // Seed test enterprise organization
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
  // REALM 1: ADMIN OPERATIONS DESK
  // ==========================================
  describe('Realm 1: Admin Operations Security', () => {
    it('authenticates admin with valid credentials and sets HttpOnly session cookie', async () => {
      const res = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@nextradeauctions.com',
          password: 'NTA_Admin_2026!',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.sessionId).toBeTruthy();
      expect(data.user.email).toBe('admin@nextradeauctions.com');

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('nta_admin_session=');
      expect(setCookie).toContain('HttpOnly');
    });

    it('rejects unauthenticated or fraudulent admin login attempts', async () => {
      const res = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@nextradeauctions.com',
          password: 'WrongPassword!',
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Invalid admin credentials');
    });
  });

  // ==========================================
  // REALM 2: CUSTOMER CORPORATE WORKSPACE
  // ==========================================
  describe('Realm 2: Corporate Customer Multi-Tenant Isolation', () => {
    it('authenticates corporate buyer and establishes tenant-isolated session', async () => {
      const loginRes = await fetch(`${baseUrl}/api/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'procurement@epack.in',
          password: 'Epack_Buyer_2026!',
        }),
      });

      expect(loginRes.status).toBe(200);
      const loginData = await loginRes.json();
      expect(loginData.success).toBe(true);
      expect(loginData.user.organization_id).toBe('org_epack');

      const setCookie = loginRes.headers.get('set-cookie');
      expect(setCookie).toContain('nta_customer_session=');
    });

    it('rejects invalid customer credentials', async () => {
      const res = await fetch(`${baseUrl}/api/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'procurement@epack.in',
          password: 'BadPassword!',
        }),
      });

      expect(res.status).toBe(401);
    });

    it('retrieves comprehensive procurement dashboard KPIs and auctions for the authenticated buyer', async () => {
      // Seed a plant facility
      db.prepare("INSERT INTO organization_facilities VALUES ('fac_test', 'org_epack', 'Dahej Hub', 'Dahej', 'Gujarat', 'Plot 10', datetime('now'))").run();

      const res = await fetch(`${baseUrl}/api/customer/dashboard?org=org_epack`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.organization.id).toBe('org_epack');
      expect(data.kpis).toBeDefined();
      expect(data.facilities).toHaveLength(1);
      expect(data.facilities[0].facility_name).toBe('Dahej Hub');
    });

    it('retrieves detailed tender specifications and audit stream for middle page review', async () => {
      // Seed auction with lots
      db.prepare("INSERT INTO auctions (id, title, customer_org_id, scheduled_start, scheduled_end, duration_minutes, anti_sniping_minutes, extension_step_minutes, max_buffer_minutes, current_end, status, created_at) VALUES ('NTA-DETAIL-01', 'Middle Page Test', 'org_epack', datetime('now'), datetime('now', '+1 hour'), 60, 2, 3, 30, datetime('now', '+1 hour'), 'live', datetime('now'))").run();
      db.prepare("INSERT INTO lots (id, auction_id, lot_number, product_name, quantity, uom, start_price, reserve_price, bid_decrement) VALUES ('lot_det_1', 'NTA-DETAIL-01', 1, 'HDPE Granules', 100, 'MT', 90000, 95000, 500)").run();

      const res = await fetch(`${baseUrl}/api/customer/auctions/NTA-DETAIL-01?org=org_epack`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.auction.id).toBe('NTA-DETAIL-01');
      expect(data.lots).toHaveLength(1);
      expect(data.lots[0].product_name).toBe('HDPE Granules');
    });
  });

  // ==========================================
  // REALM 3: SUPPLIER TOKENIZED LIVE AUCTION
  // ==========================================
  describe('Realm 3: Supplier Tokenized Bidding Room', () => {
    it('rejects access to /live-auction/:id when no magic key token is provided', async () => {
      const res = await fetch(`${baseUrl}/live-auction/NTA-EPACKPetro-07`);
      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain('Vendor Magic Link Required');
    });

    it('rejects access when an invalid or expired token is provided', async () => {
      const res = await fetch(`${baseUrl}/live-auction/NTA-EPACKPetro-07?key=invalid_fake_token`);
      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain('Invalid or Revoked Invitation');
    });
  });

  // ==========================================
  // CONVERSION ENGINE SUPPLIER LINK CREATION
  // ==========================================
  describe('Intake Request to Live Auction Conversion Engine', () => {
    it('creates active vendor tokens for both pre-approved and custom invited suppliers upon conversion', async () => {
      // 1. Seed master vendor
      db.prepare("INSERT INTO vendors VALUES ('vnd_master_1', 'Premier Metals Ltd', 'Rajesh', 'premier@metals.com', '9811223344', '07AAPFU0939F1ZV', 'AAPFU0939F', 'approved', datetime('now'))").run();
      db.prepare("INSERT INTO company_vendors VALUES ('org_epack', 'vnd_master_1', datetime('now'))").run();

      // 2. Submit customer tender request with 1 pre-approved supplier and 1 brand-new custom vendor
      const submitRes = await fetch(`${baseUrl}/api/customer/tender-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: 'Epack Petrochem Solutions',
          customer_org_id: 'org_epack',
          contact_person: 'Saurabh Verma',
          email: 'procurement@epack.in',
          phone: '9876543210',
          title: 'Heavy Equipment & Scrap Tender',
          category: 'Metals & Scrap',
          delivery_location: 'Dahej Petrochem Complex, Gujarat',
          special_terms: '100% within 30 days post-inspection',
          lots: [
            { product_name: 'Heavy Steel Scrap', quantity: 100, uom: 'MT', reserve_price: 35000, bid_decrement: 100 },
          ],
          suggested_vendors: [
            { id: 'vnd_master_1', company_name: 'Premier Metals Ltd', email: 'premier@metals.com' },
            { company_name: 'Custom Fabricators Pvt Ltd', contact_person: 'Vikram', email: 'vikram@customfab.com', phone: '9988776655' },
          ],
        }),
      });

      const { requestId } = await submitRes.json();
      expect(requestId).toBeTruthy();

      // 3. Admin converts the request
      const convertRes = await fetch(`${baseUrl}/api/admin/tender-requests/${requestId}/convert`, {
        method: 'POST',
      });

      expect(convertRes.status).toBe(200);
      const convertData = await convertRes.json();
      expect(convertData.success).toBe(true);
      expect(convertData.vendorInvites).toHaveLength(2);

      // Verify vendor tokens in auction_invites table
      const invites = db.prepare("SELECT * FROM auction_invites WHERE auction_id = ? AND role = 'vendor'").all(convertData.auctionId) as any[];
      expect(invites).toHaveLength(2);

      // Verify custom vendor was inserted in vendors and company_vendors
      const customVnd = db.prepare("SELECT * FROM vendors WHERE email = 'vikram@customfab.com'").get() as any;
      expect(customVnd).toBeTruthy();
      expect(customVnd.company_name).toBe('Custom Fabricators Pvt Ltd');

      const linked = db.prepare("SELECT * FROM company_vendors WHERE company_id = 'org_epack' AND vendor_id = ?").get(customVnd.id) as any;
      expect(linked).toBeTruthy();
    });
  });

  // ==========================================
  // REVERSE AUTH REDIRECT LOCK VERIFICATION
  // ==========================================
  describe('Reverse Auth Redirect Lock (No Back-Button to Login)', () => {
    it('redirects an active customer away from /customer/login to /customer/dashboard', async () => {
      // 1. Log in customer
      const loginRes = await fetch(`${baseUrl}/api/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'procurement@epack.in',
          password: 'Epack_Buyer_2026!',
        }),
      });
      const cookieHeader = loginRes.headers.get('set-cookie') || '';
      const cookieVal = cookieHeader.split(';')[0];

      // 2. Request /customer/login with session cookie
      const res = await fetch(`${baseUrl}/customer/login`, {
        headers: { Cookie: cookieVal },
        redirect: 'manual',
      });

      // Must issue HTTP 302 Redirect
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/customer/dashboard');
    });

    it('redirects an active admin away from /admin/login to /admin/auctions', async () => {
      // 1. Log in admin
      const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@nextradeauctions.com',
          password: 'NTA_Admin_2026!',
        }),
      });
      const cookieHeader = loginRes.headers.get('set-cookie') || '';
      const cookieVal = cookieHeader.split(';')[0];

      // 2. Request /admin/login with session cookie
      const res = await fetch(`${baseUrl}/admin/login`, {
        headers: { Cookie: cookieVal },
        redirect: 'manual',
      });

      // Must issue HTTP 302 Redirect
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/admin/auctions');
    });
  });

  // ==========================================
  // PLANT FACILITIES & TENDER AMENDMENTS WORKFLOW
  // ==========================================
  describe('Facilities & Tender Amendments Workflow', () => {
    let customerCookie: string;

    beforeEach(async () => {
      const loginRes = await fetch(`${baseUrl}/api/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'procurement@epack.in',
          password: 'Epack_Buyer_2026!',
        }),
      });
      const cookieHeader = loginRes.headers.get('set-cookie') || '';
      customerCookie = cookieHeader.split(';')[0];
    });

    it('allows customer to create, update, and delete corporate plant locations', async () => {
      // 1. Create facility
      const addRes = await fetch(`${baseUrl}/api/customer/facilities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: customerCookie,
        },
        body: JSON.stringify({
          facility_name: 'Bhiwadi Packaging Hub',
          city: 'Bhiwadi',
          state: 'Rajasthan',
          address: 'Phase III, RIICO Industrial Area',
        }),
      });

      expect(addRes.status).toBe(200);
      const addData = await addRes.json();
      const facId = addData.facility.id;
      expect(facId).toBeTruthy();

      // 2. Update facility
      const updateRes = await fetch(`${baseUrl}/api/customer/facilities/${facId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: customerCookie,
        },
        body: JSON.stringify({
          facility_name: 'Bhiwadi Packaging Unit 2',
          city: 'Bhiwadi',
          state: 'Rajasthan',
          address: 'Plot 88, RIICO Sector 4',
        }),
      });

      expect(updateRes.status).toBe(200);
      const updated = db.prepare('SELECT * FROM organization_facilities WHERE id = ?').get(facId) as any;
      expect(updated.facility_name).toBe('Bhiwadi Packaging Unit 2');
      expect(updated.address).toBe('Plot 88, RIICO Sector 4');

      // 3. Delete facility
      const delRes = await fetch(`${baseUrl}/api/customer/facilities/${facId}`, {
        method: 'DELETE',
        headers: { Cookie: customerCookie },
      });

      expect(delRes.status).toBe(200);
      const afterDel = db.prepare('SELECT * FROM organization_facilities WHERE id = ?').get(facId);
      expect(afterDel).toBeUndefined();
    });

    it('submits a tender amendment and auto-applies reschedule changes upon admin approval', async () => {
      // 1. Seed scheduled auction
      const aucId = 'NTA-AMD-TEST-01';
      db.prepare(`
        INSERT INTO auctions (id, title, customer_org_id, scheduled_start, scheduled_end, duration_minutes, anti_sniping_minutes, extension_step_minutes, max_buffer_minutes, current_end, status)
        VALUES (?, 'Amendment Test Event', 'org_epack', datetime('now', '+2 days'), datetime('now', '+2 days', '+1 hour'), 60, 2, 3, 30, datetime('now', '+2 days', '+1 hour'), 'scheduled')
      `).run(aucId);

      db.prepare(`
        INSERT INTO lots (id, auction_id, lot_number, product_name, quantity, uom, start_price, reserve_price, bid_decrement)
        VALUES ('lot_amd_1', ?, 1, 'Polymer Granules', 200, 'MT', 12000, 12500, 50)
      `).run(aucId);

      // 2. Customer submits reschedule amendment
      const newTime = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
      const amendRes = await fetch(`${baseUrl}/api/customer/auctions/${aucId}/amendments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: customerCookie,
        },
        body: JSON.stringify({
          amendment_type: 'reschedule',
          details: {
            new_scheduled_start: newTime,
            duration_minutes: 90,
          },
          reason: 'Plant maintenance delayed unloading schedule by 24 hours.',
        }),
      });

      expect(amendRes.status).toBe(201);
      const amendData = await amendRes.json();
      expect(amendData.success).toBe(true);
      const amdId = amendData.amendmentId;

      // 3. Admin reviews and approves the amendment
      const approveRes = await fetch(`${baseUrl}/api/admin/amendments/${amdId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: 'Approved per client operations email.' }),
      });

      expect(approveRes.status).toBe(200);

      // 4. Verify SQLite auction record was automatically rescheduled
      const updatedAuc = db.prepare('SELECT * FROM auctions WHERE id = ?').get(aucId) as any;
      expect(new Date(updatedAuc.scheduled_start).getTime()).toBe(new Date(newTime).getTime());
      expect(updatedAuc.duration_minutes).toBe(90);

      // Verify amendment status
      const amdRecord = db.prepare('SELECT * FROM tender_amendments WHERE id = ?').get(amdId) as any;
      expect(amdRecord.status).toBe('approved');
      expect(amdRecord.applied_at).toBeTruthy();
    });

    it('allows admin to edit and update a pending client tender request before converting', async () => {
      // 1. Seed a pending request
      const reqId = 'req_test_edit_01';
      db.prepare(`
        INSERT INTO tender_requests (id, request_number, customer_org_id, company_name, contact_person, email, phone, title, category, duration_minutes, delivery_location, lots_json, status)
        VALUES (?, 'REQ-TEST-01', 'org_epack', 'Epack Petrochem Solutions', 'Saurabh', 'proc@epack.in', '9876543210', 'Original Title', 'Packaging & Pallets', 45, 'Plant 1', ?, 'pending_review')
      `).run(reqId, JSON.stringify([{ product_name: 'Pallet Lot', quantity: 50, uom: 'Nos', reserve_price: 1000, bid_decrement: 10 }]));

      // 2. Admin edits the request
      const editRes = await fetch(`${baseUrl}/api/admin/tender-requests/${reqId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated Bulk Pallets Event',
          duration_minutes: 75,
          delivery_location: 'Dahej Petrochem Complex',
          lots: [
            { product_name: 'Pallet Lot Modified', quantity: 150, uom: 'Nos', reserve_price: 950, bid_decrement: 15 }
          ]
        })
      });

      expect(editRes.status).toBe(200);

      // Verify in DB
      const updated = db.prepare('SELECT * FROM tender_requests WHERE id = ?').get(reqId) as any;
      expect(updated.title).toBe('Updated Bulk Pallets Event');
      expect(updated.duration_minutes).toBe(75);
      expect(updated.delivery_location).toBe('Dahej Petrochem Complex');
      const parsedLots = JSON.parse(updated.lots_json);
      expect(parsedLots[0].product_name).toBe('Pallet Lot Modified');
      expect(parsedLots[0].quantity).toBe(150);
    });
  });
});

