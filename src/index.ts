import { initializeDatabase } from './db.js';
import { createAuctionServer } from './server.js';
import { buildAccessUrl } from './magic-link.js';

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

// 1. Initialize SQLite Database (persists to auction.db on disk)
const db = initializeDatabase(process.env.DATABASE_PATH || './auction.db');

// 2. Seed Initial Demo Auction matching your sample report
const existingAuction = db.prepare('SELECT id FROM auctions WHERE id = ?').get('NTA-EPACKPetro-07');

if (!existingAuction) {
  console.log('🌱 Seeding initial demo auction: NTA-EPACKPetro-07...');

  // Seed Organization: Epack Petrochem
  db.prepare(`
    INSERT OR IGNORE INTO organizations (id, name, gstin, email, phone)
    VALUES ('org_epack', 'Epack Petrochem Solutions Pvt Ltd', '03AAPCP3056IZE', 'procurement@epack.in', '9876543210')
  `).run();

  // Seed Vendors
  db.prepare(`
    INSERT OR IGNORE INTO vendors (id, company_name, contact_person, email, phone, gstin, pan, status)
    VALUES 
      ('vnd_gold', 'Gold Global Fuels', 'Harsh Vardhan', 'goldglobalfuels@gmail.com', '9876543211', '27AAPFU0939F1ZV', 'AAPFU0939F', 'approved'),
      ('vnd_bridge', 'RS Bridge Consultancy', 'Rahul Sharma', 'rsbridgeconsultancy@gmail.com', '9876543212', '27AAPFU0939F1ZV', 'AAPFU0939F', 'approved')
  `).run();

  // Seed 45-Minute Auction Event
  const now = new Date();
  const startTime = new Date(now.getTime() - 5 * 60 * 1000); // Started 5 mins ago
  const endTime = new Date(now.getTime() + 40 * 60 * 1000);   // 40 mins remaining

  db.prepare(`
    INSERT INTO auctions (id, title, customer_org_id, scheduled_start, scheduled_end, duration_minutes, anti_sniping_minutes, extension_step_minutes, max_buffer_minutes, current_end, status)
    VALUES ('NTA-EPACKPetro-07', 'Epack Petrochem Disposal & Procurement Event', 'org_epack', ?, ?, 45, 2, 3, 30, ?, 'live')
  `).run(startTime.toISOString(), endTime.toISOString(), endTime.toISOString());

  // Seed Lots: Coal & Pallets
  db.prepare(`
    INSERT INTO lots (id, auction_id, lot_number, product_name, category, quantity, uom, start_price, reserve_price, bid_decrement, current_lowest_bid, current_l1_vendor_id, status)
    VALUES 
      ('lot_pallets', 'NTA-EPACKPetro-07', 1, 'Pallets Epackpetro-07', 'Non-PCB', 5000, 'Nos', 1400, 1500, 5, 1340, 'vnd_gold', 'open'),
      ('lot_coal', 'NTA-EPACKPetro-07', 2, 'Imported Coal _Epackpetro-07', 'Non-PCB', 500, 'MT', 13000, 13500, 10, NULL, NULL, 'open')
  `).run();

  // Seed Magic Tokens
  db.prepare(`
    INSERT INTO auction_invites (id, auction_id, vendor_id, role, token, expires_at)
    VALUES 
      ('inv_gold', 'NTA-EPACKPetro-07', 'vnd_gold', 'vendor', 'token_gold_fuels_live_01', datetime('now', '+2 days')),
      ('inv_bridge', 'NTA-EPACKPetro-07', 'vnd_bridge', 'vendor', 'token_bridge_consultancy_live_02', datetime('now', '+2 days')),
      ('inv_epack_obs', 'NTA-EPACKPetro-07', NULL, 'customer_observer', 'token_epack_spectator_obs_03', datetime('now', '+2 days'))
  `).run();
}

// 3. Start Server
const { httpServer } = createAuctionServer(db);

httpServer.listen(PORT, () => {
  const goldUrl = buildAccessUrl(BASE_URL, 'NTA-EPACKPetro-07', 'token_gold_fuels_live_01');
  const bridgeUrl = buildAccessUrl(BASE_URL, 'NTA-EPACKPetro-07', 'token_bridge_consultancy_live_02');
  const observerUrl = buildAccessUrl(BASE_URL, 'NTA-EPACKPetro-07', 'token_epack_spectator_obs_03');

  console.log('\n================================================================');
  console.log(`🚀 B2B Reverse E-Auction Platform Live on: ${BASE_URL}`);
  console.log('================================================================');
  console.log('Auction ID: NTA-EPACKPetro-07 (Status: LIVE)');
  console.log('\n🔑 1-CLICK MAGIC ACCESS LINKS (Click or Copy to Browser):');
  console.log('\n1. 👤 Vendor A (Gold Global Fuels):');
  console.log(`   👉 ${goldUrl}`);
  console.log('\n2. 👤 Vendor B (RS Bridge Consultancy):');
  console.log(`   👉 ${bridgeUrl}`);
  console.log('\n3. 👁️ Customer Observer (Epack Petrochem Spectator):');
  console.log(`   👉 ${observerUrl}`);
  console.log('================================================================\n');
});