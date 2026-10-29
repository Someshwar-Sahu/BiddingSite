import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db.js';
import { AuctionRepository } from '../../src/auction-repository.js';

describe('Database & Auction Repository Integration', () => {
  let db: Database.Database;
  let repo: AuctionRepository;

  beforeEach(() => {
    // Run against a fast in-memory database for complete test isolation
    db = initializeDatabase(':memory:');
    repo = new AuctionRepository(db);

    // Seed test organization
    db.prepare(`
      INSERT INTO organizations (id, name, gstin, email) 
      VALUES ('org_epack', 'Epack Petrochem Solutions Pvt Ltd', '03AAPCP3056IZE', 'procurement@epack.in')
    `).run();

    // Seed test vendors
    db.prepare(`
      INSERT INTO vendors (id, company_name, contact_person, email, phone, status) 
      VALUES 
        ('vnd_gold', 'Gold Global Fuels', 'Harsh', 'gold@test.com', '9876543210', 'approved'),
        ('vnd_bridge', 'RS Bridge Consultancy', 'Rahul', 'bridge@test.com', '9876543211', 'approved')
    `).run();

    // Seed test auction
    db.prepare(`
      INSERT INTO auctions (id, title, customer_org_id, scheduled_start, scheduled_end, current_end)
      VALUES ('PTA-EPACKPetro-07', 'Epack Petrochem Procurement', 'org_epack', '2026-10-28 15:00:00', '2026-10-28 16:00:00', '2026-10-28 16:00:00')
    `).run();

    // Seed test lot: Pallets (Start: 1400, Reserve: 1500, Decrement: 5)
    db.prepare(`
      INSERT INTO lots (id, auction_id, lot_number, product_name, quantity, uom, start_price, reserve_price, bid_decrement)
      VALUES ('lot_pallets', 'PTA-EPACKPetro-07', 1, 'Pallets Epackpetro-07', 5000, 'Nos', 1400, 1500, 5)
    `).run();
  });

  // ==========================================
  // POSITIVE TESTS (Happy Paths)
  // ==========================================
  describe('Positive Test Cases', () => {
    it('allows a vendor to submit a valid first bid', () => {
      // First bid can be up to start price (1400)
      const result = repo.placeBid('lot_pallets', 'vnd_gold', 1390);

      expect(result.success).toBe(true);
      expect(result.amount).toBe(1390);
      expect(result.newMaxAllowedBid).toBe(1385);

      // Verify database state updated
      const lots = repo.getLotsForAuction('PTA-EPACKPetro-07');
      expect(lots[0].current_lowest_bid).toBe(1390);
      expect(lots[0].current_l1_vendor_id).toBe('vnd_gold');
    });

    it('allows a competing vendor to underbid the current lowest bid', () => {
      // First bid by Gold Global @ 1390
      repo.placeBid('lot_pallets', 'vnd_gold', 1390);

      // RS Bridge underbids to 1380
      const result = repo.placeBid('lot_pallets', 'vnd_bridge', 1380);
      expect(result.success).toBe(true);

      const lots = repo.getLotsForAuction('PTA-EPACKPetro-07');
      expect(lots[0].current_lowest_bid).toBe(1380);
      expect(lots[0].current_l1_vendor_id).toBe('vnd_bridge');
    });
  });

  // ==========================================
  // NEGATIVE TESTS (Boundaries & Rejections)
  // ==========================================
  describe('Negative Test Cases', () => {
    it('rejects a bid that does not meet the minimum decrement', () => {
      repo.placeBid('lot_pallets', 'vnd_gold', 1390);

      // Next max allowed is 1385. Submitting 1388 must throw!
      expect(() => {
        repo.placeBid('lot_pallets', 'vnd_bridge', 1388);
      }).toThrow(/exceeds maximum allowed bid/);
    });

    it('rejects a bid for a non-existent lot', () => {
      expect(() => {
        repo.placeBid('lot_ghost', 'vnd_gold', 1000);
      }).toThrow('Lot not found.');
    });

    it('prevents bids if the lot is marked closed', () => {
      db.prepare("UPDATE lots SET status = 'closed' WHERE id = 'lot_pallets'").run();

      expect(() => {
        repo.placeBid('lot_pallets', 'vnd_gold', 1200);
      }).toThrow('Lot is closed for bidding.');
    });
  });
});