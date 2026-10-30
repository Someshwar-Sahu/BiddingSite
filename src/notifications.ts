import { Router } from 'express';
import Database from 'better-sqlite3';
import { Server as SocketIOServer } from 'socket.io';
import { parseCookies, validateSession } from './auth.js';

export interface NotificationPayload {
  recipient_role: 'admin' | 'customer' | 'all';
  recipient_org_id?: string | null;
  title: string;
  message: string;
  type:
    | 'tender_request_new'
    | 'tender_request_revised'
    | 'tender_request_approved'
    | 'tender_request_rejected'
    | 'amendment_request'
    | 'amendment_decision'
    | 'auction_live'
    | 'auction_concluded';
  reference_id?: string | null;
  target_url?: string | null;
}

export function createNotification(
  db: Database.Database,
  io: SocketIOServer | null,
  payload: NotificationPayload
) {
  const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO notifications (
        id, recipient_role, recipient_org_id, title, message, type, 
        reference_id, target_url, is_read, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      payload.recipient_role,
      payload.recipient_org_id || null,
      payload.title,
      payload.message,
      payload.type,
      payload.reference_id || null,
      payload.target_url || null,
      now
    );

    const record = {
      id,
      ...payload,
      is_read: 0,
      created_at: now,
    };

    // Emit live push event if Socket.IO is initialized
    if (io) {
      if (payload.recipient_role === 'admin' || payload.recipient_role === 'all') {
        io.to('role:admin').emit('new_notification', record);
      }
      if (payload.recipient_role === 'customer' || payload.recipient_role === 'all') {
        if (payload.recipient_org_id) {
          io.to(`org:${payload.recipient_org_id}`).emit('new_notification', record);
        } else {
          io.to('role:customer').emit('new_notification', record);
        }
      }
    }

    return record;
  } catch (err) {
    console.warn('Failed to persist notification:', err);
    return null;
  }
}

export function createNotificationsRouter(db: Database.Database, io?: SocketIOServer): Router {
  const router = Router();

  function resolveRealm(req: any): 'admin' | 'customer' | 'vendor' | null {
    const requested = (req.query.realm as string) || (req.body?.realm as string) || (req.headers['x-nta-realm'] as string);
    if (requested === 'admin' || requested === 'customer' || requested === 'vendor') {
      return requested;
    }
    const referer = req.headers.referer || '';
    if (referer.includes('/admin')) return 'admin';
    if (referer.includes('/customer')) return 'customer';
    return null;
  }

  // 1. Get notifications strictly scoped to the authenticated realm
  router.get('/notifications', (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const realm = resolveRealm(req);

      if (realm === 'admin') {
        const adminToken = cookies['nta_admin_session'];
        const adminSession = adminToken ? validateSession(db, adminToken, 'admin') : null;
        if (!adminSession) {
          return res.status(401).json({ error: 'Valid admin session required.' });
        }

        const notifications = db
          .prepare(`
            SELECT * FROM notifications 
            WHERE recipient_role IN ('admin', 'all')
            ORDER BY created_at DESC 
            LIMIT 40
          `)
          .all();

        const countRow = db
          .prepare(`
            SELECT COUNT(*) as count FROM notifications 
            WHERE recipient_role IN ('admin', 'all') AND is_read = 0
          `)
          .get() as any;

        return res.json({ notifications, unreadCount: countRow?.count || 0 });
      }

      if (realm === 'customer') {
        const custToken = cookies['nta_customer_session'];
        const custSession = custToken ? validateSession(db, custToken, 'customer') : null;
        if (!custSession || !custSession.organizationId) {
          return res.status(401).json({ error: 'Valid corporate buyer session required.' });
        }

        const notifications = db
          .prepare(`
            SELECT * FROM notifications 
            WHERE (recipient_role IN ('customer', 'all')) 
              AND (recipient_org_id = ? OR recipient_org_id IS NULL)
            ORDER BY created_at DESC 
            LIMIT 40
          `)
          .all(custSession.organizationId);

        const countRow = db
          .prepare(`
            SELECT COUNT(*) as count FROM notifications 
            WHERE (recipient_role IN ('customer', 'all')) 
              AND (recipient_org_id = ? OR recipient_org_id IS NULL)
              AND is_read = 0
          `)
          .get(custSession.organizationId) as any;

        return res.json({ notifications, unreadCount: countRow?.count || 0 });
      }

      // If realm is unrecognized or unauthenticated
      return res.status(401).json({ error: 'Authentication required for notifications realm.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Mark single notification as read with ownership validation
  router.post('/notifications/:id/read', (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const realm = resolveRealm(req);
      const notif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id) as any;
      if (!notif) return res.status(404).json({ error: 'Notification not found' });

      if (realm === 'admin' || notif.recipient_role === 'admin') {
        const adminSession = validateSession(db, cookies['nta_admin_session'], 'admin');
        if (!adminSession) return res.status(401).json({ error: 'Admin session required' });
      } else if (realm === 'customer' || notif.recipient_role === 'customer') {
        const custSession = validateSession(db, cookies['nta_customer_session'], 'customer');
        if (!custSession) return res.status(401).json({ error: 'Customer session required' });
        if (notif.recipient_org_id && notif.recipient_org_id !== custSession.organizationId) {
          return res.status(403).json({ error: 'Unauthorized to modify notification for another organization' });
        }
      }

      db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Mark all notifications as read strictly for current realm
  router.post('/notifications/mark-all-read', (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const realm = resolveRealm(req);

      if (realm === 'admin') {
        const adminSession = validateSession(db, cookies['nta_admin_session'], 'admin');
        if (!adminSession) return res.status(401).json({ error: 'Admin session required' });
        db.prepare("UPDATE notifications SET is_read = 1 WHERE recipient_role IN ('admin', 'all')").run();
        return res.json({ success: true });
      }

      if (realm === 'customer') {
        const custSession = validateSession(db, cookies['nta_customer_session'], 'customer');
        if (!custSession || !custSession.organizationId) {
          return res.status(401).json({ error: 'Customer session required' });
        }
        db.prepare(
          "UPDATE notifications SET is_read = 1 WHERE (recipient_role IN ('customer', 'all')) AND (recipient_org_id = ? OR recipient_org_id IS NULL)"
        ).run(custSession.organizationId);
        return res.json({ success: true });
      }

      return res.status(401).json({ error: 'Authentication required for notifications realm' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Delete / dismiss a notification with ownership validation
  router.delete('/notifications/:id', (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const realm = resolveRealm(req);
      const notif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id) as any;
      if (!notif) return res.status(404).json({ error: 'Notification not found' });

      if (realm === 'admin' || notif.recipient_role === 'admin') {
        const adminSession = validateSession(db, cookies['nta_admin_session'], 'admin');
        if (!adminSession) return res.status(401).json({ error: 'Admin session required' });
      } else if (realm === 'customer' || notif.recipient_role === 'customer') {
        const custSession = validateSession(db, cookies['nta_customer_session'], 'customer');
        if (!custSession || (notif.recipient_org_id && notif.recipient_org_id !== custSession.organizationId)) {
          return res.status(403).json({ error: 'Unauthorized to delete this notification' });
        }
      }

      db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

