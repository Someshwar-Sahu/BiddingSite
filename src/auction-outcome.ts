export interface BidRecord {
  vendorId: string;
  vendorName: string;
  amount: number;
  timestamp: Date;
}

export interface LotSettlementInput {
  lotId: string;
  productName: string;
  quantity: number;
  uom: string;
  reservePrice: number;
  bids: BidRecord[];
}

export interface OutbidParticipant {
  vendorId: string;
  vendorName: string;
  bestBid: number;
}

export interface LotOutcomeSummary {
  lotId: string;
  productName: string;
  quantity: number;
  uom: string;
  reservePrice: number;
  status: 'sale_completed' | 'reserve_not_met' | 'no_bids';
  reserveMet: boolean;
  l1Winner: BidRecord | null;
  l2Standby: BidRecord | null;
  l2PriceDelta: number | null; // How much more expensive L2 was compared to L1
  unitSavings: number;
  totalSavings: number;
  uniqueBiddersCount: number;
  totalBidsCount: number;
  outbidVendors: OutbidParticipant[];
}

export interface EventOutcomeReport {
  auctionId: string;
  lots: LotOutcomeSummary[];
  totalEventSavings: number;
  salesCompletedCount: number;
  reserveNotMetCount: number;
  noBidsCount: number;
}

/**
 * Computes settlement outcome, L1/L2 ranks, and savings for a single lot.
 */
export function computeLotOutcome(lot: LotSettlementInput): LotOutcomeSummary {
  if (lot.bids.length === 0) {
    return {
      lotId: lot.lotId,
      productName: lot.productName,
      quantity: lot.quantity,
      uom: lot.uom,
      reservePrice: lot.reservePrice,
      status: 'no_bids',
      reserveMet: false,
      l1Winner: null,
      l2Standby: null,
      l2PriceDelta: null,
      unitSavings: 0,
      totalSavings: 0,
      uniqueBiddersCount: 0,
      totalBidsCount: 0,
      outbidVendors: [],
    };
  }

  // 1. Group by vendor to find each vendor's single lowest (best) bid
  const vendorBestBids = new Map<string, BidRecord>();
  for (const bid of lot.bids) {
    const existing = vendorBestBids.get(bid.vendorId);
    if (!existing || bid.amount < existing.amount) {
      vendorBestBids.set(bid.vendorId, bid);
    }
  }

  // 2. Sort all vendors by lowest amount (ascending for reverse auction)
  const rankedVendors = Array.from(vendorBestBids.values()).sort(
    (a, b) => a.amount - b.amount || a.timestamp.getTime() - b.timestamp.getTime()
  );

  const l1Winner = rankedVendors[0] || null;
  const l2Standby = rankedVendors[1] || null;

  // In Reverse Auction: Reserve is met if winning price <= Reserve Price
  const reserveMet = l1Winner !== null && l1Winner.amount <= lot.reservePrice;
  const status = reserveMet ? 'sale_completed' : 'reserve_not_met';

  // 3. Compute Savings
  let unitSavings = 0;
  let totalSavings = 0;
  if (reserveMet && l1Winner) {
    unitSavings = lot.reservePrice - l1Winner.amount;
    totalSavings = unitSavings * lot.quantity;
  }

  // 4. L2 Standby Price Delta (contingency cost if L1 defaults)
  const l2PriceDelta = (l1Winner && l2Standby) ? (l2Standby.amount - l1Winner.amount) : null;

  // 5. Outbid Participants (everyone except L1)
  const outbidVendors: OutbidParticipant[] = rankedVendors.slice(1).map((v) => ({
    vendorId: v.vendorId,
    vendorName: v.vendorName,
    bestBid: v.amount,
  }));

  return {
    lotId: lot.lotId,
    productName: lot.productName,
    quantity: lot.quantity,
    uom: lot.uom,
    reservePrice: lot.reservePrice,
    status,
    reserveMet,
    l1Winner,
    l2Standby,
    l2PriceDelta,
    unitSavings,
    totalSavings,
    uniqueBiddersCount: vendorBestBids.size,
    totalBidsCount: lot.bids.length,
    outbidVendors,
  };
}

/**
 * Aggregates all lot outcomes into the full Event Outcome Report.
 */
export function computeEventOutcome(
  auctionId: string,
  lots: LotSettlementInput[]
): EventOutcomeReport {
  const lotSummaries = lots.map(computeLotOutcome);

  let totalEventSavings = 0;
  let salesCompletedCount = 0;
  let reserveNotMetCount = 0;
  let noBidsCount = 0;

  for (const summary of lotSummaries) {
    totalEventSavings += summary.totalSavings;
    if (summary.status === 'sale_completed') salesCompletedCount++;
    else if (summary.status === 'reserve_not_met') reserveNotMetCount++;
    else if (summary.status === 'no_bids') noBidsCount++;
  }

  return {
    auctionId,
    lots: lotSummaries,
    totalEventSavings,
    salesCompletedCount,
    reserveNotMetCount,
    noBidsCount,
  };
}