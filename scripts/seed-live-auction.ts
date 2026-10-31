import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.resolve('./auction.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('🚀 Seeding Active LIVE Reverse Auction for Phase 5 Testing...');

const auctionId = 'LIVE-EPACK-2026';
const now = new Date();
// Scheduled start: 10 minutes ago
const startTime = new Date(now.getTime() - 10 * 60 * 1000);
// Current end: 35 minutes into the future (total 45 minutes)
const endTime = new Date(now.getTime() + 35 * 60 * 1000);

const transaction = db.transaction(() => {
  // 1. Delete old test record if exists
  db.prepare('DELETE FROM auctions WHERE id = ?').run(auctionId);

  // 2. Ensure corporate organization exists
  db.prepare(`
    INSERT OR IGNORE INTO organizations (id, name, gstin, email, phone)
    VALUES ('org_epack', 'Epack Petrochem Solutions Pvt Ltd', '03AAPCP3056IZE', 'procurement@epack.in', '9876543210')
  `).run();

  // 3. Ensure test vendors exist
  db.prepare(`
    INSERT OR IGNORE INTO vendors (id, company_name, contact_person, email, phone, gstin, pan, status)
    VALUES 
      ('vnd_gold', 'Gold Global Fuels', 'Harsh Vardhan', 'goldglobalfuels@gmail.com', '9876543211', '27AAPFU0939F1ZV', 'AAPFU0939F', 'approved'),
      ('vnd_bridge', 'RS Bridge Consultancy', 'Rahul Sharma', 'rsbridgeconsultancy@gmail.com', '9876543212', '27AAPFU0939F1ZV', 'AAPFU0939F', 'approved')
  `).run();

  // 4. Insert LIVE Reverse Auction
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
    45,
    2,
    30,
    endTime.toISOString(),
    'Industrial Packaging & Petrochem',
    'Dahej Petrochem Complex (Gujarat)',
    '30 Days Net on Inspection',
    'Within 10 business days of PO dispatch',
    'ISO 9001:2015, CPCB Certified',
    'Reverse e-auction for bulk industrial requirements. Decrements strictly enforced.'
  );

  // 5. Insert 3 Procurement Lots
  // Lot 1: HDPE Drums (with leading L1 bid)
  db.prepare(`
    INSERT INTO lots (
      id, auction_id, lot_number, product_name, category,
      quantity, uom, start_price, reserve_price, bid_decrement,
      current_lowest_bid, current_l1_vendor_id, status
    )
    VALUES (?, ?, 1, ?, 'Packaging', 2500, 'Nos', 1500, 1400, 10, 1280, 'vnd_gold', 'open')
  `).run('lot_live_drums', auctionId, 'HDPE Heavy Drums 200L (UN Certified)');

  // Lot 2: Xylene Solvent (with leading L1 bid)
  db.prepare(`
    INSERT INTO lots (
      id, auction_id, lot_number, product_name, category,
      quantity, uom, start_price, reserve_price, bid_decrement,
      current_lowest_bid, current_l1_vendor_id, status
    )
    VALUES (?, ?, 2, ?, 'Petrochemicals', 120, 'MT', 50000, 48000, 500, 44500, 'vnd_bridge', 'open')
  `).run('lot_live_solvent', auctionId, 'Industrial Xylene Solvent Grade-A');

  // Lot 3: Wooden Pallets (Awaiting initial bid)
  db.prepare(`
    INSERT INTO lots (
      id, auction_id, lot_number, product_name, category,
      quantity, uom, start_price, reserve_price, bid_decrement,
      current_lowest_bid, current_l1_vendor_id, status
    )
    VALUES (?, ?, 3, ?, 'Logistics Materials', 4000, 'Nos', 1050, 950, 5, NULL, NULL, 'open')
  `).run('lot_live_pallets', auctionId, 'Heat-Treated Pine Wood Pallets (1200x1000mm)');

  // 6. Insert Chronological Bid History for Audit Trail
  const insertBid = db.prepare(`
    INSERT INTO bids (lot_id, vendor_id, amount, created_at)
    VALUES (?, ?, ?, ?)
  `);

  // Lot 1 Bids
  insertBid.run('lot_live_drums', 'vnd_bridge', 1380, new Date(now.getTime() - 8 * 60 * 1000).toISOString());
  insertBid.run('lot_live_drums', 'vnd_gold', 1350, new Date(now.getTime() - 6 * 60 * 1000).toISOString());
  insertBid.run('lot_live_drums', 'vnd_bridge', 1310, new Date(now.getTime() - 4 * 60 * 1000).toISOString());
  insertBid.run('lot_live_drums', 'vnd_gold', 1280, new Date(now.getTime() - 2 * 60 * 1000).toISOString());

  // Lot 2 Bids
  insertBid.run('lot_live_solvent', 'vnd_gold', 47000, new Date(now.getTime() - 7 * 60 * 1000).toISOString());
  insertBid.run('lot_live_solvent', 'vnd_bridge', 46000, new Date(now.getTime() - 5 * 60 * 1000).toISOString());
  insertBid.run('lot_live_solvent', 'vnd_gold', 45000, new Date(now.getTime() - 3 * 60 * 1000).toISOString());
  insertBid.run('lot_live_solvent', 'vnd_bridge', 44500, new Date(now.getTime() - 1 * 60 * 1000).toISOString());

  // 7. Insert Active Tokens for Access
  db.prepare(`
    INSERT INTO auction_invites (id, auction_id, vendor_id, role, token, expires_at, is_revoked)
    VALUES 
      ('inv_live_gold', ?, 'vnd_gold', 'vendor', 'token_gold_live_test', datetime('now', '+3 days'), 0),
      ('inv_live_bridge', ?, 'vnd_bridge', 'vendor', 'token_bridge_live_test', datetime('now', '+3 days'), 0),
      ('inv_live_obs', ?, NULL, 'customer_observer', 'token_spectator_live_test', datetime('now', '+3 days'), 0)
  `).run(auctionId, auctionId, auctionId);
});

transaction();

console.log('✅ Live Reverse Auction successfully seeded!');
console.log(`📌 Auction ID: ${auctionId}`);
console.log(`🔴 Status: LIVE BIDDING (Expires in ~35 minutes)`);
console.log(`🔗 Observer Room URL (Direct): http://localhost:3000/observer/${auctionId}`);
console.log(`🔑 Observer Room URL (Tokenized): http://localhost:3000/observer/${auctionId}?key=token_spectator_live_test`);
console.log(`\nTo clean up or reset when done, run:\n  npx tsx scripts/clean-test-auctions.ts`);

