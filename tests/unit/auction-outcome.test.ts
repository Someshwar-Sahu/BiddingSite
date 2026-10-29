import { describe, it, expect } from 'vitest';
import {
  computeLotOutcome,
  computeEventOutcome,
  type LotSettlementInput,
} from '../../src/auction-outcome.js';

describe('Auction Outcome, Savings & L1/L2 Fallback Engine', () => {
  // Test data matching PTA-EPACKPetro-07 Lot 1: Imported Coal
  const coalLotInput: LotSettlementInput = {
    lotId: 'lot_coal_01',
    productName: 'Imported Coal _Epackpetro-07',
    quantity: 500,
    uom: 'MT',
    reservePrice: 13500,
    bids: [
      { vendorId: 'vnd_om', vendorName: 'Om Industries', amount: 12980, timestamp: new Date('2026-10-28T15:40:00Z') },
      { vendorId: 'vnd_dilip', vendorName: 'Dilip Valera', amount: 12600, timestamp: new Date('2026-10-28T15:42:00Z') },
      { vendorId: 'vnd_mech', vendorName: 'Mechman Engi', amount: 11390, timestamp: new Date('2026-10-28T15:45:00Z') },
      { vendorId: 'vnd_bridge', vendorName: 'RS Bridge Consultancy', amount: 10730, timestamp: new Date('2026-10-28T15:55:00Z') },
      { vendorId: 'vnd_gold', vendorName: 'Gold Global Fuels', amount: 10720, timestamp: new Date('2026-10-28T15:58:00Z') },
    ],
  };

  // Test data matching PTA-EPACKPetro-07 Lot 2: Pallets
  const palletsLotInput: LotSettlementInput = {
    lotId: 'lot_pallets_02',
    productName: 'Pallets Epackpetro-07',
    quantity: 5000,
    uom: 'Nos',
    reservePrice: 1500,
    bids: [
      { vendorId: 'vnd_plastocon', vendorName: 'Plastocon', amount: 1389, timestamp: new Date('2026-10-28T15:41:00Z') },
      { vendorId: 'vnd_bridge', vendorName: 'RS Bridge Consultancy', amount: 1135, timestamp: new Date('2026-10-28T15:57:00Z') },
      { vendorId: 'vnd_vision', vendorName: 'Vision India', amount: 1140, timestamp: new Date('2026-10-28T15:56:00Z') },
    ],
  };

  // ==========================================
  // POSITIVE TESTS (Happy Paths)
  // ==========================================
  describe('Positive Test Cases', () => {
    it('correctly identifies L1 winner and L2 standby awardee for Coal', () => {
      const outcome = computeLotOutcome(coalLotInput);

      expect(outcome.status).toBe('sale_completed');
      expect(outcome.reserveMet).toBe(true);

      // L1 Winner is Gold Global Fuels @ 10,720
      expect(outcome.l1Winner?.vendorName).toBe('Gold Global Fuels');
      expect(outcome.l1Winner?.amount).toBe(10720);

      // L2 Standby is RS Bridge @ 10,730
      expect(outcome.l2Standby?.vendorName).toBe('RS Bridge Consultancy');
      expect(outcome.l2Standby?.amount).toBe(10730);

      // Price delta is ₹10
      expect(outcome.l2PriceDelta).toBe(10);
    });

    it('calculates the exact unit and total savings for Coal (₹13.9 Lakhs)', () => {
      const outcome = computeLotOutcome(coalLotInput);
      // Unit savings: 13,500 - 10,720 = 2,780
      expect(outcome.unitSavings).toBe(2780);
      // Total savings: 2,780 * 500 MT = 13,90,000
      expect(outcome.totalSavings).toBe(1390000);
    });

    it('calculates the exact unit and total savings for Pallets (₹18.25 Lakhs)', () => {
      const outcome = computeLotOutcome(palletsLotInput);
      // Unit savings: 1,500 - 1,135 = 365
      expect(outcome.unitSavings).toBe(365);
      // Total savings: 365 * 5000 Nos = 18,25,000
      expect(outcome.totalSavings).toBe(1825000);
    });

    it('aggregates total event savings across all lots to ₹32.15 Lakhs', () => {
      const report = computeEventOutcome('PTA-EPACKPetro-07', [coalLotInput, palletsLotInput]);

      // Total savings: 13,90,000 + 18,25,000 = 32,15,000
      expect(report.totalEventSavings).toBe(3215000);
      expect(report.salesCompletedCount).toBe(2);
      expect(report.reserveNotMetCount).toBe(0);
      expect(report.noBidsCount).toBe(0);
    });

    it('identifies all outbid vendors accurately for EMD release', () => {
      const outcome = computeLotOutcome(coalLotInput);
      // 5 unique vendors participated, 1 won, 4 were outbid
      expect(outcome.uniqueBiddersCount).toBe(5);
      expect(outcome.outbidVendors).toHaveLength(4);
      expect(outcome.outbidVendors.map((v) => v.vendorName)).toContain('Om Industries');
      expect(outcome.outbidVendors.map((v) => v.vendorName)).toContain('RS Bridge Consultancy');
    });
  });

  // ==========================================
  // NEGATIVE TESTS (Boundaries & Edge Cases)
  // ==========================================
  describe('Negative Test Cases', () => {
    it('handles a lot with zero bids gracefully', () => {
      const emptyLot: LotSettlementInput = {
        lotId: 'lot_empty',
        productName: 'Scrap Iron',
        quantity: 10,
        uom: 'MT',
        reservePrice: 50000,
        bids: [],
      };

      const outcome = computeLotOutcome(emptyLot);
      expect(outcome.status).toBe('no_bids');
      expect(outcome.reserveMet).toBe(false);
      expect(outcome.l1Winner).toBeNull();
      expect(outcome.l2Standby).toBeNull();
      expect(outcome.totalSavings).toBe(0);
      expect(outcome.outbidVendors).toHaveLength(0);
    });

    it('marks lot as reserve_not_met if lowest bid exceeds reserve price', () => {
      const highBidsLot: LotSettlementInput = {
        lotId: 'lot_high',
        productName: 'Industrial Valves',
        quantity: 100,
        uom: 'Nos',
        reservePrice: 1000, // Maximum client is willing to pay
        bids: [
          // Lowest vendor bid is 1200 (higher than reserve 1000)
          { vendorId: 'vnd_1', vendorName: 'Supplier A', amount: 1200, timestamp: new Date() },
          { vendorId: 'vnd_2', vendorName: 'Supplier B', amount: 1400, timestamp: new Date() },
        ],
      };

      const outcome = computeLotOutcome(highBidsLot);
      expect(outcome.status).toBe('reserve_not_met');
      expect(outcome.reserveMet).toBe(false);
      expect(outcome.totalSavings).toBe(0); // No savings credited if reserve wasn't met
    });

    it('handles single-bidder scenario where no L2 standby exists', () => {
      const singleBidderLot: LotSettlementInput = {
        lotId: 'lot_solo',
        productName: 'Custom Machined Gear',
        quantity: 1,
        uom: 'Nos',
        reservePrice: 20000,
        bids: [
          { vendorId: 'vnd_solo', vendorName: 'Solo Fabricator', amount: 18000, timestamp: new Date() },
        ],
      };

      const outcome = computeLotOutcome(singleBidderLot);
      expect(outcome.status).toBe('sale_completed');
      expect(outcome.l1Winner?.vendorName).toBe('Solo Fabricator');
      expect(outcome.l2Standby).toBeNull(); // No L2 available
      expect(outcome.l2PriceDelta).toBeNull();
      expect(outcome.outbidVendors).toHaveLength(0);
    });
  });
});