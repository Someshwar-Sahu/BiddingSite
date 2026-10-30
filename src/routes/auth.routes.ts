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
    const session = validateSession(db, cookies['nta_customer_session']);
    if (!session || session.role !== 'customer') {
      return res.status(401).json({ authenticated: false });
    }
    res.json({ authenticated: true, user: session });
  });

  return router;
}

