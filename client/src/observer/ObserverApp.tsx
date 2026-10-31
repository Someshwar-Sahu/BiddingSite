import React, { useEffect, useState, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useObserverAudio } from './useObserverAudio';
import { SearchBar } from '../components/SearchBar';

interface Lot {
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
  status: string;
  current_lowest_bid?: number | null;
  current_l1_vendor_id?: string | null;
  current_l1_vendor_name?: string | null;
}

interface AuctionData {
  id: string;
  title: string;
  customer_name?: string;
  customer_gstin?: string;
  status: 'scheduled' | 'live' | 'extended' | 'ended';
  scheduled_start: string;
  current_end: string;
  duration_minutes: number;
  delivery_location?: string;
  category?: string;
}

interface AuditItem {
  id?: string;
  vendor_name: string;
  product_name: string;
  amount: number;
  deltaDrop?: number;
  uom: string;
  timestamp: string;
}

export const ObserverApp: React.FC = () => {
  const { isMuted, toggleMute, playBidChime, playExtensionAlert } = useObserverAudio();

  // Extract auctionId from URL pathname: /observer/:id
  const auctionId = useMemo(() => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'NTA-EPACKPetro-07';
  }, []);

  // Extract key token if provided via query param
  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('key') || undefined;
  }, []);

  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [auditFeed, setAuditFeed] = useState<AuditItem[]>([]);
  const [totalBidsCount, setTotalBidsCount] = useState<number>(0);
  const [currentStatus, setCurrentStatus] = useState<'scheduled' | 'live' | 'extended' | 'ended'>('scheduled');
  const [clockDisplay, setClockDisplay] = useState<string>('00h 00m 00s');
  const [extensionNotice, setExtensionNotice] = useState<string | null>(null);
  const [flashingLotId, setFlashingLotId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search states for Lots and Audit Feed
  const [lotSearch, setLotSearch] = useState<string>('');
  const [auditSearch, setAuditSearch] = useState<string>('');

  const socketRef = useRef<Socket | null>(null);

  // 1. Fetch Initial Room State via REST
  useEffect(() => {
    let isMounted = true;
    const fetchRoomState = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/auctions/${auctionId}/room-state`);
        if (!res.ok) {
          throw new Error(`Failed to load auction room (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (!isMounted) return;

        setAuction(data.auction);
        setCurrentStatus(data.auction.status);
        setLots(data.lots || []);

        if (Array.isArray(data.bids) && data.bids.length > 0) {
          setTotalBidsCount(data.bids.length);
          const initialFeed: AuditItem[] = data.bids.map((b: any) => ({
            id: b.id,
            vendor_name: b.vendor_name || 'Approved Supplier',
            product_name: b.product_name,
            amount: b.amount,
            uom: b.uom,
            timestamp: b.created_at,
          }));
          setAuditFeed(initialFeed);
        }
      } catch (err: any) {
        if (isMounted) setErrorMessage(err.message || 'Error connecting to room');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchRoomState();
    return () => {
      isMounted = false;
    };
  }, [auctionId]);

  // 2. Establish WebSocket Real-Time Connection
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room', { auctionId, token });
    });

    socket.on('room_joined', (data: any) => {
      if (data.status) setCurrentStatus(data.status);
      if (Array.isArray(data.lots) && data.lots.length > 0) {
        setLots(data.lots);
      }
    });

    socket.on('clock_tick', (data: { formattedTime: string; remainingSeconds: number; status: string }) => {
      if (data.status !== 'ended') {
        setClockDisplay(data.formattedTime);
      } else {
        setClockDisplay('Concluded');
      }
      setCurrentStatus(data.status as any);
    });

    socket.on('bid_placed', (data: { lotId: string; amount: number; vendorCompanyName: string; timestamp: string }) => {
      playBidChime(750, 0.15);
      setTotalBidsCount((prev) => prev + 1);

      // Flash ring on updated lot
      setFlashingLotId(data.lotId);
      setTimeout(() => setFlashingLotId((cur) => (cur === data.lotId ? null : cur)), 1200);

      setLots((prevLots) => {
        let lotProductName = 'Procurement Lot';
        let lotUom = 'Nos';
        let delta = 0;

        const updated = prevLots.map((lot) => {
          if (lot.id === data.lotId) {
            lotProductName = lot.product_name;
            lotUom = lot.uom;
            const previousPrice = lot.current_lowest_bid || lot.start_price;
            delta = previousPrice - data.amount;

            return {
              ...lot,
              current_lowest_bid: data.amount,
              current_l1_vendor_name: data.vendorCompanyName || 'Confidential Bidder',
            };
          }
          return lot;
        });

        // Prepend to audit feed
        setAuditFeed((prevFeed) => [
          {
            id: `bid_${Date.now()}_${Math.random()}`,
            vendor_name: data.vendorCompanyName || 'Supplier',
            product_name: lotProductName,
            amount: data.amount,
            deltaDrop: delta > 0 ? delta : undefined,
            uom: lotUom,
            timestamp: data.timestamp || new Date().toISOString(),
          },
          ...prevFeed,
        ]);

        return updated;
      });
    });

    socket.on('auction_extended', () => {
      playExtensionAlert();
      setCurrentStatus('extended');
      setExtensionNotice('⚡ Dynamic Anti-Sniping triggered: Tender clock extended by 3 minutes!');
      setTimeout(() => setExtensionNotice(null), 8000);
    });

    socket.on('auction_ended', () => {
      setCurrentStatus('ended');
      setClockDisplay('Concluded');
    });

    socket.on('error_message', (err: { message: string }) => {
      console.warn('Observer socket error:', err);
    });

    return () => {
      socket.disconnect();
    };
  }, [auctionId, token, playBidChime, playExtensionAlert]);

  // 3. Procurement Financial KPI Calculations
  const kpis = useMemo(() => {
    let totalReserveBudget = 0;
    let totalCommittedSpend = 0;
    let totalSavings = 0;
    let awardedBaseline = 0;
    let unallocatedReserve = 0;

    lots.forEach((lot) => {
      const baseline = (lot.reserve_price || 0) * (lot.quantity || 0);
      totalReserveBudget += baseline;

      if (lot.current_lowest_bid && lot.current_lowest_bid > 0) {
        const spend = lot.current_lowest_bid * (lot.quantity || 0);
        totalCommittedSpend += spend;
        awardedBaseline += baseline;
        if (lot.current_lowest_bid < lot.reserve_price) {
          totalSavings += baseline - spend;
        }
      } else {
        unallocatedReserve += baseline;
      }
    });

    const savingsBase = awardedBaseline > 0 ? awardedBaseline : totalReserveBudget;
    const savingsPct = savingsBase > 0 ? ((totalSavings / savingsBase) * 100).toFixed(1) : '0.0';

    return {
      totalReserveBudget,
      totalCommittedSpend,
      unallocatedReserve,
      totalSavings,
      savingsPct,
    };
  }, [lots]);

  // Filter lots by search query
  const displayedLots = useMemo(() => {
    if (!lotSearch.trim()) return lots;
    const q = lotSearch.toLowerCase().trim();
    return lots.filter((lot) => {
      return (
        lot.product_name.toLowerCase().includes(q) ||
        (lot.category && lot.category.toLowerCase().includes(q)) ||
        (lot.current_l1_vendor_name && lot.current_l1_vendor_name.toLowerCase().includes(q)) ||
        lot.id.toLowerCase().includes(q)
      );
    });
  }, [lots, lotSearch]);

  // Filter audit trail items by search query
  const displayedAuditFeed = useMemo(() => {
    if (!auditSearch.trim()) return auditFeed;
    const q = auditSearch.toLowerCase().trim();
    return auditFeed.filter((item) => {
      return (
        item.vendor_name.toLowerCase().includes(q) ||
        item.product_name.toLowerCase().includes(q) ||
        String(item.amount).includes(q)
      );
    });
  }, [auditFeed, auditSearch]);

  const isEnded = currentStatus === 'ended';
  const isLive = currentStatus === 'live' || currentStatus === 'extended';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white space-y-3">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold tracking-wide text-slate-300">Connecting to Live Spectator Stream...</p>
        <span className="text-xs text-slate-500 font-mono">{auctionId}</span>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white">
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center space-y-4 shadow-xl">
          <div className="text-4xl text-amber-400">⚠️</div>
          <h2 className="text-lg font-bold text-white">Observer Connection Failed</h2>
          <p className="text-xs text-slate-400">{errorMessage}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow transition-colors cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800 antialiased">
      {/* 1. TOP EXECUTIVE HEADER */}
      <header className="bg-[#1e2238] text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white font-black px-2.5 py-1 rounded text-xs tracking-wider shadow-xs">
              NTA
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Executive Spectator Console
                </h1>
                <span className="bg-blue-900/90 text-blue-200 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-700 font-mono">
                  READ-ONLY
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Corporate Client: <strong className="text-white">{auction?.customer_name || 'Direct Enterprise'}</strong>
                {auction?.title && <span className="text-slate-400 ml-1.5">• {auction.title}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Event Status Badge */}
            <span
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border uppercase font-mono tracking-wider ${
                currentStatus === 'live'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-600 animate-pulse'
                  : currentStatus === 'extended'
                  ? 'bg-amber-950 text-amber-300 border-amber-600 animate-pulse'
                  : currentStatus === 'ended'
                  ? 'bg-slate-800 text-slate-300 border-slate-700'
                  : 'bg-blue-950 text-blue-300 border-blue-700'
              }`}
            >
              {isEnded ? '● CONCLUDED' : isLive ? '● LIVE BIDDING' : currentStatus}
            </span>

            {/* Synchronized NTP Countdown Clock */}
            <div
              className={`font-mono font-bold px-4 py-1.5 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-xs ${
                isEnded
                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                  : 'bg-red-600 text-white'
              }`}
            >
              <span>⏱️</span>
              <span>{clockDisplay}</span>
            </div>

            {/* Audio Alert Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              title={isMuted ? 'Unmute Audio Alert Chimes' : 'Mute Audio Alert Chimes'}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-xl text-sm transition-colors border border-slate-700 cursor-pointer shadow-xs"
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
          </div>
        </div>
      </header>

      {/* Dynamic Anti-Sniping Notification Banner */}
      {extensionNotice && (
        <div className="bg-amber-500 text-amber-950 font-bold px-4 py-2.5 text-center text-xs shadow-inner animate-in fade-in duration-200 flex items-center justify-center gap-2">
          <span>⚡</span>
          <span>{extensionNotice}</span>
        </div>
      )}

      {/* 2. MAIN EXECUTIVE DASHBOARD */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6 flex-1 w-full">
        {/* EXECUTIVE KPI SUMMARY CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Procurement Savings */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
              Total Procurement Savings
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600 font-mono">
                ₹{kpis.totalSavings.toLocaleString('en-IN')}
              </span>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                {kpis.savingsPct}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Calculated vs. baseline reserve ceiling</p>
          </div>

          {/* Card 2: Current Committed Spend */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
              Current Committed Spend
            </span>
            <span className="text-2xl font-black text-slate-900 font-mono block">
              ₹{kpis.totalCommittedSpend.toLocaleString('en-IN')}
            </span>
            <p className="text-[11px] text-slate-400">
              {isEnded && kpis.unallocatedReserve > 0 ? (
                <span className="text-amber-700 font-semibold">
                  L1 awarded liability (₹{kpis.unallocatedReserve.toLocaleString('en-IN')} unallocated)
                </span>
              ) : (
                'Total payable across leading bids'
              )}
            </p>
          </div>

          {/* Card 3: Baseline Reserve Budget */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
              Baseline Reserve Budget
            </span>
            <span className="text-2xl font-black text-slate-700 font-mono block">
              ₹{kpis.totalReserveBudget.toLocaleString('en-IN')}
            </span>
            <p className="text-[11px] text-slate-400">Total authorized reserve budget</p>
          </div>

          {/* Card 4: Total Bids Submitted */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
              Competitive Bids Logged
            </span>
            <span className="text-2xl font-black text-blue-600 font-mono block">
              {totalBidsCount}
            </span>
            <p className="text-[11px] text-slate-400">Live competitive price decrements</p>
          </div>
        </div>

        {/* SETTLEMENT NOTICE (SHOWN WHEN AUCTION IS CONCLUDED) */}
        {isEnded && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <strong className="text-sm font-bold text-emerald-950">
                  Procurement Auction Concluded & Settled
                </strong>
              </div>
              <p className="text-xs text-emerald-800">
                Final competitive settlements have closed and L1 prices are locked. The verified 6-page official settlement audit report is ready for export.
              </p>
            </div>
            <a
              href={`/api/admin/auctions/${auctionId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 whitespace-nowrap btn-white flex-shrink-0"
              style={{ color: '#ffffff' }}
            >
              <span>📄</span>
              <span className="btn-white" style={{ color: '#ffffff' }}>Download Settlement Audit PDF</span>
            </a>
          </div>
        )}

        {/* 3. TWO-COLUMN LAYOUT: LOTS PERFORMANCE TABLE & LIVE AUDIT TRAIL */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* LEFT 2 COLUMNS: PROCUREMENT LOTS */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-sm text-slate-900">Procurement Items & Lead Bid Status</h2>
                <p className="text-xs text-slate-400">Real-time lowest prices and winning suppliers for each lot.</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <SearchBar
                  value={lotSearch}
                  onChange={setLotSearch}
                  placeholder="Filter lots by name, category, supplier..."
                  className="w-full sm:w-64"
                />
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 font-mono whitespace-nowrap">
                  {displayedLots.length} of {lots.length} Lot(s)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider font-mono">
                  <tr>
                    <th className="p-3.5">Product Lot</th>
                    <th className="p-3.5">Qty & UOM</th>
                    <th className="p-3.5">Reserve Ceiling</th>
                    <th className="p-3.5 text-center">Current Lowest (L1)</th>
                    <th className="p-3.5">Winning Supplier</th>
                    <th className="p-3.5 text-right">Lot Savings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lots.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                        No procurement tender items loaded for this event.
                      </td>
                    </tr>
                  ) : displayedLots.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400 font-medium">
                        No lots match "<strong>{lotSearch}</strong>"
                      </td>
                    </tr>
                  ) : (
                    displayedLots.map((lot) => {
                      const hasBid = Boolean(lot.current_lowest_bid && lot.current_lowest_bid > 0);
                      const lotSavings =
                        hasBid && lot.current_lowest_bid! < lot.reserve_price
                          ? (lot.reserve_price - lot.current_lowest_bid!) * lot.quantity
                          : 0;

                      const isFlashing = flashingLotId === lot.id;

                      return (
                        <tr key={lot.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5">
                            <strong className="text-slate-900 font-semibold block text-xs">
                              {lot.product_name}
                            </strong>
                            <span className="text-[10px] text-slate-400 font-mono">{lot.id}</span>
                          </td>

                          <td className="p-3.5 font-semibold text-slate-700 whitespace-nowrap">
                            {lot.quantity} {lot.uom}
                          </td>

                          <td className="p-3.5 font-mono text-slate-600 whitespace-nowrap">
                            ₹{lot.reserve_price.toLocaleString('en-IN')}
                          </td>

                          <td className="p-3.5 text-center whitespace-nowrap">
                            {hasBid ? (
                              <span
                                className={`bg-[#1e2238] text-white font-mono font-bold px-3.5 py-1.5 rounded-full text-xs inline-block transition-all duration-300 shadow-2xs ${
                                  isFlashing ? 'flash-bid ring-4 ring-emerald-400' : ''
                                }`}
                              >
                                ₹{lot.current_lowest_bid!.toLocaleString('en-IN')}
                              </span>
                            ) : isEnded ? (
                              <span className="text-slate-500 font-bold text-[11px] bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                                Unbid / No Award
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-xs">Awaiting Bid</span>
                            )}
                          </td>

                          <td className="p-3.5 whitespace-nowrap">
                            {hasBid ? (
                              <span className="font-bold text-slate-800">
                                {lot.current_l1_vendor_name || 'L1 Winning Bidder'}
                              </span>
                            ) : isEnded ? (
                              <span className="text-slate-400 italic">Unallocated</span>
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                          </td>

                          <td
                            className={`p-3.5 text-right font-mono font-bold whitespace-nowrap ${
                              lotSavings > 0 ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                          >
                            {hasBid ? (
                              lotSavings > 0 ? (
                                `+ ₹${lotSavings.toLocaleString('en-IN')}`
                              ) : (
                                '₹0'
                              )
                            ) : isEnded ? (
                              <span className="text-slate-400 font-normal">₹0 (Unawarded)</span>
                            ) : (
                              '₹0'
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT 1 COLUMN: LIVE BIDDING AUDIT TRAIL STREAM */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col h-[600px] overflow-hidden">
            <div className="p-4 border-b border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-2 font-mono">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live Bidding Audit Trail
                  </h2>
                  <p className="text-[11px] text-slate-400">Stream of all price drops in chronological order</p>
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                  {displayedAuditFeed.length}
                </span>
              </div>

              <SearchBar
                value={auditSearch}
                onChange={setAuditSearch}
                placeholder="Filter stream by supplier or product..."
                className="w-full"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 text-xs">
              {auditFeed.length === 0 ? (
                <div className="text-center py-16 text-slate-400 space-y-2">
                  <span className="text-2xl block">📡</span>
                  <p className="font-semibold text-slate-600 text-xs">Waiting for live bids...</p>
                  <p className="text-[11px] text-slate-400">Competitive price reductions will stream here in real time.</p>
                </div>
              ) : displayedAuditFeed.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <p className="text-xs">No price drops match "<strong>{auditSearch}</strong>"</p>
                </div>
              ) : (
                displayedAuditFeed.map((item, idx) => {
                  const timeFormatted = new Date(item.timestamp).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <div
                      key={item.id || idx}
                      className="p-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl space-y-1.5 transition-all shadow-2xs animate-in fade-in duration-150"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-800 font-bold text-xs">{item.vendor_name}</strong>
                        <span className="text-[10px] font-mono text-slate-400">{timeFormatted}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 text-[11px] truncate max-w-[140px]">
                          {item.product_name}
                        </span>
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          ₹{item.amount.toLocaleString('en-IN')} / {item.uom}
                        </span>
                      </div>
                      {item.deltaDrop && item.deltaDrop > 0 && (
                        <div className="text-[10px] text-emerald-700 font-bold font-mono text-right bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-100">
                          ↓ Decrement drop: ₹{item.deltaDrop.toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

