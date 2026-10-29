import Database from 'better-sqlite3';

export function initializeDatabase(dbPath: string = ':memory:'): Database.Database {
  const db = new Database(dbPath);

  // Enable WAL mode for high concurrency and enforce foreign keys
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Execute DDL schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gstin TEXT UNIQUE,
      email TEXT NOT NULL,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      gstin TEXT,
      pan TEXT,
      status TEXT CHECK(status IN ('unregistered', 'pending_approval', 'approved', 'blacklisted')) DEFAULT 'unregistered',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auctions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      customer_org_id TEXT REFERENCES organizations(id),
      scheduled_start DATETIME NOT NULL,
      scheduled_end DATETIME NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      anti_sniping_minutes INTEGER NOT NULL DEFAULT 2,
      extension_step_minutes INTEGER NOT NULL DEFAULT 3,
      max_buffer_minutes INTEGER NOT NULL DEFAULT 30,
      current_end DATETIME NOT NULL,
      status TEXT CHECK(status IN ('scheduled', 'live', 'extended', 'ended', 'cancelled')) DEFAULT 'scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lots (
      id TEXT PRIMARY KEY,
      auction_id TEXT REFERENCES auctions(id) ON DELETE CASCADE NOT NULL,
      lot_number INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      category TEXT,
      quantity REAL NOT NULL,
      uom TEXT NOT NULL,
      start_price REAL NOT NULL,
      reserve_price REAL NOT NULL,
      bid_decrement REAL NOT NULL,
      current_lowest_bid REAL,
      current_l1_vendor_id TEXT REFERENCES vendors(id),
      status TEXT CHECK(status IN ('open', 'extended', 'closed')) DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lot_id TEXT REFERENCES lots(id) ON DELETE CASCADE NOT NULL,
      vendor_id TEXT REFERENCES vendors(id) NOT NULL,
      amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auction_invites (
      id TEXT PRIMARY KEY,
      auction_id TEXT REFERENCES auctions(id) ON DELETE CASCADE NOT NULL,
      vendor_id TEXT REFERENCES vendors(id),
      role TEXT CHECK(role IN ('vendor', 'customer_observer')) NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      is_revoked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS company_vendors (
      company_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
      vendor_id TEXT REFERENCES vendors(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (company_id, vendor_id)
    );
  `);

  return db;
}