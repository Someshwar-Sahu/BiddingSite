import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useVendorAudio } from './useVendorAudio';
import { SearchBar } from '../components/SearchBar';

interface LotItem {
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
  current_lowest_bid?: number | null;
  current_l1_vendor_id?: string | null;
  current_l1_vendor_name?: string | null;
  status: string;
  myLastBid?: number | null;
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
  payment_terms?: string;
  delivery_timeline?: string;
  compliance_requirements?: string;
  special_instructions?: string;
}

interface ToastNotice {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
}

interface CrossAuctionAlertNotice {
  auctionId: string;
  auctionTitle: string;
  message: string;
}

export const VendorBiddingApp: React.FC = () => {
  const { isMuted, toggleMute, playBidSuccess, playOutbidWarning, playExtensionAlert } = useVendorAudio();

  // Extract auctionId from URL path (/live-auction/:id or /auction/:id)
  const auctionId = useMemo(() => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'NTA-EPACKPetro-07';
  }, []);

  // Extract token from query params (?key=token_...)
  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('key') || '';
  }, []);

  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [lots, setLots] = useState<LotItem[]>([]);
  const [myCompanyName, setMyCompanyName] = useState<string>('');
  const [myVendorId, setMyVendorId] = useState<string>('');
  const [currentStatus, setCurrentStatus] = useState<'scheduled' | 'live' | 'extended' | 'ended'>('scheduled');
  const [clockDisplay, setClockDisplay] = useState<string>('Connecting...');
  const [flashingLotId, setFlashingLotId] = useState<string | null>(null);
  const [extensionNotice, setExtensionNotice] = useState<string | null>(null);
  const [lotSearch, setLotSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Concurrency & Seat Locking States
  const [isPrimaryBidder, setIsPrimaryBidder] = useState<boolean>(true);
  const [isSeatAvailable, setIsSeatAvailable] = useState<boolean>(false);
  const [crossAuctionAlert, setCrossAuctionAlert] = useState<CrossAuctionAlertNotice | null>(null);

  // Stepper input amounts per lot
  const [bidInputs, setBidInputs] = useState<{ [lotId: string]: number }>({});
  // Self-outbid confirmation warning per lot
  const [selfOutbidConfirmLotId, setSelfOutbidConfirmLotId] = useState<string | null>(null);
  // Toasts
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const socketRef = useRef<Socket | null>(null);

  const addToast = useCallback((message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Helper to compute next maximum allowed bid
  const getNextMaxBid = useCallback((lot: LotItem): number => {
    if (lot.current_lowest_bid && lot.current_lowest_bid > 0) {
      return lot.current_lowest_bid - (lot.bid_decrement || 10);
    }
    return lot.start_price;
  }, []);

  // 1. Initial REST Hydration
  useEffect(() => {
    let isMounted = true;
    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/auctions/${auctionId}/room-state`);
        if (!res.ok) {
          throw new Error('Tender room not found or unavailable.');
        }
        const data = await res.json();
        if (!isMounted) return;

        setAuction(data.auction);
        setCurrentStatus(data.auction.status);

        const initialLots: LotItem[] = (data.lots || []).map((l: any) => ({
          ...l,
          myLastBid: null,
        }));
        setLots(initialLots);

        // Pre-populate stepper inputs to next valid max bid
        const initialInputs: { [lotId: string]: number } = {};
        initialLots.forEach((l) => {
          initialInputs[l.id] = getNextMaxBid(l);
        });
        setBidInputs(initialInputs);
      } catch (err: any) {
        if (isMounted) setAuthError(err.message || 'Error connecting to room');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchInitialData();
    return () => {
      isMounted = false;
    };
  }, [auctionId, getNextMaxBid]);

  // 2. Establish Real-Time WebSocket Connection
  useEffect(() => {
    if (!token) {
      setAuthError('An authorized Magic Link key is required to participate in this auction.');
      setIsLoading(false);
      return;
    }

    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room', { auctionId, token });
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err);
    });

    socket.on('room_joined', (data: any) => {
      // Auto-redirect corporate observers to dedicated executive spectator room
      if (data.role === 'customer_observer') {
        window.location.replace(`/observer/${auctionId}?key=${encodeURIComponent(token)}`);
        return;
      }

      setMyCompanyName(data.companyName || 'Approved Supplier');
      setMyVendorId(data.vendorId || '');
      if (data.status) setCurrentStatus(data.status);

      // Concurrency seat evaluation
      if (typeof data.isPrimaryBidder === 'boolean') {
        setIsPrimaryBidder(data.isPrimaryBidder);
      }
      if (data.activeBidderSeatHeld === true && !data.isPrimaryBidder) {
        setIsSeatAvailable(false);
      }

      if (Array.isArray(data.lots) && data.lots.length > 0) {
        setLots((prevLots) => {
          return data.lots.map((serverLot: any) => {
            const existing = prevLots.find((p) => p.id === serverLot.id);
            return {
              ...serverLot,
              myLastBid: existing?.myLastBid || null,
            };
          });
        });

        // Initialize inputs for lots without input
        setBidInputs((prev) => {
          const next = { ...prev };
          data.lots.forEach((l: any) => {
            if (next[l.id] === undefined) {
              next[l.id] = getNextMaxBid(l);
            }
          });
          return next;
        });
      }
    });

    socket.on('clock_tick', (data: { formattedTime: string; remainingSeconds: number; status: string }) => {
      setClockDisplay(data.formattedTime);
      if (data.status && data.status !== currentStatus) {
        setCurrentStatus(data.status as any);
      }
    });

    socket.on('bid_placed', (data: {
      lotId: string;
      amount: number;
      newMaxAllowedBid: number;
      vendorCompanyName: string;
      timestamp: string;
    }) => {
      playBidSuccess();

      // Trigger flash animation
      setFlashingLotId(data.lotId);
      setTimeout(() => setFlashingLotId((cur) => (cur === data.lotId ? null : cur)), 1400);

      const isMyBid = data.vendorCompanyName === myCompanyName;

      if (isMyBid) {
        addToast(`✓ Bid placed! You are now the L1 leader at ₹${data.amount.toLocaleString('en-IN')}`, 'success');
        setSelfOutbidConfirmLotId(null);
      }

      setLots((prevLots) =>
        prevLots.map((lot) => {
          if (lot.id === data.lotId) {
            return {
              ...lot,
              current_lowest_bid: data.amount,
              current_l1_vendor_name: data.vendorCompanyName,
              myLastBid: isMyBid ? data.amount : lot.myLastBid,
            };
          }
          return lot;
        })
      );

      // Clamping stepper input to new maximum allowed bid
      setBidInputs((prev) => {
        const currentInput = prev[data.lotId] || 0;
        const clamped = currentInput > data.newMaxAllowedBid ? data.newMaxAllowedBid : currentInput;
        return {
          ...prev,
          [data.lotId]: clamped > 0 ? clamped : data.newMaxAllowedBid,
        };
      });
    });

    socket.on('outbid_alert', (data: { lotId: string; outbidVendorId: string; newLowestBid: number }) => {
      if (myVendorId && data.outbidVendorId && data.outbidVendorId !== myVendorId) {
        return;
      }

      playOutbidWarning();
      addToast(
        `⚠️ Warning: You have been OUTBID on Lot #${data.lotId}! New leading price is ₹${data.newLowestBid.toLocaleString('en-IN')}`,
        'warning'
      );
    });

    socket.on('auction_extended', () => {
      playExtensionAlert();
      setCurrentStatus('extended');
      setExtensionNotice('⚡ Dynamic Anti-Sniping triggered: Tender clock prolonged by 3 minutes!');
      setTimeout(() => setExtensionNotice(null), 8000);
      addToast('⚡ Anti-sniping soft-close triggered: Clock extended by 3 minutes.', 'info');
    });

    socket.on('auction_ended', () => {
      setCurrentStatus('ended');
      setClockDisplay('Concluded');
      addToast('The bidding window has concluded. Final L1 prices are locked.', 'info');
    });

    // Seat Concurrency Listeners
    socket.on('bidding_seat_available', () => {
      setIsSeatAvailable(true);
      addToast('💡 The active bidding seat for your company is now available.', 'info');
    });

    socket.on('bidding_seat_occupied', () => {
      setIsSeatAvailable(false);
    });

    socket.on('seat_claimed_success', () => {
      setIsPrimaryBidder(true);
      setIsSeatAvailable(false);
      addToast('👑 You have claimed the primary bidding seat for this tender.', 'success');
    });

    socket.on('seat_relinquished', () => {
      setIsPrimaryBidder(false);
      setIsSeatAvailable(false);
      addToast('You have relinquished bidding controls to your team.', 'info');
    });

    // Smart Presence-Aware Cross-Auction Alerts (Unattended Tenders)
    socket.on('cross_auction_unattended_alert', (data: any) => {
      playOutbidWarning();
      setCrossAuctionAlert({
        auctionId: data.auctionId,
        auctionTitle: data.auctionTitle || data.auctionId,
        message: data.message,
      });
    });

    socket.on('error_message', (err: { code: string; message: string }) => {
      addToast(err.message || 'Operation failed', 'error');
    });

    return () => {
      socket.disconnect();
    };
  }, [auctionId, token, myCompanyName, myVendorId, currentStatus, getNextMaxBid, playBidSuccess, playOutbidWarning, playExtensionAlert, addToast]);

  // Stepper input actions
  const handleInputChange = (lotId: string, val: number, maxBid: number) => {
    setBidInputs((prev) => ({
      ...prev,
      [lotId]: val > maxBid ? maxBid : val,
    }));
  };

  const handleStepDecrement = (lot: LotItem) => {
    const maxBid = getNextMaxBid(lot);
    const currentVal = bidInputs[lot.id] || maxBid;
    const nextVal = currentVal - lot.bid_decrement;
    if (nextVal > 0) {
      setBidInputs((prev) => ({ ...prev, [lot.id]: nextVal }));
    }
  };

  const handleStepIncrement = (lot: LotItem) => {
    const maxBid = getNextMaxBid(lot);
    const currentVal = bidInputs[lot.id] || maxBid;
    const nextVal = currentVal + lot.bid_decrement;
    if (nextVal <= maxBid) {
      setBidInputs((prev) => ({ ...prev, [lot.id]: nextVal }));
    } else {
      addToast(`Cannot increment above the maximum allowed ceiling of ₹${maxBid.toLocaleString('en-IN')}`, 'warning');
    }
  };

  const handleRelinquishSeat = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('relinquish_bidding_seat');
  };

  const handleClaimSeat = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('claim_bidding_seat');
  };

  const handleQuickBid = (lot: LotItem) => {
    if (!isPrimaryBidder) {
      addToast('Your terminal is in Read-Only Mirror mode. A teammate holds the active bidding seat.', 'warning');
      return;
    }

    const targetAmount = getNextMaxBid(lot);
    if (!targetAmount || targetAmount <= 0) return;

    // Check if self-outbid
    if (lot.current_l1_vendor_name === myCompanyName && selfOutbidConfirmLotId !== lot.id) {
      setSelfOutbidConfirmLotId(lot.id);
      addToast(`You are already the leading L1 bidder at ₹${lot.current_lowest_bid?.toLocaleString('en-IN')}. Click "Confirm Bid" to lower your price.`, 'warning');
      return;
    }

    if (!socketRef.current) return;
    socketRef.current.emit('submit_bid', { lotId: lot.id, amount: targetAmount });
  };

  const handleSubmitCustomBid = (lot: LotItem) => {
    if (!isPrimaryBidder) {
      addToast('Your terminal is in Read-Only Mirror mode. A teammate holds the active bidding seat.', 'warning');
      return;
    }

    const maxBid = getNextMaxBid(lot);
    const amount = bidInputs[lot.id] || maxBid;

    if (!amount || amount <= 0) {
      addToast('Please enter a valid bid amount greater than zero.', 'error');
      return;
    }

    if (amount > maxBid) {
      addToast(`Bid exceeds maximum allowed bid of ₹${maxBid.toLocaleString('en-IN')}.`, 'error');
      return;
    }

    // Check self-outbid
    if (lot.current_l1_vendor_name === myCompanyName && selfOutbidConfirmLotId !== lot.id) {
      setSelfOutbidConfirmLotId(lot.id);
      addToast(`You are already L1. Click "Confirm Bid" if you wish to voluntarily reduce your price.`, 'warning');
      return;
    }

    if (!socketRef.current) return;
    socketRef.current.emit('submit_bid', { lotId: lot.id, amount });
  };

  // Filter lots by search query
  const displayedLots = useMemo(() => {
    if (!lotSearch.trim()) return lots;
    const q = lotSearch.toLowerCase().trim();
    return lots.filter((l) => {
      return (
        l.product_name.toLowerCase().includes(q) ||
        (l.category && l.category.toLowerCase().includes(q)) ||
        l.id.toLowerCase().includes(q)
      );
    });
  }, [lots, lotSearch]);

  const isLive = currentStatus === 'live' || currentStatus === 'extended';
  const isScheduled = currentStatus === 'scheduled';
  const isEnded = currentStatus === 'ended';

  if (authError) {
    return (
      <div className="min-h-screen bg-[#0c0e1a] text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#121526] p-8 rounded-2xl border border-slate-800 text-center space-y-4 shadow-2xl">
          <div className="text-red-400 text-4xl">🔒</div>
          <h1 className="text-xl font-bold text-white">Access Denied</h1>
          <p className="text-xs text-slate-400 leading-relaxed">{authError}</p>
          <div className="pt-2">
            <a
              href="/vendor/login"
              className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-md shadow-blue-600/30"
            >
              Supplier Portal Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0e1a] text-slate-100 flex flex-col font-sans">
      {/* 1. TOP HEADER & TELEMETRY BAR */}
      <header className="bg-[#121526] border-b border-slate-800 sticky top-0 z-40 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20 text-base">
              🏭
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-white">NexTrade</span>
                <span className="text-[10px] bg-blue-900/60 text-blue-300 font-bold px-2 py-0.5 rounded border border-blue-700/60 font-mono">
                  SUPPLIER TERMINAL
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Tender Event: <strong className="text-white">{auction?.title || auctionId}</strong>
                <span className="text-slate-400 ml-1.5 font-mono">({auctionId})</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap justify-center sm:justify-end">
            {/* Status Badge */}
            <span
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border uppercase font-mono tracking-wider ${
                currentStatus === 'live'
                  ? 'bg-red-600 text-white border-red-500 animate-pulse'
                  : currentStatus === 'extended'
                  ? 'bg-amber-500 text-amber-950 border-amber-400 animate-pulse'
                  : currentStatus === 'ended'
                  ? 'bg-slate-800 text-slate-300 border-slate-700'
                  : 'bg-blue-950 text-blue-300 border-blue-700'
              }`}
            >
              {isEnded ? '● CONCLUDED' : isLive ? '● LIVE BIDDING' : '⏳ UPCOMING'}
            </span>

            {/* Countdown Clock */}
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

            {/* Link to Supplier Hub */}
            <a
              href="/vendor/dashboard"
              className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
              title="Return to Supplier Procurement Hub"
            >
              <span>🏢</span>
              <span className="hidden sm:inline">Supplier Hub</span>
            </a>

            {/* Audio Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              title={isMuted ? 'Unmute Audio Chimes' : 'Mute Audio Chimes'}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-xl text-sm transition-colors border border-slate-700 cursor-pointer shadow-xs"
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
          </div>
        </div>

        {/* SUBHEADER: VENDOR PROFILE INFO & CONCURRENCY SEAT CONTROLS */}
        <div className="bg-[#171a2b] border-t border-slate-800/80 px-4 sm:px-6 lg:px-8 py-2 text-xs text-slate-300 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400">Company:</span>
            <strong className="text-white font-bold">{myCompanyName || 'Approved Supplier'}</strong>

            {/* Concurrency Seat Status Indicator */}
            {isPrimaryBidder ? (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/40 flex items-center gap-1">
                <span>👑</span> Active Bidder Seat
              </span>
            ) : (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-500/40 flex items-center gap-1">
                <span>👀</span> Read-Only Mirror
              </span>
            )}

            {/* Concurrency Action: Relinquish / Claim Seat */}
            {isPrimaryBidder ? (
              <button
                type="button"
                onClick={handleRelinquishSeat}
                title="Allow a waiting colleague to take over active bidding"
                className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer ml-1"
              >
                Relinquish Seat
              </button>
            ) : isSeatAvailable ? (
              <button
                type="button"
                onClick={handleClaimSeat}
                className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white font-bold px-2 py-0.5 rounded transition-colors cursor-pointer shadow-xs ml-1"
              >
                Claim Bidding Seat
              </button>
            ) : null}
          </div>

          <div className="text-[11px] text-slate-400">
            Buyer: <strong className="text-slate-200">{auction?.customer_name || 'Direct Enterprise Client'}</strong>
            {auction?.delivery_location && <span> • Plant: {auction.delivery_location}</span>}
          </div>
        </div>
      </header>

      {/* URGENT UNATTENDED TENDER BANNER (CROSS-AUCTION PRESENCE ROUTING) */}
      {crossAuctionAlert && (
        <aside aria-label="Urgent Tender Notification" className="bg-red-600 text-white px-4 py-2.5 shadow-lg flex items-center justify-between text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="animate-bounce">🚨</span>
            <span><strong>UNATTENDED TENDER ALERT:</strong> {crossAuctionAlert.message}</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/live-auction/${crossAuctionAlert.auctionId}`}
              className="bg-white text-red-700 font-bold px-2.5 py-1 rounded text-xs hover:bg-slate-100 transition-colors shadow-xs"
            >
              Jump to Auction
            </a>
            <button
              type="button"
              onClick={() => setCrossAuctionAlert(null)}
              className="text-white hover:text-red-200 font-bold px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </aside>
      )}

      {/* READ-ONLY MIRROR WARNING BANNER (WHEN COLLEAGUE HOLDS SEAT) */}
      {!isPrimaryBidder && (
        <aside aria-label="Mirror Mode Notification" className="bg-amber-950/80 border-b border-amber-700/60 text-amber-200 px-4 py-2.5 text-center text-xs flex items-center justify-center gap-2">
          <span>👀</span>
          <span>
            <strong>Read-Only Mirror Mode:</strong> A colleague holds the active bidding seat for your company. Controls are locked to prevent conflicting submissions.
          </span>
          {isSeatAvailable && (
            <button
              type="button"
              onClick={handleClaimSeat}
              className="ml-2 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold px-2.5 py-0.5 rounded text-[11px] transition-colors cursor-pointer shadow-xs"
            >
              Claim Seat Now
            </button>
          )}
        </aside>
      )}

      {/* Dynamic Anti-Sniping Alert Banner */}
      {extensionNotice && (
        <aside aria-label="Anti-Sniping Notification" className="bg-amber-500 text-amber-950 font-bold px-4 py-2.5 text-center text-xs shadow-inner animate-in fade-in duration-200 flex items-center justify-center gap-2">
          <span>⚡</span>
          <span>{extensionNotice}</span>
        </aside>
      )}

      {/* 2. BODY CONTENT: WAITING ROOM VS LIVE BIDDING VS CONCLUDED */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6 flex-1 w-full">
        {/* A. PRE-AUCTION WAITING ROOM SCREEN */}
        {isScheduled && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs text-center space-y-4">
              <span className="text-4xl block">⏳</span>
              <h2 className="text-lg font-bold text-slate-900">Pre-Auction Waiting Room</h2>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                This reverse e-auction has not started yet. Please review the procurement lots and specifications below. Bidding controls will automatically activate once the clock reaches zero.
              </p>
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-6 py-2.5 rounded-2xl text-blue-900 font-mono font-bold text-sm shadow-2xs">
                <span>Opens in:</span>
                <span className="text-blue-700 font-black">{clockDisplay}</span>
              </div>
            </div>
          </div>
        )}

        {/* B. POST-AUCTION SETTLEMENT SUMMARY SCREEN */}
        {isEnded && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs text-center space-y-3">
              <span className="text-4xl block">🏁</span>
              <h2 className="text-lg font-bold text-slate-900">Reverse Auction Concluded</h2>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                Official bidding window has closed. All final L1 prices are locked for procurement verification and formal PO dispatch.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                <a
                  href={`/api/vendor/reports/${auctionId}?key=${encodeURIComponent(token)}`}
                  download
                  className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md shadow-blue-600/20 transition-colors"
                >
                  <span>📄</span>
                  <span>Download Supplier Certificate (PDF)</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* C. LOTS LISTING & INTERACTIVE STEPPERS */}
        {isLoading ? (
          <div className="text-center py-12 space-y-2">
            <span className="inline-block animate-spin text-2xl">🔄</span>
            <p className="text-xs text-slate-400">Loading tender lots...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>📦</span>
                  <span>Procurement Lots ({displayedLots.length})</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Strictly decreasing bids. Submissions are legally binding under tender contract terms.
                </p>
              </div>

              {/* Lot Search Bar */}
              <div className="w-full sm:w-72">
                <SearchBar
                  value={lotSearch}
                  onChange={setLotSearch}
                  placeholder="Filter lots by name or category..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {displayedLots.length === 0 ? (
                <div className="bg-[#171a2b] border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500">
                  No procurement lots match your search query.
                </div>
              ) : (
                displayedLots.map((lot) => {
                  const maxBid = getNextMaxBid(lot);
                  const currentInput = bidInputs[lot.id] ?? maxBid;
                  const isMyL1 = lot.current_l1_vendor_name === myCompanyName;
                  const wasOutbid = lot.myLastBid && !isMyL1;
                  const isFlashing = flashingLotId === lot.id;

                  return (
                    <div
                      key={lot.id}
                      className={`bg-white rounded-2xl border transition-all p-5 shadow-xs text-slate-800 space-y-4 ${
                        isMyL1
                          ? 'border-emerald-500/80 ring-2 ring-emerald-500/20'
                          : wasOutbid
                          ? 'border-amber-400 ring-2 ring-amber-400/20'
                          : 'border-slate-200'
                      }`}
                    >
                      {/* Lot Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="bg-slate-900 text-white font-mono text-xs font-black px-2.5 py-1 rounded-xl">
                            Lot #{lot.lot_number}
                          </span>
                          <div>
                            <h4 className="font-bold text-sm text-slate-900">{lot.product_name}</h4>
                            <span className="text-[11px] text-slate-500">
                              Volume: <strong className="text-slate-800">{lot.quantity.toLocaleString('en-IN')} {lot.uom}</strong>
                              {lot.category && <span> • Category: {lot.category}</span>}
                            </span>
                          </div>
                        </div>

                        {/* Leading L1 Status Badge */}
                        <div className="flex items-center gap-2">
                          {isMyL1 ? (
                            <span className="inline-flex items-center gap-1.5 bg-emerald-600 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-2xs font-mono">
                              <span>👑</span> YOU ARE L1 LEADER ({`₹${lot.current_lowest_bid?.toLocaleString('en-IN')}`})
                            </span>
                          ) : wasOutbid ? (
                            <span className="inline-flex items-center gap-1.5 bg-amber-500 text-amber-950 font-black text-xs px-3.5 py-1.5 rounded-xl shadow-2xs font-mono">
                              <span>⚠️</span> OUTBID! (L1 is ₹{lot.current_lowest_bid?.toLocaleString('en-IN')})
                            </span>
                          ) : lot.current_lowest_bid ? (
                            <span className="inline-flex items-center gap-1.5 bg-slate-800 text-slate-200 font-bold text-xs px-3.5 py-1.5 rounded-xl font-mono">
                              <span>●</span> Active Lead: ₹{lot.current_lowest_bid.toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs px-3.5 py-1.5 rounded-xl font-mono">
                              <span>●</span> Awaiting Initial Bid
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Economics & Stepper Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
                        {/* Column 1: Reserve & Decrement */}
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">
                            Ceiling & Decrement
                          </span>
                          <strong className="text-slate-800 text-xs block">
                            Reserve: ₹{lot.reserve_price.toLocaleString('en-IN')} / {lot.uom}
                          </strong>
                          <span className="text-[11px] text-slate-500 font-mono">
                            Min Step: ₹{lot.bid_decrement}
                          </span>
                        </div>

                        {/* Column 2: Current Lowest L1 Price */}
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">
                            Current Lowest (L1)
                          </span>
                          <span
                            className={`font-mono font-bold text-sm px-3 py-1 rounded-xl inline-block transition-all ${
                              lot.current_lowest_bid
                                ? `bg-[#1e2238] text-white shadow-2xs ${isFlashing ? 'flash-bid ring-4 ring-emerald-400' : ''}`
                                : 'text-slate-400 bg-slate-200/60'
                            }`}
                          >
                            {lot.current_lowest_bid ? `₹${lot.current_lowest_bid.toLocaleString('en-IN')}` : 'No Bids Yet'}
                          </span>
                          {lot.current_l1_vendor_name && (
                            <span className="text-[10px] text-slate-500 block mt-1 truncate">
                              Leader: {lot.current_l1_vendor_name}
                            </span>
                          )}
                        </div>

                        {/* Column 3: Interactive Stepper (Active only when Live & Primary Bidder) */}
                        <div className="sm:col-span-2">
                          {isLive ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-blue-700 font-mono">
                                  ↓ Max Allowed: ₹{maxBid.toLocaleString('en-IN')}
                                </span>
                                {lot.myLastBid && (
                                  <span className="text-[10px] font-mono text-slate-400">
                                    Your Last: ₹{lot.myLastBid.toLocaleString('en-IN')}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                {/* Stepper Controls */}
                                <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => handleStepDecrement(lot)}
                                    disabled={!isPrimaryBidder}
                                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 font-bold text-slate-800 text-sm select-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    title={`Decrease bid by ₹${lot.bid_decrement}`}
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    value={currentInput}
                                    max={maxBid}
                                    disabled={!isPrimaryBidder}
                                    onChange={(e) => handleInputChange(lot.id, Number(e.target.value), maxBid)}
                                    className="w-28 text-center py-2 text-xs font-mono font-bold text-slate-900 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleStepIncrement(lot)}
                                    disabled={!isPrimaryBidder || currentInput >= maxBid}
                                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 font-bold text-slate-800 text-sm select-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    title={`Increase bid by ₹${lot.bid_decrement}`}
                                  >
                                    +
                                  </button>
                                </div>

                                {/* 1-Click Quick Bid */}
                                <button
                                  type="button"
                                  onClick={() => handleQuickBid(lot)}
                                  disabled={!isPrimaryBidder}
                                  className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 shadow-2xs transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={!isPrimaryBidder ? 'Teammate holds active bidding seat' : `Immediately place lead bid at ₹${maxBid.toLocaleString('en-IN')}`}
                                >
                                  <span>⚡ Quick Bid:</span>
                                  <span>₹{maxBid.toLocaleString('en-IN')}</span>
                                </button>

                                {/* Submit Custom Bid */}
                                <button
                                  type="button"
                                  onClick={() => handleSubmitCustomBid(lot)}
                                  disabled={!isPrimaryBidder || currentInput <= 0 || currentInput > maxBid}
                                  className="px-4 py-2 bg-[#1e2238] hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
                                >
                                  {selfOutbidConfirmLotId === lot.id ? 'Confirm Lower Bid' : 'Submit Bid'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-2 text-slate-400 font-medium">
                              {isEnded ? (
                                <span className="font-bold text-slate-700 font-mono">
                                  {isMyL1 ? '🏆 Final Winner: Awarded to You' : 'Bidding Closed: Settled'}
                                </span>
                              ) : (
                                'Bidding controls will activate when tender is Live.'
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* 3. FLOATING TOAST NOTICES */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-200 border ${
              toast.type === 'success'
                ? 'bg-emerald-950 text-emerald-200 border-emerald-700'
                : toast.type === 'warning'
                ? 'bg-amber-950 text-amber-200 border-amber-700'
                : toast.type === 'error'
                ? 'bg-red-950 text-red-200 border-red-700'
                : 'bg-slate-900 text-slate-200 border-slate-700'
            }`}
          >
            <span>
              {toast.type === 'success' ? '✓' : toast.type === 'warning' ? '⚠️' : toast.type === 'error' ? '✕' : 'ℹ'}
            </span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
