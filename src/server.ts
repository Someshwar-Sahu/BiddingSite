import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import Database from 'better-sqlite3';
import { AuctionRepository } from './auction-repository.js';
import { createPublicRouter } from './routes/public.routes.js';
import { createAdminCompaniesRouter } from './routes/admin-companies.routes.js';
import { createAdminAuctionsRouter } from './routes/admin-auctions.routes.js';
import { createCustomerRequestsRouter } from './routes/customer-requests.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createNotificationsRouter } from './notifications.js';
import { requireAdminAuth, requireCustomerAuth, seedDefaultUsers, parseCookies, validateSession } from './auth.js';
import { registerAuctionSockets } from './sockets/auction-socket.js';
import { startAuctionTicker } from './sockets/clock-ticker.js';
import path from 'path';

export interface ServerInstance {
  app: express.Express;
  httpServer: http.Server;
  io: SocketIOServer;
}

export function createAuctionServer(db: Database.Database): ServerInstance {
  // Ensure default demo credentials exist in database
  seedDefaultUsers(db);

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Global Anti-Cache Middleware (Forces fresh auth validation on browser Back/Forward)
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // Realm 1 Firewall: Intercept and guard all /admin paths before static assets
  app.use('/admin', (req, res, next) => {
    if (req.path === '/login') {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies['nta_admin_session'];
      if (token && validateSession(db, token, 'admin')) {
        return res.redirect('/admin/auctions');
      }
      return next();
    }
    requireAdminAuth(db)(req, res, next);
  });

  // Realm 2 Firewall: Intercept and guard all /customer paths before static assets
  app.use('/customer', (req, res, next) => {
    if (req.path === '/login') {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies['nta_customer_session'];
      if (token && validateSession(db, token, 'customer')) {
        return res.redirect('/customer/dashboard');
      }
      return next();
    }
    requireCustomerAuth(db)(req, res, next);
  });

  // Serve Vite React build output and public assets
  app.use(express.static('dist/client'));
  app.use(express.static('public'));

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  const repo = new AuctionRepository(db);

  // Mount modular route groups
  app.use('/api', createAuthRouter(db));
  app.use('/api', createNotificationsRouter(db, io));
  app.use('/', createPublicRouter(repo, db));
  app.use('/api/admin', requireAdminAuth(db), createAdminCompaniesRouter(db));
  app.use('/api/admin', requireAdminAuth(db), createAdminAuctionsRouter(db, repo, io));
  app.use('/api', createCustomerRequestsRouter(db, io));

  // Mount real-time WebSockets
  registerAuctionSockets(io, db, repo);

  // Start 1-second countdown clock ticker
  const ticker = startAuctionTicker(io, db);
  httpServer.on('close', () => clearInterval(ticker));

  return { app, httpServer, io };
}
