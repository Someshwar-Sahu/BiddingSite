import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SearchBar } from '../components/SearchBar';
import { useVendorAudio } from './useVendorAudio';

interface TenderItem {
  auctionId: string;
  title: string;
  category: string;
  status: 'scheduled' | 'live' | 'extended' | 'ended' | 'cancelled';
  customerName: string;
  deliveryLocation: string;
  scheduledStart: string;
  currentEnd: string;
  durationMinutes: number;
  token: string;
  totalLots: number;
  myL1Wins: number;
  isManned: boolean;
}

interface VendorProfile {
  id: string;
  companyName: string;
  email: string;
  contactPerson: string;
  phone?: string;
  gstin?: string;
  pan?: string;
}

interface CrossAuctionAlert {
  id: string;
  type: string;
  auctionId: string;
  auctionTitle: string;
  lotId: string;
  productName: string;
  newLowestBid: number;
  message: string;
}

export const VendorDashboardApp: React.FC = () => {
  const { playOutbidWarning } = useVendorAudio();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [liveTenders, setLiveTenders] = useState<TenderItem[]>([]);
  const [upcomingTenders, setUpcomingTenders] = useState<TenderItem[]>([]);
  const [concludedTenders, setConcludedTenders] = useState<TenderItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'live' | 'upcoming' | 'concluded'>('all');
  const [urgentAlert, setUrgentAlert] = useState<CrossAuctionAlert | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // 1. Fetch Vendor Profile & Enrolled Tenders
  const loadDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch Profile
      const meRes = await fetch('/api/vendor/me');
      if (meRes.status === 401) {
        window.location.href = '/vendor/login';
        return;
      }
      const meData = await meRes.json();
      if (meData.authenticated && meData.vendor) {
        setProfile(meData.vendor);
      }

      // Fetch Tenders
      const tendersRes = await fetch('/api/vendor/tenders');
      if (!tendersRes.ok) {
        throw new Error('Failed to load supplier tender portfolio');
      }
      const tendersData = await tendersRes.json();

      setLiveTenders(tendersData.live || []);
      setUpcomingTenders(tendersData.upcoming || []);
      setConcludedTenders(tendersData.concluded || []);
    } catch (err: any) {
      setError(err.message || 'Error loading dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // 2. Establish Real-Time Socket Connection for Company Realm & Unattended Alerts
  useEffect(() => {
    const socket = io({
      auth: { realm: 'vendor' },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('authenticate_notifications', { realm: 'vendor' });
    });

    // Smart Presence Routing: Cross-auction unattended alert
    socket.on('cross_auction_unattended_alert', (data: CrossAuctionAlert) => {
      playOutbidWarning();
      setUrgentAlert({
        ...data,
        id: `alert_${Date.now()}`,
      });
      // Refresh list to update L1 counts and status
      loadDashboardData();
    });

    // General status updates
    socket.on('auction_status_changed', () => {
      loadDashboardData();
    });

    socket.on('auctions_updated', () => {
      loadDashboardData();
    });

    return () => {
      socket.disconnect();
    };
  }, [loadDashboardData, playOutbidWarning]);

  const handleLogout = async () => {
    try {
      await fetch('/api/vendor/logout', { method: 'POST' });
      window.location.href = '/vendor/login';
    } catch {
      window.location.href = '/vendor/login';
    }
  };

  // Filter tenders based on search query
  const matchesSearch = (t: TenderItem) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      t.title.toLowerCase().includes(q) ||
      t.auctionId.toLowerCase().includes(q) ||
      t.customerName.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.deliveryLocation.toLowerCase().includes(q)
    );
  };

  const filteredLive = useMemo(() => liveTenders.filter(matchesSearch), [liveTenders, searchQuery]);
  const filteredUpcoming = useMemo(() => upcomingTenders.filter(matchesSearch), [upcomingTenders, searchQuery]);
  const filteredConcluded = useMemo(() => concludedTenders.filter(matchesSearch), [concludedTenders, searchQuery]);

  const totalLeadingLots = useMemo(() => {
    return liveTenders.reduce((sum, t) => sum + (t.myL1Wins || 0), 0);
  }, [liveTenders]);

  return (
    <div className="min-h-screen bg-[#0c0e1a] text-slate-100 flex flex-col font-sans">
      {/* 1. TOP NAVIGATION HEADER */}
      <header className="bg-[#121526] border-b border-slate-800 sticky top-0 z-40 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20 text-base">
              🏭
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-white">NexTrade</span>
                <span className="text-[10px] bg-blue-900/60 text-blue-300 font-bold px-2 py-0.5 rounded border border-blue-700/60 font-mono">
                  SUPPLIER HUB
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {profile?.companyName || 'Verified Supplier'}
              </p>
            </div>
          </div>

          {/* Quick Actions & Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right text-xs">
              <span className="text-slate-300 font-semibold">{profile?.contactPerson || 'Representative'}</span>
              <span className="text-slate-500 text-[10px]">{profile?.email}</span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>🚪</span>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. URGENT UNATTENDED TENDER BANNER (PRESENCE-AWARE ROUTING) */}
      {urgentAlert && (
        <aside aria-label="Urgent Tender Notification" className="bg-red-600 text-white px-4 py-3 shadow-lg animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-center sm:text-left">
              <span className="text-base animate-bounce">🚨</span>
              <div>
                <strong className="font-black tracking-wide">UNATTENDED TENDER ALERT: </strong>
                <span>{urgentAlert.message}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/live-auction/${urgentAlert.auctionId}`}
                className="bg-white text-red-700 hover:bg-slate-100 font-bold px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shadow-sm text-xs"
              >
                🚀 Jump to Bidding Room
              </a>
              <button
                type="button"
                onClick={() => setUrgentAlert(null)}
                className="text-white hover:text-red-200 p-1 text-sm font-bold leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* 3. MAIN DASHBOARD CONTENT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 w-full">
        {/* STATS OVERVIEW CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#171a2b] border border-slate-800 p-4 rounded-2xl flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
              👑
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Leading L1 Lots</div>
              <div className="text-xl font-black text-white">{totalLeadingLots} Active Leads</div>
            </div>
          </div>

          <div className="bg-[#171a2b] border border-slate-800 p-4 rounded-2xl flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center text-lg">
              🔴
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Live E-Auctions</div>
              <div className="text-xl font-black text-white">{liveTenders.length} In Progress</div>
            </div>
          </div>

          <div className="bg-[#171a2b] border border-slate-800 p-4 rounded-2xl flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-lg">
              📋
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Tenders Invited</div>
              <div className="text-xl font-black text-white">
                {liveTenders.length + upcomingTenders.length + concludedTenders.length} Assigned
              </div>
            </div>
          </div>
        </div>

        {/* SEARCH & FILTER BAR */}
        <div className="bg-[#121526] border border-slate-800/80 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="w-full md:w-96">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by tender ID, commodity, buyer or location..."
            />
          </div>

          <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
              }`}
            >
              All Tenders ({liveTenders.length + upcomingTenders.length + concludedTenders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'live'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
              Live ({liveTenders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upcoming')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'upcoming'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
              }`}
            >
              Upcoming ({upcomingTenders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('concluded')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'concluded'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
              }`}
            >
              Concluded ({concludedTenders.length})
            </button>
          </div>
        </div>

        {/* LOADING & ERROR STATES */}
        {isLoading && (
          <div className="text-center py-12 space-y-2">
            <span className="inline-block animate-spin text-2xl">🔄</span>
            <p className="text-xs text-slate-400">Loading your invited e-auctions...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-2xl text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {!isLoading && !error && (
          <div className="space-y-8">
            {/* SECTION A: LIVE & EXTENDED TENDERS */}
            {(activeTab === 'all' || activeTab === 'live') && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                    <span>Live Reverse Bidding Auctions ({filteredLive.length})</span>
                  </h2>
                </div>

                {filteredLive.length === 0 ? (
                  <div className="bg-[#171a2b] border border-slate-800/80 rounded-2xl p-6 text-center text-xs text-slate-500">
                    No active live auctions right now.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {filteredLive.map((tender) => (
                      <div
                        key={tender.auctionId}
                        className="bg-[#171a2b] border border-red-500/30 hover:border-red-500/60 rounded-2xl p-4 sm:p-5 transition-all shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-red-600/90 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                              ● LIVE BIDDING
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-400">{tender.auctionId}</span>
                            <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-medium">
                              {tender.category}
                            </span>
                            {/* Manned vs Unmanned Badge */}
                            {tender.isManned ? (
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <span>🟢</span> Teammate in Room
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                <span>⚠️</span> Unmanned Room
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-white hover:text-blue-400 transition-colors">
                            {tender.title}
                          </h3>
                          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                            <span>Buyer: <strong className="text-slate-200">{tender.customerName}</strong></span>
                            <span>•</span>
                            <span>Plant: {tender.deliveryLocation}</span>
                            <span>•</span>
                            <span>Total Lots: <strong className="text-slate-200">{tender.totalLots}</strong></span>
                            <span>•</span>
                            <span className="text-emerald-400 font-bold">👑 L1 on {tender.myL1Wins} lots</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <a
                            href={`/live-auction/${tender.auctionId}?key=${encodeURIComponent(tender.token)}`}
                            className="w-full md:w-auto bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded-xl text-xs text-center transition-all shadow-md shadow-red-600/20 flex items-center justify-center gap-1.5"
                          >
                            <span>🚀</span>
                            <span>Enter Bidding Room</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* SECTION B: UPCOMING SCHEDULED TENDERS */}
            {(activeTab === 'all' || activeTab === 'upcoming') && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                    <span>⏳</span>
                    <span>Upcoming Scheduled Tenders ({filteredUpcoming.length})</span>
                  </h2>
                </div>

                {filteredUpcoming.length === 0 ? (
                  <div className="bg-[#171a2b] border border-slate-800/80 rounded-2xl p-6 text-center text-xs text-slate-500">
                    No upcoming scheduled auctions enrolled.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {filteredUpcoming.map((tender) => (
                      <div
                        key={tender.auctionId}
                        className="bg-[#171a2b] border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                              ⏳ UPCOMING
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-400">{tender.auctionId}</span>
                            <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-medium">
                              {tender.category}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-white">{tender.title}</h3>
                          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                            <span>Buyer: <strong className="text-slate-200">{tender.customerName}</strong></span>
                            <span>•</span>
                            <span>Starts: <strong className="text-amber-300 font-mono">{new Date(tender.scheduledStart).toLocaleString('en-IN')}</strong></span>
                            <span>•</span>
                            <span>Duration: {tender.durationMinutes} mins</span>
                            <span>•</span>
                            <span>Lots: {tender.totalLots}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <a
                            href={`/live-auction/${tender.auctionId}?key=${encodeURIComponent(tender.token)}`}
                            className="w-full md:w-auto bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-4 py-2 rounded-xl text-xs text-center transition-colors flex items-center justify-center gap-1.5"
                          >
                            <span>⏳</span>
                            <span>Enter Waiting Room</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* SECTION C: CONCLUDED TENDERS & CONTRACT CERTIFICATES */}
            {(activeTab === 'all' || activeTab === 'concluded') && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <span>🏆</span>
                    <span>Concluded Tenders & Award Certificates ({filteredConcluded.length})</span>
                  </h2>
                </div>

                {filteredConcluded.length === 0 ? (
                  <div className="bg-[#171a2b] border border-slate-800/80 rounded-2xl p-6 text-center text-xs text-slate-500">
                    No concluded tender history yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {filteredConcluded.map((tender) => (
                      <div
                        key={tender.auctionId}
                        className="bg-[#171a2b] border border-slate-800/70 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                              ● CONCLUDED
                            </span>
                            <span className="font-mono text-xs text-slate-400">{tender.auctionId}</span>
                            {tender.myL1Wins > 0 ? (
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                                🏆 Awarded {tender.myL1Wins} Lots
                              </span>
                            ) : (
                              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                                Participated
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-slate-200">{tender.title}</h3>
                          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                            <span>Buyer: {tender.customerName}</span>
                            <span>•</span>
                            <span>Concluded: {new Date(tender.currentEnd).toLocaleDateString('en-IN')}</span>
                            <span>•</span>
                            <span>Lots Evaluated: {tender.totalLots}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <a
                            href={`/api/vendor/reports/${tender.auctionId}?key=${encodeURIComponent(tender.token)}`}
                            download
                            className="w-full md:w-auto bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-bold px-3.5 py-2 rounded-xl text-xs text-center transition-colors flex items-center justify-center gap-1.5"
                          >
                            <span>📄</span>
                            <span>Download Supplier Certificate (PDF)</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

