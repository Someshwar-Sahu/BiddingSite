import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.resolve('./auction.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const auctionId = 'LIVE-EPACK-2026';

console.log(`🧹 Cleaning test auction data for ${auctionId}...`);

const info = db.prepare('DELETE FROM auctions WHERE id = ?').run(auctionId);

console.log(`✅ Test auction ${auctionId} purged. Rows removed: ${info.changes}`);

