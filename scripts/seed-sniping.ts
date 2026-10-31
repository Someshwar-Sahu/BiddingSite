import Database from 'better-sqlite3';
import path from 'path';
import { hashPassword } from '../src/auth.js';

const dbPath = process.env.DATABASE_PATH || path.resolve('./auction.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('⚡ Seeding Anti-Sniping Test Auction (< 2 minutes remaining)...');

const auctionId = 'LIVE-EPACK-2026';
const now = new Date();
// Scheduled start: 15 minutes ago
const startTime = new Date(now.getTime() - 15 * 60 * 1000);
// Current end: 55 seconds from now (Well within 2-minute anti-sniping window)
const endTime = new Date(now.getTime() + 55 * 1000);

const transaction = db.transaction(() => {
  // 1. Delete old test record if exists
  db.prepare('DELETE FROM auctions WHERE id = ?').run(auctionId);

  // 2. Ensure corporate organization exists
  db.prepare(`
    INSERT OR IGNORE INTO organizations (id, name, gstin, email, phone)
    VALUES ('org_epack', 'Epack Petrochem Solutions Pvt Ltd', '03AAPCP3056IZE', 'procurement@epack.in', '9876543210')
  `).run();

  // 3. Ensure test vendors exist with default PIN (123456)
  const vendorPinHash = hashPassword('123456');
  db.prepare(`
    INSERT INTO vendors (id, company_name, contact_person, email, phone, gstin, pan, password_hash, status)
    VALUES 
      ('vnd_gold', 'Gold Global Fuels', 'Harsh Vardhan', 'goldglobalfuels@gmail.com', '9876543211', '27AAPFU0939F1ZV', 'AAPFU0939F', ?, 'approved'),
      ('vnd_bridge', 'RS Bridge Consultancy', 'Rahul Sharma', 'rsbridgeconsultancy@gmail.com', '9876543212', '27AAPFU0939F1ZV', 'AAPFU0939F', ?, 'approved')
    ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash
  `).run(vendorPinHash, vendorPinHash);

  db.prepare(`
    INSERT INTO platform_users (id, email, password_hash, role, organization_id, full_name)
    VALUES 
      ('usr_vnd_gold', 'goldglobalfuels@gmail.com', ?, 'vendor', NULL, 'Gold Global Fuels'),
      ('usr_vnd_bridge', 'rsbridgeconsultancy@gmail.com', ?, 'vendor', NULL, 'RS Bridge Consultancy')
    ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash
  `).run(vendorPinHash, vendorPinHash);

  // 4. Insert LIVE Reverse Auction in Anti-Sniping Critical State
  db.prepare(`
    INSERT INTO auctions (
      id, title, customer_org_id, scheduled_start, scheduled_end,
      duration_minutes, anti_sniping_minutes, extension_step_minutes,
      max_buffer_minutes, current_end, status, category, delivery_location,
      payment_terms, delivery_timeline, compliance_requirements, special_instructions
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 3, ?, ?, 'live', ?, ?, ?, ?, ?, ?)
  `).run(
    auctionId,
    'Live Reverse Auction: Bulk Industrial Packaging & Petrochem Solvents',
    'org_epack',
    startTime.toISOString(),
    endTime.toISOString(),
    15,
    2, // 2-minute threshold
    30, // 30-minute max buffer
    endTime.toISOString(),
    'Industrial Packaging & Petrochem',
    'Dahej Petrochem Complex (Gujarat)',
    '30 Days Net on Inspection',
    'Within 10 business days of PO dispatch',
    'ISO 9001:2015, CPCB Certified',
    'Reverse e-auction for bulk industrial requirements. Decrements strictly enforced.'
  );

  // 5. Insert 3 Procurement Lots with baseline bids
  db.prepare(`
    INSERT INTO lots (
      id, auction_id, lot_number, product_name, category,
      quantity, uom, start_price, reserve_price, bid_decrement,
      current_lowest_bid, current_l1_vendor_id, status
    )
    VALUES 
      ('lot_live_drums', ?, 1, 'HDPE Heavy Drums 200L (UN Certified)', 'Packaging', 2500, 'Nos', 1500, 1400, 10, 1280, 'vnd_gold', 'open'),
      ('lot_live_solvent', ?, 2, 'Industrial Xylene Solvent Grade-A', 'Petrochemicals', 120, 'MT', 50000, 48000, 500, 44500, 'vnd_bridge', 'open'),
      ('lot_live_pallets', ?, 3, 'Heat-Treated Pine Wood Pallets (1200x1000mm)', 'Logistics Materials', 4000, 'Nos', 1050, 950, 5, NULL, NULL, 'open')
  `).run(auctionId, auctionId, auctionId);

  // 6. Insert Active Tokens for Access
  db.prepare(`
    INSERT INTO auction_invites (id, auction_id, vendor_id, role, token, expires_at, is_revoked)
    VALUES 
      ('inv_live_gold', ?, 'vnd_gold', 'vendor', 'token_gold_live_test', datetime('now', '+3 days'), 0),
      ('inv_live_bridge', ?, 'vnd_bridge', 'vendor', 'token_bridge_live_test', datetime('now', '+3 days'), 0),
      ('inv_live_obs', ?, NULL, 'customer_observer', 'token_spectator_live_test', datetime('now', '+3 days'), 0)
  `).run(auctionId, auctionId, auctionId);
});

transaction();

console.log('✅ Anti-Sniping Critical State successfully seeded!');
console.log(`📌 Auction ID: ${auctionId}`);
console.log(`⏱️ Remaining Time: ~55 seconds (Threshold is 2m, Step is +3m)`);
console.log(`🔗 Vendor B URL: http://localhost:3000/live-auction/${auctionId}?key=token_bridge_live_test`);
console.log(`🔑 Supplier Login: http://localhost:3000/vendor/login (PIN: 123456)`);
