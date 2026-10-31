import Database from 'better-sqlite3';
import { validateBid } from './bid-calculator.js';

export interface LotRow {
  id: string;
  auction_id: string;
  lot_number: number;
  product_name: string;
  category?: string;
  quantity: number;
  uom: string;
  start_price: number;
  reserve_price: number;
  bid_decrement: number;
  current_lowest_bid: number | null;
  current_l1_vendor_id: string | null;
  current_l1_vendor_name?: string | null;
  status: string;
}

export class AuctionRepository {
  constructor(private db: Database.Database) {}

  /**
   * Places a bid atomically inside a database transaction.
   * If valid, updates the lot's lowest bid and L1 vendor simultaneously.
   */
  placeBid(lotId: string, vendorId: string, amount: number) {
    const transaction = this.db.transaction(() => {
      // 1. Fetch current lot state along with parent auction status and current end time
      const lot = this.db
        .prepare(`
          SELECT l.*, a.status as auction_status, a.current_end, a.scheduled_start
          FROM lots l
          JOIN auctions a ON l.auction_id = a.id
          WHERE l.id = ?
        `)
        .get(lotId) as (LotRow & { auction_status: string; current_end: string; scheduled_start: string }) | undefined;

      if (!lot) throw new Error('Procurement lot not found.');

      // Strict Enterprise Guard 1: Auction must be actively in live or extended state
      if (lot.auction_status !== 'live' && lot.auction_status !== 'extended') {
        throw new Error(`Bidding is strictly closed. Auction is currently in "${lot.auction_status}" status.`);
      }

      // Strict Enterprise Guard 2: Auction clock must not have expired
      const now = new Date();
      if (now > new Date(lot.current_end)) {
        throw new Error('Bidding window has expired. No further bids are accepted.');
      }

      // Strict Enterprise Guard 3: Lot must not be individually closed
      if (lot.status === 'closed') throw new Error('Lot is closed for bidding.');

      // 2. Validate bid using our Bid Calculator logic
      const validation = validateBid(amount, {
        startPrice: lot.start_price,
        currentLowestBid: lot.current_lowest_bid,
        bidDecrement: lot.bid_decrement,
      });

      if (!validation.isValid) {
        throw new Error(validation.reason);
      }

      // 3. Insert into immutable bids audit table
      this.db
        .prepare('INSERT INTO bids (lot_id, vendor_id, amount) VALUES (?, ?, ?)')
        .run(lotId, vendorId, amount);

      // 4. Update the lot's active L1 price and vendor
      this.db
        .prepare('UPDATE lots SET current_lowest_bid = ?, current_l1_vendor_id = ? WHERE id = ?')
        .run(amount, vendorId, lotId);

      return {
        success: true,
        lotId,
        amount,
        vendorId,
        newMaxAllowedBid: amount - lot.bid_decrement,
      };
    });

    return transaction();
  }

  getLotsForAuction(auctionId: string): LotRow[] {
    return this.db
      .prepare(`
        SELECT l.*, v.company_name as current_l1_vendor_name 
        FROM lots l 
        LEFT JOIN vendors v ON l.current_l1_vendor_id = v.id 
        WHERE l.auction_id = ? 
        ORDER BY l.lot_number ASC
      `)
      .all(auctionId) as LotRow[];
  }
}
