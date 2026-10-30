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
import { registerAuctionSockets } from './sockets/auction-socket.js';
import { startAuctionTicker } from './sockets/clock-ticker.js';

export interface ServerInstance {
  app: express.Express;
  httpServer: http.Server;
  io: SocketIOServer;
}

export function createAuctionServer(db: Database.Database): ServerInstance {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static('public'));

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  const repo = new AuctionRepository(db);

  // Mount modular route groups
  app.use('/', createPublicRouter(repo, db));
  app.use('/api/admin', createAdminCompaniesRouter(db));
  app.use('/api/admin', createAdminAuctionsRouter(db, repo));
  app.use('/api', createCustomerRequestsRouter(db));

  // Mount real-time WebSockets
  registerAuctionSockets(io, db, repo);

  // Start 1-second countdown clock ticker
  const ticker = startAuctionTicker(io, db);
  httpServer.on('close', () => clearInterval(ticker));

  return { app, httpServer, io };
}
