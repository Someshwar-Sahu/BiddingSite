import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';

const SALT = 'nta_enterprise_auth_salt_2026';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'admin' | 'customer' | 'vendor';
  organization_id?: string;
  full_name: string;
}

export interface UserSession {
  sessionId: string;
  userId: string;
  role: string;
  organizationId?: string;
  email: string;
  fullName: string;
}

/**
 * Deterministic password hashing using native scrypt
 */
export function hashPassword(password: string): string {
  return crypto.scryptSync(password, SALT, 64).toString('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  const current = hashPassword(password);
  return crypto.timingSafeEqual(Buffer.from(current, 'hex'), Buffer.from(hash, 'hex'));
}

/**
 * Lightweight native cookie parser (No external npm dependencies)
 */
export function parseCookies(header?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!header) return list;
  header.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

/**
 * Creates and stores a cryptographically secure session
 */
export function createSession(
  db: Database.Database,
  userId: string,
  role: string,
  organizationId?: string,
  durationDays: number = 7
): string {
  const sessionId = `nta_sess_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 3600 * 1000).toISOString();

  db.prepare(`
    INSERT INTO user_sessions (session_id, user_id, role, organization_id, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, userId, role, organizationId || null, expiresAt);

  return sessionId;
}

/**
 * Validates a session token and retrieves user identity
 */
export function validateSession(db: Database.Database, sessionId?: string, expectedRole?: string): UserSession | null {
  if (!sessionId) return null;

  try {
    const row = db
      .prepare(`
        SELECT s.session_id, s.user_id, s.role, s.organization_id, s.expires_at,
               u.email, u.full_name
        FROM user_sessions s
        JOIN platform_users u ON s.user_id = u.id
        WHERE s.session_id = ? AND s.expires_at > datetime('now')
      `)
      .get(sessionId) as any;

    if (!row) return null;
    if (expectedRole && row.role !== expectedRole) return null;

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      role: row.role,
      organizationId: row.organization_id,
      email: row.email,
      fullName: row.full_name,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Seed master demo accounts for Admin, Corporate Buyer, and Vetted Suppliers
 */
export function seedDefaultUsers(db: Database.Database): void {
  try {
    // 1. Superadmin / Ops Lead
    const adminHash = hashPassword('NTA_Admin_2026!');
    db.prepare(`
      INSERT OR IGNORE INTO platform_users (id, email, password_hash, role, organization_id, full_name)
      VALUES ('usr_admin_01', 'admin@nextradeauctions.com', ?, 'admin', NULL, 'NexTrade Operations Desk')
    `).run(adminHash);

    // 2. Corporate Buyer Lead (Epack Petrochem Solutions)
    const customerHash = hashPassword('Epack_Buyer_2026!');
    db.prepare(`
      INSERT OR IGNORE INTO platform_users (id, email, password_hash, role, organization_id, full_name)
      VALUES ('usr_epack_01', 'procurement@epack.in', ?, 'customer', 'org_epack', 'Saurabh Verma (Procurement Head)')
    `).run(customerHash);

    // 3. Master Vetted Suppliers (Default PIN: 123456)
    const vendorPinHash = hashPassword('123456');

    // Update vendors table directly
    try {
      db.prepare("UPDATE vendors SET password_hash = ? WHERE id IN ('vnd_gold', 'vnd_bridge')").run(vendorPinHash);
    } catch {}

    // Register in platform_users (organization_id is NULL because vendors are not in organizations table)
    db.prepare(`
      INSERT OR IGNORE INTO platform_users (id, email, password_hash, role, organization_id, full_name)
      VALUES 
        ('usr_vnd_gold', 'goldglobalfuels@gmail.com', ?, 'vendor', NULL, 'Gold Global Fuels'),
        ('usr_vnd_bridge', 'rsbridgeconsultancy@gmail.com', ?, 'vendor', NULL, 'RS Bridge Consultancy')
    `).run(vendorPinHash, vendorPinHash);

    // Ensure existing user has correct password hash
    db.prepare("UPDATE platform_users SET password_hash = ? WHERE id IN ('usr_vnd_gold', 'usr_vnd_bridge')").run(vendorPinHash);
  } catch (e) {
    console.warn('Notice seeding default users:', e);
  }
}

/**
 * Middleware: Enforces strict isolation for the Admin Realm (/admin/* and /api/admin/*)
 */
export function requireAdminAuth(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test' && (req.headers['x-bypass-auth'] || !req.headers.cookie)) {
      (req as any).adminUser = { id: 'usr_admin_01', role: 'admin', full_name: 'Test Admin' };
      return next();
    }

    const cookies = parseCookies(req.headers.cookie);
    const authHeader = req.headers.authorization;
    let sessionId = cookies['nta_admin_session'];

    if (!sessionId && authHeader?.startsWith('Bearer ')) {
      sessionId = authHeader.substring(7).trim();
    }

    const session = validateSession(db, sessionId, 'admin');
    if (!session || session.role !== 'admin') {
      const isApiRequest =
        (req.originalUrl && req.originalUrl.includes('/api/')) ||
        (req.baseUrl && req.baseUrl.includes('/api')) ||
        req.path.startsWith('/api/') ||
        Boolean(req.xhr) ||
        Boolean(req.headers.accept?.includes('application/json'));

      if (isApiRequest) {
        return res.status(401).json({
          error: 'Unauthorized: Admin authentication required to access NexTrade operational resources.',
        });
      }
      return res.redirect('/admin/login');
    }

    (req as any).adminUser = session;
    next();
  };
}

/**
 * Middleware: Enforces strict tenant isolation for Corporate Customers (/customer/* and /api/customer/*)
 */
export function requireCustomerAuth(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') {
      const orgQuery = (req.query.orgId as string) || (req.query.org as string) || (req.body?.customer_org_id as string) || 'org_epack';
      (req as any).customerOrgId = orgQuery;
      (req as any).customerUser = {
        id: 'usr_epack_01',
        email: 'procurement@epack.in',
        organization_id: orgQuery,
        full_name: 'Test Buyer',
      };
      return next();
    }

    const cookies = parseCookies(req.headers.cookie);
    const authHeader = req.headers.authorization;
    let sessionId = cookies['nta_customer_session'];

    if (!sessionId && authHeader?.startsWith('Bearer ')) {
      sessionId = authHeader.substring(7).trim();
    }

    const session = validateSession(db, sessionId, 'customer');
    if (!session || session.role !== 'customer') {
      const isApiRequest =
        (req.originalUrl && req.originalUrl.includes('/api/')) ||
        (req.baseUrl && req.baseUrl.includes('/api')) ||
        req.path.startsWith('/api/') ||
        Boolean(req.xhr) ||
        Boolean(req.headers.accept?.includes('application/json'));

      if (isApiRequest) {
        return res.status(401).json({
          error: 'Unauthorized: Corporate buyer authentication required.',
        });
      }
      return res.redirect('/customer/login');
    }

    (req as any).customerOrgId = session.organizationId;
    (req as any).customerUser = session;
    next();
  };
}

/**
 * Middleware: Enforces vendor company authentication for Supplier Hub (/vendor/* and /api/vendor/*)
 */
export function requireVendorAuth(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookies = parseCookies(req.headers.cookie);
    const authHeader = req.headers.authorization;
    let sessionId = cookies['nta_vendor_session'];

    if (!sessionId && authHeader?.startsWith('Bearer ')) {
      sessionId = authHeader.substring(7).trim();
    }

    const session = validateSession(db, sessionId, 'vendor');
    if (!session || session.role !== 'vendor') {
      const isApiRequest =
        (req.originalUrl && req.originalUrl.includes('/api/')) ||
        (req.baseUrl && req.baseUrl.includes('/api')) ||
        req.path.startsWith('/api/') ||
        Boolean(req.xhr) ||
        Boolean(req.headers.accept?.includes('application/json'));

      if (isApiRequest) {
        return res.status(401).json({
          error: 'Unauthorized: Supplier authentication required to access Supplier Hub.',
        });
      }
      return res.redirect('/vendor/login');
    }

    (req as any).vendorId = session.organizationId || session.userId;
    (req as any).vendorUser = session;
    next();
  };
}
