import { loadEnv } from './env.js';
loadEnv();

import { initializeDatabase } from './db.js';
import { createAuctionServer } from './server.js';
import { buildAccessUrl } from './magic-link.js';
import { hashPassword } from './auth.js';

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

// Seed Corporate Delivery Plants / Facilities
db.prepare(`
  INSERT OR IGNORE INTO organization_facilities (id, org_id, facility_name, city, state, address)
  VALUES 
    ('fac_dahej', 'org_epack', 'Dahej Petrochem Complex', 'Dahej', 'Gujarat', 'Plot 42-45, GIDC Industrial Estate, Dahej'),
    ('fac_bhiwadi', 'org_epack', 'Bhiwadi Packaging Hub', 'Bhiwadi', 'Rajasthan', 'Phase III, RIICO Industrial Area, Bhiwadi'),
    ('fac_noida', 'org_epack', 'Greater Noida Processing Facility', 'Greater Noida', 'Uttar Pradesh', 'Ecotech III, Greater Noida')
`).run();

// Seed Default Verified Enterprise Suppliers (if not already registered)
const defaultVendorPin = hashPassword('123456');
db.prepare(`
  INSERT OR IGNORE INTO vendors (id, company_name, contact_person, email, phone, gstin, pan, password_hash, status)
  VALUES 
    ('vnd_gold', 'Gold Global Fuels Pvt Ltd', 'Authorized Signatory', 'goldglobalfuels@gmail.com', '9876543211', '27AAPFU0939F1ZV', 'AAPFU0939F', ?, 'approved'),
    ('vnd_bridge', 'RS Bridge Consultancy LLP', 'Commercial Lead', 'rsbridgeconsultancy@gmail.com', '9876543212', '27AAPFU0939F1ZV', 'AAPFU0939F', ?, 'approved')
`).run(defaultVendorPin, defaultVendorPin);

// Ensure historical demo record exists without reviving or modifying it
db.prepare(`
  INSERT OR IGNORE INTO auctions (
    id, title, customer_org_id, scheduled_start, scheduled_end, 
    duration_minutes, anti_sniping_minutes, extension_step_minutes, 
    max_buffer_minutes, current_end, status, category, delivery_location, 
    special_instructions
  )
  VALUES (
    'NTA-EPACKPetro-07', 'Epack Petrochem Disposal & Procurement Event', 'org_epack',
    '2026-10-30T10:00:00.000Z', '2026-10-30T10:45:00.000Z', 
    45, 2, 3, 30, '2026-10-30T10:45:00.000Z', 'ended', 'Packaging & Petrochem', 'Bhiwadi Packaging Hub (Rajasthan)',
    '100% within 30 days post-inspection | Within 7 business days of PO dispatch'
  )
`).run();

// Ensure past demo auction stays ended and closed (never revive)
db.prepare("UPDATE auctions SET status = 'ended' WHERE id = 'NTA-EPACKPetro-07' AND status != 'ended'").run();
db.prepare("UPDATE lots SET status = 'closed' WHERE auction_id = 'NTA-EPACKPetro-07'").run();

// Seed Lots: Pallets & Coal (Immutable, only on initial setup)
db.prepare(`
  INSERT OR IGNORE INTO lots (id, auction_id, lot_number, product_name, category, quantity, uom, start_price, reserve_price, bid_decrement, current_lowest_bid, current_l1_vendor_id, status)
  VALUES 
    ('lot_pallets', 'NTA-EPACKPetro-07', 1, 'Pallets Epackpetro-07', 'Non-PCB', 5000, 'Nos', 1400, 1500, 5, 1255, 'vnd_gold', 'closed'),
    ('lot_coal', 'NTA-EPACKPetro-07', 2, 'Imported Coal _Epackpetro-07', 'Non-PCB', 500, 'MT', 13000, 13500, 10, NULL, NULL, 'closed')
`).run();

// Seed Active Magic Tokens for demo testing
db.prepare(`
  INSERT OR IGNORE INTO auction_invites (id, auction_id, vendor_id, role, token, expires_at, is_revoked)
  VALUES 
    ('inv_gold', 'NTA-EPACKPetro-07', 'vnd_gold', 'vendor', 'token_gold_fuels_live_01', datetime('now', '+2 days'), 0),
    ('inv_bridge', 'NTA-EPACKPetro-07', 'vnd_bridge', 'vendor', 'token_bridge_consultancy_live_02', datetime('now', '+2 days'), 0),
    ('inv_epack_obs', 'NTA-EPACKPetro-07', NULL, 'customer_observer', 'token_epack_spectator_obs_03', datetime('now', '+2 days'), 0)
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
  console.log(`🚀 NexTrade Auctions (NTA) Enterprise Platform: ${BASE_URL}`);
  console.log('================================================================');
  console.log('Operational Status: Running (Data Guard Active)');
  console.log('\n🔒 REALM 1: OPERATIONS DESK (ADMIN)');
  console.log(`   URL:         ${BASE_URL}/admin/login`);
  console.log('   Credentials: admin@nextradeauctions.com / NTA_Admin_2026!');
  console.log('\n🏢 REALM 2: CORPORATE BUYER WORKSPACE (CUSTOMER)');
  console.log(`   Dashboard:   ${BASE_URL}/customer/dashboard`);
  console.log(`   Login URL:   ${BASE_URL}/customer/login`);
  console.log('   Credentials: procurement@epack.in / Epack_Buyer_2026!');
  console.log(`   Intake Form: ${BASE_URL}/customer/request-tender (Auth Guarded)`);
  console.log(`   Spectator:   ${observerUrl}`);
  console.log('\n👥 REALM 3: SUPPLIER BIDDING ROOM (TOKENIZED MAGIC LINKS)');
  console.log(`   Vendor A (Gold Global Fuels):`);
  console.log(`   👉 ${goldUrl}`);
  console.log(`   Vendor B (RS Bridge Consultancy):`);
  console.log(`   👉 ${bridgeUrl}`);
  console.log('\n🏭 SUPPLIER HUB / VENDOR DASHBOARD:');
  console.log(`   Login URL:   ${BASE_URL}/vendor/login`);
  console.log('   Demo PIN:    123456 (for goldglobalfuels@gmail.com)');
  console.log('================================================================\n');
});
