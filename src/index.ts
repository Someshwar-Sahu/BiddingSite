import { initializeDatabase } from './db.js';
import { createAuctionServer } from './server.js';
import { buildAccessUrl } from './magic-link.js';

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

// 1. Initialize SQLite Database (persists to auction.db on disk)
const db = initializeDatabase(process.env.DATABASE_PATH || './auction.db');

// 2. Seed / Refresh Initial Demo Auction (NTA-EPACKPetro-07)
console.log('🌱 Synchronizing live demo auction state: NTA-EPACKPetro-07...');

// Seed Organization: Epack Petrochem
db.prepare(`
  INSERT OR IGNORE INTO organizations (id, name, gstin, email, phone)
  VALUES ('org_epack', 'Epack Petrochem Solutions Pvt Ltd', '03AAPCP3056IZE', 'procurement@epack.in', '9876543210')
`).run();

// Seed Master Vendors
db.prepare(`
  INSERT OR IGNORE INTO vendors (id, company_name, contact_person, email, phone, gstin, pan, status)
  VALUES 
    ('vnd_gold', 'Gold Global Fuels', 'Harsh Vardhan', 'goldglobalfuels@gmail.com', '9876543211', '27AAPFU0939F1ZV', 'AAPFU0939F', 'approved'),
    ('vnd_bridge', 'RS Bridge Consultancy', 'Rahul Sharma', 'rsbridgeconsultancy@gmail.com', '9876543212', '27AAPFU0939F1ZV', 'AAPFU0939F', 'approved')
`).run();

// Refresh 45-Minute Live Window for demo testing
const now = new Date();
const startTime = new Date(now.getTime() - 5 * 60 * 1000); // Started 5 mins ago
const endTime = new Date(now.getTime() + 40 * 60 * 1000);   // 40 mins remaining

db.prepare(`
  INSERT INTO auctions (id, title, customer_org_id, scheduled_start, scheduled_end, duration_minutes, anti_sniping_minutes, extension_step_minutes, max_buffer_minutes, current_end, status)
  VALUES ('NTA-EPACKPetro-07', 'Epack Petrochem Disposal & Procurement Event', 'org_epack', ?, ?, 45, 2, 3, 30, ?, 'live')
  ON CONFLICT(id) DO UPDATE SET
    scheduled_start = excluded.scheduled_start,
    scheduled_end = excluded.scheduled_end,
    current_end = excluded.current_end,
    status = 'live'
`).run(startTime.toISOString(), endTime.toISOString(), endTime.toISOString());

// Seed Lots: Pallets & Coal
db.prepare(`
  INSERT INTO lots (id, auction_id, lot_number, product_name, category, quantity, uom, start_price, reserve_price, bid_decrement, current_lowest_bid, current_l1_vendor_id, status)
  VALUES 
    ('lot_pallets', 'NTA-EPACKPetro-07', 1, 'Pallets Epackpetro-07', 'Non-PCB', 5000, 'Nos', 1400, 1500, 5, 1340, 'vnd_gold', 'open'),
    ('lot_coal', 'NTA-EPACKPetro-07', 2, 'Imported Coal _Epackpetro-07', 'Non-PCB', 500, 'MT', 13000, 13500, 10, NULL, NULL, 'open')
  ON CONFLICT(id) DO UPDATE SET
    auction_id = excluded.auction_id,
    lot_number = excluded.lot_number,
    product_name = excluded.product_name,
    category = excluded.category,
    quantity = excluded.quantity,
    uom = excluded.uom,
    start_price = excluded.start_price,
    reserve_price = excluded.reserve_price,
    bid_decrement = excluded.bid_decrement,
    status = 'open'
`).run();

// Seed / Refresh Active Magic Tokens with fresh 48-hour validity
db.prepare(`
  INSERT INTO auction_invites (id, auction_id, vendor_id, role, token, expires_at, is_revoked)
  VALUES 
    ('inv_gold', 'NTA-EPACKPetro-07', 'vnd_gold', 'vendor', 'token_gold_fuels_live_01', datetime('now', '+2 days'), 0),
    ('inv_bridge', 'NTA-EPACKPetro-07', 'vnd_bridge', 'vendor', 'token_bridge_consultancy_live_02', datetime('now', '+2 days'), 0),
    ('inv_epack_obs', 'NTA-EPACKPetro-07', NULL, 'customer_observer', 'token_epack_spectator_obs_03', datetime('now', '+2 days'), 0)
  ON CONFLICT(id) DO UPDATE SET
    token = excluded.token,
    expires_at = datetime('now', '+2 days'),
    is_revoked = 0
`).run();

// Always link baseline approved suppliers in company_vendors
db.prepare(`
  INSERT OR IGNORE INTO company_vendors (company_id, vendor_id)
  VALUES ('org_epack', 'vnd_gold'), ('org_epack', 'vnd_bridge')
`).run();

// Seed sample customer tender request for testing the intake workflow
db.prepare(`
  INSERT OR IGNORE INTO tender_requests (id, request_number, customer_org_id, company_name, contact_person, email, phone, title, category, target_date, duration_minutes, delivery_location, special_terms, lots_json, suggested_vendors_json, status)
  VALUES (
    'req_demo_01',
    'REQ-EPACK-2026-01',
    'org_epack',
    'Epack Petrochem Solutions Pvt Ltd',
    'Saurabh Verma (Procurement Head)',
    'procurement@epack.in',
    '9876543210',
    'Chemical Solvent & Heavy HDPE Drum Sourcing',
    'Petrochemicals',
    datetime('now', '+3 days'),
    45,
    'Dahej Industrial Area, Gujarat',
    '30-day post-delivery settlement. ISO 9001 required.',
    '[{"product_name":"Chemical Drums HDPE 200L","category":"Packaging","quantity":2500,"uom":"Nos","reserve_price":1200,"bid_decrement":10},{"product_name":"Industrial Solvent Grade-B","category":"Solvents","quantity":150,"uom":"MT","reserve_price":45000,"bid_decrement":100}]',
    '[{"company_name":"Apex Containers Ltd","contact_person":"Karan Mehta","phone":"9811223344","email":"apex@test.com"}]',
    'pending_review'
  )
`).run();

// 3. Start Server
const { httpServer } = createAuctionServer(db);

httpServer.listen(PORT, () => {
  const goldUrl = buildAccessUrl(BASE_URL, 'NTA-EPACKPetro-07', 'token_gold_fuels_live_01', 'vendor');
  const bridgeUrl = buildAccessUrl(BASE_URL, 'NTA-EPACKPetro-07', 'token_bridge_consultancy_live_02', 'vendor');
  const observerUrl = buildAccessUrl(BASE_URL, 'NTA-EPACKPetro-07', 'token_epack_spectator_obs_03', 'customer_observer');

  console.log('\n================================================================');
  console.log(`🚀 NexTrade Auctions (NTA) Live on: ${BASE_URL}`);
  console.log('================================================================');
  console.log('Auction ID: NTA-EPACKPetro-07 (Status: LIVE - 40m remaining)');
  console.log('\n🔑 1-CLICK MAGIC ACCESS LINKS (Click or Copy to Browser):');
  console.log('\n1. 👤 Vendor A (Gold Global Fuels - L1 Bidder):');
  console.log(`   👉 ${goldUrl}`);
  console.log('\n2. 👤 Vendor B (RS Bridge Consultancy - Competing Bidder):');
  console.log(`   👉 ${bridgeUrl}`);
  console.log('\n3. 👁️ Customer Observer (Epack Petrochem Executive Spectator):');
  console.log(`   👉 ${observerUrl}`);
  console.log('\n📝 Customer Tender Intake Portal:');
  console.log(`   👉 ${BASE_URL}/customer/request-tender`);
  console.log('\n💼 Admin Control Room:');
  console.log(`   👉 ${BASE_URL}/admin/auctions`);
  console.log('================================================================\n');
});
