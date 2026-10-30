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

    CREATE TABLE IF NOT EXISTS organization_facilities (
      id TEXT PRIMARY KEY,
      org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      facility_name TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_person TEXT NOT NULL DEFAULT 'Representative',
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL DEFAULT 'N/A',
      gstin TEXT,
      pan TEXT,
      status TEXT CHECK(status IN ('unregistered', 'pending_approval', 'approved', 'blacklisted')) DEFAULT 'approved',
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
      category TEXT DEFAULT 'General Procurement',
      delivery_location TEXT,
      payment_terms TEXT,
      delivery_timeline TEXT,
      compliance_requirements TEXT,
      special_instructions TEXT,
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

    CREATE TABLE IF NOT EXISTS tender_requests (
      id TEXT PRIMARY KEY,
      request_number TEXT UNIQUE NOT NULL,
      customer_org_id TEXT REFERENCES organizations(id),
      company_name TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'General Procurement',
      target_date DATETIME,
      duration_minutes INTEGER NOT NULL DEFAULT 45,
      delivery_location TEXT,
      special_terms TEXT,
      lots_json TEXT NOT NULL,
      suggested_vendors_json TEXT,
      status TEXT CHECK(status IN ('pending_review', 'approved', 'rejected')) DEFAULT 'pending_review',
      customer_approved INTEGER DEFAULT 0,
      customer_approved_at DATETIME,
      admin_revised INTEGER DEFAULT 0,
      admin_revised_at DATETIME,
      rejection_reason TEXT,
      converted_auction_id TEXT REFERENCES auctions(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'customer', 'vendor')) NOT NULL,
      organization_id TEXT REFERENCES organizations(id),
      full_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tender_amendments (
      id TEXT PRIMARY KEY,
      auction_id TEXT REFERENCES auctions(id) ON DELETE CASCADE NOT NULL,
      customer_org_id TEXT REFERENCES organizations(id) NOT NULL,
      amendment_type TEXT CHECK(amendment_type IN ('reschedule', 'quantity_ceiling', 'delivery_terms', 'comprehensive', 'general')) NOT NULL,
      details_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending_review', 'approved', 'rejected')) DEFAULT 'pending_review',
      admin_notes TEXT,
      applied_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id TEXT PRIMARY KEY,
      user_id REFERENCES platform_users(id) ON DELETE CASCADE NOT NULL,
      role TEXT NOT NULL,
      organization_id TEXT,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_role TEXT CHECK(recipient_role IN ('admin', 'customer', 'all')) NOT NULL,
      recipient_org_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT CHECK(type IN ('tender_request_new', 'tender_request_revised', 'tender_request_approved', 'tender_request_rejected', 'amendment_request', 'amendment_decision', 'auction_live', 'auction_concluded')) NOT NULL,
      reference_id TEXT,
      target_url TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Defensive migrations for existing SQLite databases
  try {
    // 0. Migrate notifications table defensively
    db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        recipient_role TEXT CHECK(recipient_role IN ('admin', 'customer', 'all')) NOT NULL,
        recipient_org_id TEXT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT CHECK(type IN ('tender_request_new', 'tender_request_revised', 'tender_request_approved', 'tender_request_rejected', 'amendment_request', 'amendment_decision', 'auction_live', 'auction_concluded')) NOT NULL,
        reference_id TEXT,
        target_url TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // 1. Migrate tender_requests
    const reqInfo = db.prepare("PRAGMA table_info('tender_requests')").all() as any[];
    const reqCols = new Set(reqInfo.map((c) => c.name));

    if (!reqCols.has('customer_approved')) {
      db.exec('ALTER TABLE tender_requests ADD COLUMN customer_approved INTEGER DEFAULT 0;');
    }
    if (!reqCols.has('customer_approved_at')) {
      db.exec('ALTER TABLE tender_requests ADD COLUMN customer_approved_at DATETIME;');
    }
    if (!reqCols.has('admin_revised')) {
      db.exec('ALTER TABLE tender_requests ADD COLUMN admin_revised INTEGER DEFAULT 0;');
    }
    if (!reqCols.has('admin_revised_at')) {
      db.exec('ALTER TABLE tender_requests ADD COLUMN admin_revised_at DATETIME;');
    }
    if (!reqCols.has('rejection_reason')) {
      db.exec('ALTER TABLE tender_requests ADD COLUMN rejection_reason TEXT;');
    }

    // 2. Migrate auctions (Fixes: SqliteError: no such column: a.delivery_location)
    const aucInfo = db.prepare("PRAGMA table_info('auctions')").all() as any[];
    const aucCols = new Set(aucInfo.map((c) => c.name));

    if (!aucCols.has('delivery_location')) {
      db.exec('ALTER TABLE auctions ADD COLUMN delivery_location TEXT;');
    }
    if (!aucCols.has('category')) {
      db.exec("ALTER TABLE auctions ADD COLUMN category TEXT DEFAULT 'General Procurement';");
    }
    if (!aucCols.has('special_instructions')) {
      db.exec('ALTER TABLE auctions ADD COLUMN special_instructions TEXT;');
    }
    if (!aucCols.has('payment_terms')) {
      db.exec('ALTER TABLE auctions ADD COLUMN payment_terms TEXT;');
    }
    if (!aucCols.has('delivery_timeline')) {
      db.exec('ALTER TABLE auctions ADD COLUMN delivery_timeline TEXT;');
    }
    if (!aucCols.has('compliance_requirements')) {
      db.exec('ALTER TABLE auctions ADD COLUMN compliance_requirements TEXT;');
    }
  } catch (migErr) {
    console.warn('Defensive schema migration notice:', migErr);
  }

  return db;
}
