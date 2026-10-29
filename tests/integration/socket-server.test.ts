import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { io as ClientSocket, type Socket as ClientSocketType } from 'socket.io-client';
import type http from 'http';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db.js';
import { createAuctionServer } from '../../src/server.js';

describe('Real-Time WebSocket Auction Server', () => {
  let db: Database.Database;
  let httpServer: http.Server;
  let port: number;
  let socketVendorA: ClientSocketType;
  let socketVendorB: ClientSocketType;
  let socketObserver: ClientSocketType;

  beforeEach(async () => {
    db = initializeDatabase(':memory:');

    // Seed test data
    db.prepare("INSERT INTO organizations VALUES ('org_epack', 'Epack', '03AAPCP3056IZE', 'epack@test.com', '9876543210', datetime('now'))").run();
    db.prepare("INSERT INTO vendors VALUES ('vnd_gold', 'Gold Global', 'Harsh', 'gold@test.com', '9876543210', '27AAPFU0939F1ZV', 'AAPFU0939F', 'approved', datetime('now'))").run();
    db.prepare("INSERT INTO vendors VALUES ('vnd_bridge', 'RS Bridge', 'Rahul', 'bridge@test.com', '9876543211', '27AAPFU0939F1ZV', 'AAPFU0939F', 'approved', datetime('now'))").run();

    db.prepare(`
      INSERT INTO auctions VALUES (
        'PTA-EPACKPetro-07', 'Epack Procurement', 'org_epack', 
        datetime('now', '-10 minutes'), datetime('now', '+50 minutes'), 60, 2, 3, 30, 
        datetime('now', '+50 minutes'), 'live', datetime('now')
      )
    `).run();

    db.prepare("INSERT INTO lots VALUES ('lot_pallets', 'PTA-EPACKPetro-07', 1, 'Pallets', 'Non-PCB', 5000, 'Nos', 1400, 1500, 5, NULL, NULL, 'open', datetime('now'))").run();

    // Seed magic tokens
    db.prepare("INSERT INTO auction_invites VALUES ('inv_1', 'PTA-EPACKPetro-07', 'vnd_gold', 'vendor', 'token_gold', datetime('now', '+1 day'), 0, datetime('now'))").run();
    db.prepare("INSERT INTO auction_invites VALUES ('inv_2', 'PTA-EPACKPetro-07', 'vnd_bridge', 'vendor', 'token_bridge', datetime('now', '+1 day'), 0, datetime('now'))").run();
    db.prepare("INSERT INTO auction_invites VALUES ('inv_3', 'PTA-EPACKPetro-07', NULL, 'customer_observer', 'token_observer', datetime('now', '+1 day'), 0, datetime('now'))").run();

    const serverInstance = createAuctionServer(db);
    httpServer = serverInstance.httpServer;

    // Start server on dynamic free port (0)
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address() as any;
        port = address.port;
        resolve();
      });
    });
  });

  afterEach(() => {
    socketVendorA?.disconnect();
    socketVendorB?.disconnect();
    socketObserver?.disconnect();
    httpServer?.close();
  });

  // ==========================================
  // POSITIVE TESTS (Happy Paths)
  // ==========================================
  describe('Positive Test Cases', () => {
    it('allows approved vendors to join room and broadcasts live bids to all clients', async () => {
      socketVendorA = ClientSocket(`http://localhost:${port}`);
      socketVendorB = ClientSocket(`http://localhost:${port}`);

      // Vendor A joins
      socketVendorA.emit('join_room', { auctionId: 'PTA-EPACKPetro-07', token: 'token_gold' });
      // Vendor B joins
      socketVendorB.emit('join_room', { auctionId: 'PTA-EPACKPetro-07', token: 'token_bridge' });

      // Wait for Vendor B to receive Vendor A's bid broadcast
      const broadcastPromise = new Promise<any>((resolve) => {
        socketVendorB.on('bid_placed', (data) => resolve(data));
      });

      // Vendor A places first bid: ₹1,390
      socketVendorA.emit('submit_bid', { lotId: 'lot_pallets', amount: 1390 });

      const broadcastData = await broadcastPromise;
      expect(broadcastData.lotId).toBe('lot_pallets');
      expect(broadcastData.amount).toBe(1390);
      expect(broadcastData.newMaxAllowedBid).toBe(1385);
      expect(broadcastData.vendorCompanyName).toBe('Gold Global');
    });

    it('emits an outbid alert to the previous L1 vendor when overtaken', async () => {
      socketVendorA = ClientSocket(`http://localhost:${port}`);
      socketVendorB = ClientSocket(`http://localhost:${port}`);

      // 1. Wait for both vendors to complete connection and join the room
      await Promise.all([
        new Promise((resolve) => {
          socketVendorA.on('room_joined', resolve);
          socketVendorA.emit('join_room', { auctionId: 'PTA-EPACKPetro-07', token: 'token_gold' });
        }),
        new Promise((resolve) => {
          socketVendorB.on('room_joined', resolve);
          socketVendorB.emit('join_room', { auctionId: 'PTA-EPACKPetro-07', token: 'token_bridge' });
        }),
      ]);

      // 2. Vendor A submits bid (1390) and we WAIT until it is confirmed on the room
      await new Promise((resolve) => {
        socketVendorA.once('bid_placed', resolve);
        socketVendorA.emit('submit_bid', { lotId: 'lot_pallets', amount: 1390 });
      });

      // 3. Set up outbid listener on Vendor A
      const outbidPromise = new Promise<any>((resolve) => {
        socketVendorA.once('outbid_alert', (data) => resolve(data));
      });

      // 4. Now Vendor B safely underbids to 1380
      socketVendorB.emit('submit_bid', { lotId: 'lot_pallets', amount: 1380 });

      // 5. Vendor A receives the alert that they were outbid
      const alertData = await outbidPromise;
      expect(alertData.outbidVendorId).toBe('vnd_gold');
      expect(alertData.newLowestBid).toBe(1380);
    });
  });

  // ==========================================
  // NEGATIVE TESTS (Observer Block & Invalid Bids)
  // ==========================================
  describe('Negative Test Cases', () => {
    it('strictly forbids Customer Observers from placing bids', async () => {
      socketObserver = ClientSocket(`http://localhost:${port}`);
      socketObserver.emit('join_room', { auctionId: 'PTA-EPACKPetro-07', token: 'token_observer' });

      const errorPromise = new Promise<any>((resolve) => {
        socketObserver.on('error_message', (err) => resolve(err));
      });

      // Observer attempts to submit a bid
      socketObserver.emit('submit_bid', { lotId: 'lot_pallets', amount: 1300 });

      const error = await errorPromise;
      expect(error.code).toBe('OBSERVER_CANNOT_BID');
      expect(error.message).toContain('read-only mode');
    });

    it('rejects bids that violate the decrement step over WebSocket', async () => {
      socketVendorA = ClientSocket(`http://localhost:${port}`);
      socketVendorA.emit('join_room', { auctionId: 'PTA-EPACKPetro-07', token: 'token_gold' });

      // First bid 1390
      socketVendorA.emit('submit_bid', { lotId: 'lot_pallets', amount: 1390 });

      const errorPromise = new Promise<any>((resolve) => {
        socketVendorA.on('error_message', (err) => resolve(err));
      });

      // Next max allowed is 1385. Submitting 1388 is illegal!
      socketVendorA.emit('submit_bid', { lotId: 'lot_pallets', amount: 1388 });

      const error = await errorPromise;
      expect(error.code).toBe('INVALID_BID');
      expect(error.message).toContain('exceeds maximum allowed bid');
    });
  });
});