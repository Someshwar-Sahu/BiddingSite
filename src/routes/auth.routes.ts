import { Router } from 'express';
import Database from 'better-sqlite3';
import {
  verifyPassword,
  createSession,
  validateSession,
  parseCookies,
  hashPassword,
} from '../auth.js';

export function createAuthRouter(db: Database.Database): Router {
  const router = Router();

  // ==========================================
  // REALM 1: ADMIN AUTHENTICATION
  // ==========================================

  // Admin Login
  router.post('/admin/login', (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Please enter both admin email and password.' });
      }

      const user = db
        .prepare('SELECT * FROM platform_users WHERE email = ? AND role = ?')
        .get(email.trim().toLowerCase(), 'admin') as any;

      if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid admin credentials.' });
      }

      // Create session
      const sessionId = createSession(db, user.id, 'admin', undefined, 7);

      // Set HttpOnly SameSite cookie
      res.setHeader(
        'Set-Cookie',
        `nta_admin_session=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 3600}`
      );

      res.json({
        success: true,
        message: 'Admin authentication successful.',
        sessionId,
        user: { id: user.id, email: user.email, full_name: user.full_name },
        redirect: '/admin/auctions',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin Logout
  router.post('/admin/logout', (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const sessionId = cookies['nta_admin_session'];
      if (sessionId) {
        db.prepare('DELETE FROM user_sessions WHERE session_id = ?').run(sessionId);
      }
      res.setHeader('Set-Cookie', 'nta_admin_session=; Path=/; HttpOnly; Max-Age=0');
      res.json({ success: true, redirect: '/admin/login' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // REALM 2: CUSTOMER ENTERPRISE AUTHENTICATION
  // ==========================================

  // Customer Login
  router.post('/customer/login', (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Please provide your corporate email and password.' });
      }

      const user = db
        .prepare('SELECT * FROM platform_users WHERE email = ? AND role = ?')
        .get(email.trim().toLowerCase(), 'customer') as any;

      if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid corporate buyer credentials.' });
      }

      // Create corporate session
      const sessionId = createSession(db, user.id, 'customer', user.organization_id, 7);

      res.setHeader(
        'Set-Cookie',
        `nta_customer_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`
      );

      res.json({
        success: true,
        message: 'Corporate buyer authenticated.',
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          organization_id: user.organization_id,
        },
        redirect: '/customer/dashboard',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Customer Logout
  router.post('/customer/logout', (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const sessionId = cookies['nta_customer_session'];
      if (sessionId) {
        db.prepare('DELETE FROM user_sessions WHERE session_id = ?').run(sessionId);
      }
      res.setHeader('Set-Cookie', 'nta_customer_session=; Path=/; HttpOnly; Max-Age=0');
      res.json({ success: true, redirect: '/customer/login' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Check Current Customer Session
  router.get('/customer/me', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = validateSession(db, cookies['nta_customer_session'], 'customer');
    if (!session || session.role !== 'customer') {
      return res.status(401).json({ authenticated: false });
    }
    res.json({ authenticated: true, user: session });
  });

  // ==========================================
  // REALM 3: SUPPLIER / VENDOR AUTHENTICATION
  // ==========================================

  // Vendor Direct Login (Email + Permanent PIN/Password)
  router.post('/vendor/login', (req, res) => {
    try {
      const { email, pin, password } = req.body;
      const cred = pin || password;

      if (!email || !cred) {
        return res.status(400).json({ error: 'Please enter your registered supplier email and permanent PIN/Password.' });
      }

      const cleanEmail = email.trim().toLowerCase();

      // 1. Locate vendor record in master vendors table by email
      const vendor = db
        .prepare('SELECT * FROM vendors WHERE LOWER(email) = ?')
        .get(cleanEmail) as any;

      if (!vendor) {
        return res.status(401).json({ error: 'Unrecognized supplier email. Please contact the procurement desk.' });
      }

      // 2. Validate supplier status & KYC compliance
      if (vendor.status === 'unregistered') {
        return res.status(403).json({
          error: 'Supplier onboarding incomplete. Please use the onboarding invitation link sent to your email to complete registration.',
        });
      }

      if (vendor.status === 'pending_approval') {
        return res.status(403).json({
          error: 'Your supplier KYC is currently pending verification by NexTrade Operations Desk. You will be able to log in once approved.',
        });
      }

      if (vendor.status === 'blacklisted') {
        return res.status(403).json({
          error: 'Supplier account suspended. Please contact the compliance desk for assistance.',
        });
      }

      if (!vendor.password_hash) {
        return res.status(403).json({
          error: 'Access PIN not yet configured. Please use your activation link to set your permanent PIN.',
        });
      }

      // 3. Verify PIN/Password
      if (!verifyPassword(String(cred), vendor.password_hash)) {
        return res.status(401).json({ error: 'Invalid supplier PIN / Access Password.' });
      }

      const expectedHash = vendor.password_hash;

      // 4. Ensure platform_user exists for session joining (organization_id is NULL)
      const uId = `usr_${vendor.id}`;
      try {
        db.prepare(`
          INSERT INTO platform_users (id, email, password_hash, role, organization_id, full_name)
          VALUES (?, ?, ?, 'vendor', NULL, ?)
          ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash
        `).run(uId, cleanEmail, expectedHash, vendor.company_name);
      } catch (upsertErr) {
        // Fallback for older sqlite
        db.prepare("UPDATE platform_users SET password_hash = ? WHERE LOWER(email) = ?").run(expectedHash, cleanEmail);
      }

      // 5. Create persistent 30-day supplier session (storing vendor.id as organizationId)
      const sessionId = createSession(db, uId, 'vendor', vendor.id, 30);

      res.setHeader(
        'Set-Cookie',
        `nta_vendor_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`
      );

      res.json({
        success: true,
        message: 'Supplier authentication successful.',
        sessionId,
        vendor: {
          id: vendor.id,
          companyName: vendor.company_name,
          email: vendor.email,
        },
        redirect: '/vendor/dashboard',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vendor Logout
  router.post('/vendor/logout', (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const sessionId = cookies['nta_vendor_session'];
      if (sessionId) {
        db.prepare('DELETE FROM user_sessions WHERE session_id = ?').run(sessionId);
      }
      res.setHeader('Set-Cookie', 'nta_vendor_session=; Path=/; HttpOnly; Max-Age=0');
      res.json({ success: true, redirect: '/vendor/login' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Check Current Vendor Session
  router.get('/vendor/me', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = validateSession(db, cookies['nta_vendor_session'], 'vendor');
    if (!session || session.role !== 'vendor') {
      return res.status(401).json({ authenticated: false });
    }

    const vendorId = session.organizationId || session.userId;
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendorId) as any;

    res.json({
      authenticated: true,
      vendor: {
        id: vendorId,
        companyName: vendor?.company_name || session.fullName,
        email: session.email,
        contactPerson: vendor?.contact_person || 'Representative',
        phone: vendor?.phone,
        gstin: vendor?.gstin,
        pan: vendor?.pan,
      },
    });
  });

  return router;
}
