import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { io as socketIo, Socket } from 'socket.io-client';
import { Auction, TenderRequest, Amendment } from '../../types/procurement';
import { SearchBar } from '../../components/SearchBar';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ReviewRequestModal } from './ReviewRequestModal';
import { InvitesModal } from './InvitesModal';

type ActiveTab = 'live' | 'scheduled' | 'requests' | 'ended' | 'rejected' | 'all';

export const AuctionsManager: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [requests, setRequests] = useState<TenderRequest[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('live');
  const [activeInvitesAuction, setActiveInvitesAuction] = useState<{ id: string; title: string } | null>(null);

  // Decline/Remove Request Confirmation Modal
  const [declineTargetRequest, setDeclineTargetRequest] = useState<TenderRequest | null>(null);
  const [isDecliningRequest, setIsDecliningRequest] = useState(false);
  const [deletePermanently, setDeletePermanently] = useState(false);

  // URL Deep Links
  const reviewReqId = searchParams.get('reviewRequest');

  const loadData = async () => {
    try {
      // 1. Overview auctions & invites
      const res = await fetch('/api/admin/overview');
      if (res.ok) {
        const d = await res.json();
        setAuctions(d.auctions || []);
        setInvites(d.invites || []);
      }

      // 2. Tender Requests (fetch all statuses to populate pending vs rejected tabs)
      const reqRes = await fetch('/api/admin/tender-requests');
      if (reqRes.ok) {
        const d = await reqRes.json();
        setRequests(d.requests || []);
      }

      // 3. Amendments
      const amdRes = await fetch('/api/admin/amendments');
      if (amdRes.ok) {
        const d = await amdRes.json();
        setAmendments((d.amendments || []).filter((a: any) => a.status === 'pending_review'));
      }
    } catch (e) {
      console.warn('Failed to load auctions data:', e);
    }
  };

  useEffect(() => {
    loadData();

    // Connect WebSocket for IMMEDIATE live reactive updates
    const socket: Socket = socketIo();

    socket.on('auction_status_changed', () => loadData());
    socket.on('auctions_updated', () => loadData());
    socket.on('requests_updated', () => loadData());
    socket.on('new_notification', () => loadData());
    socket.on('auction_started', () => loadData());
    socket.on('auction_ended', () => loadData());

    // 3-second heartbeat polling to guarantee clock and state synchronicity
    const interval = setInterval(() => {
      loadData();
    }, 3000);

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const handleCloseReviewModal = () => {
    searchParams.delete('reviewRequest');
    setSearchParams(searchParams);
  };

  const handleOpenReviewModal = (id: string) => {
    searchParams.set('reviewRequest', id);
    setSearchParams(searchParams);
  };

  const handleApproveAmendment = async (id: string) => {
    const note = prompt('Optional approval remark for the corporate buyer:', 'Approved and auto-applied to reverse auction schedule.');
    if (note === null) return;
    try {
      const res = await fetch(`/api/admin/amendments/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: note }),
      });
      if (res.ok) loadData();
    } catch (_) {}
  };

  const handleRejectAmendment = async (id: string) => {
    const note = prompt('Reason for declining this amendment request:', 'Tender schedule cannot be modified within current window.');
    if (note === null) return;
    try {
      const res = await fetch(`/api/admin/amendments/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: note }),
      });
      if (res.ok) loadData();
    } catch (_) {}
  };

  const handleConfirmDeclineRequest = async () => {
    if (!declineTargetRequest) return;
    setIsDecliningRequest(true);
    try {
      if (deletePermanently) {
        await fetch(`/api/admin/tender-requests/${declineTargetRequest.id}`, {
          method: 'DELETE',
        });
      } else {
        await fetch(`/api/admin/tender-requests/${declineTargetRequest.id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Declined by NexTrade Operations Desk per buyer requirements.' }),
        });
      }
      setDeclineTargetRequest(null);
      setDeletePermanently(false);
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDecliningRequest(false);
    }
  };

  // Groupings & Counters
  const liveAuctions = auctions.filter((a) => a.status === 'live' || a.status === 'extended');
  const scheduledAuctions = auctions.filter((a) => a.status === 'scheduled');
  const endedAuctions = auctions.filter((a) => a.status === 'ended');
  const pendingRequests = requests.filter((r) => r.status === 'pending_review');
  const rejectedRequests = requests.filter((r) => r.status === 'rejected');

  // Filter based on active tab and search query
  const query = searchQuery.toLowerCase().trim();

  const filterItem = (text?: string | null) => !query || (text ? text.toLowerCase().includes(query) : false);

  const displayedAuctions = auctions.filter((a) => {
    const matchesSearch = filterItem(a.id) || filterItem(a.title) || filterItem(a.customer_name || '');
    if (!matchesSearch) return false;

    if (activeTab === 'live') return a.status === 'live' || a.status === 'extended';
    if (activeTab === 'scheduled') return a.status === 'scheduled';
    if (activeTab === 'ended') return a.status === 'ended';
    if (activeTab === 'all') return true;
    return false;
  });

  const displayedPendingRequests = pendingRequests.filter((r) => {
    return filterItem(r.request_number) || filterItem(r.title) || filterItem(r.company_name);
  });

  const displayedRejectedRequests = rejectedRequests.filter((r) => {
    return filterItem(r.request_number) || filterItem(r.title) || filterItem(r.company_name);
  });

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & SEARCH */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Auctions & Tender Operations</h1>
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full font-mono">
              {auctions.length} Total Events
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time reverse auction monitoring, scheduled tender controls, and client intake approvals.
          </p>
        </div>

        <div className="w-full md:w-80">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search tender ID, title, client..."
          />
        </div>
      </div>

      {/* 2. CATEGORY TAB SWITCHER */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('live')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-2xs ${
            activeTab === 'live'
              ? 'bg-red-600 text-white shadow-sm ring-2 ring-red-200'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${activeTab === 'live' ? 'bg-white animate-ping' : 'bg-red-500'}`}></span>
          <span>🔴 Live Bidding</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'live' ? 'bg-red-700 text-white' : 'bg-red-100 text-red-800'}`}>
            {liveAuctions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('scheduled')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-2xs ${
            activeTab === 'scheduled'
              ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-200'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          <span>⏳ Upcoming / Scheduled</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'scheduled' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'}`}>
            {scheduledAuctions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-2xs ${
            activeTab === 'requests'
              ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-200'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          <span>📋 Pending Intake & Requests</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'requests' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-900'}`}>
            {pendingRequests.length + amendments.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ended')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-2xs ${
            activeTab === 'ended'
              ? 'bg-slate-800 text-white shadow-sm ring-2 ring-slate-300'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          <span>🏁 Completed & Settled</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'ended' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-800'}`}>
            {endedAuctions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rejected')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-2xs ${
            activeTab === 'rejected'
              ? 'bg-slate-700 text-white shadow-sm ring-2 ring-slate-300'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          <span>📁 Declined / Archived</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'rejected' ? 'bg-slate-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
            {rejectedRequests.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-2xs ${
            activeTab === 'all'
              ? 'bg-blue-900 text-white shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          <span>All Records</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'all' ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-700'}`}>
            {auctions.length}
          </span>
        </button>
      </div>

      {/* 3. TAB VIEW: PENDING INTAKE & AMENDMENT REQUESTS */}
      {activeTab === 'requests' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Pending Amendments Sub-Section */}
          {amendments.length > 0 && (
            <div className="bg-blue-50 border border-blue-300 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-base">📝</span>
                <h3 className="text-sm font-bold text-blue-950">Pending Tender Amendment Requests ({amendments.length})</h3>
                <span className="text-[10px] bg-blue-200 text-blue-900 font-bold px-2 py-0.5 rounded-full">
                  Requires Desk Decision
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {amendments.map((amd) => (
                  <div key={amd.id} className="bg-white p-4 rounded-xl border border-blue-200 shadow-2xs space-y-2.5 text-xs">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="font-bold text-blue-700">{amd.id} &rarr; {amd.auction_id}</span>
                      <span className="text-slate-400">{new Date(amd.created_at).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <strong className="text-slate-900 font-bold block">{amd.auction_title || amd.auction_id}</strong>
                      <span className="text-slate-500 text-[11px] block">Corporate Buyer: {amd.customer_org_name}</span>
                      <p className="text-slate-700 italic bg-blue-50/70 p-2 rounded-lg mt-1 text-[11px]">Reason: "{amd.reason}"</p>
                    </div>
                    <div className="pt-2 border-t flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleRejectAmendment(amd.id)}
                        className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 rounded-lg font-bold border border-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApproveAmendment(amd.id)}
                        className="px-3.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Approve & Auto-Apply
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Intake Requests Cards */}
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>📋</span> Client Tender Requests Awaiting Review ({displayedPendingRequests.length})
              </h2>
              <span className="text-xs text-slate-500">Unprocessed requests can be inspected or dismissed to keep desk clean</span>
            </div>

            {displayedPendingRequests.length === 0 ? (
              <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 text-xs">
                <span className="text-3xl block mb-2">🎉</span>
                <p className="text-sm font-semibold text-slate-700">No pending client requests</p>
                <p className="text-xs text-slate-400 mt-1">All incoming tender requests have been reviewed or converted.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayedPendingRequests.map((r) => (
                  <div key={r.id} className="bg-white p-5 rounded-2xl border border-amber-200 shadow-2xs space-y-3 text-xs hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-blue-600 text-xs">{r.request_number}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-900 font-mono">
                        {r.customer_approved === 1 ? '🟢 BUYER SIGNED OFF' : r.admin_revised === 1 ? '🟡 REVISED • AWAITING SIGN-OFF' : '📋 INTAKE RECEIVED'}
                      </span>
                    </div>

                    <div>
                      <strong className="text-slate-900 font-bold text-sm block">{r.title}</strong>
                      <span className="text-slate-500 text-[11px] block mt-0.5">{r.company_name} • {r.contact_person}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] bg-slate-50 p-2.5 rounded-xl text-slate-600 border border-slate-100">
                      <span><strong>{r.lots?.length || 0}</strong> Lots</span>
                      <span>Duration: <strong>{r.duration_minutes}m</strong></span>
                      <span>Target: <strong>{new Date(r.target_date || '').toLocaleDateString()}</strong></span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDeclineTargetRequest(r);
                          setDeletePermanently(false);
                        }}
                        className="text-red-500 hover:text-red-700 font-bold text-xs px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        ✕ Decline / Dismiss
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenReviewModal(r.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded-xl text-xs transition-colors cursor-pointer shadow-2xs whitespace-nowrap flex items-center gap-1.5"
                        >
                          <span>🔍</span> Inspect & Launch
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. TAB VIEW: DISMISSED / DECLINED REQUESTS */}
      {activeTab === 'rejected' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">Archived / Declined Requests ({displayedRejectedRequests.length})</h2>
            <span className="text-xs text-slate-500">Historical records of tenders that did not proceed</span>
          </div>

          {displayedRejectedRequests.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 text-xs">
              <span className="text-3xl block mb-2">📁</span>
              <p className="text-sm font-semibold text-slate-700">No declined requests</p>
              <p className="text-xs text-slate-400 mt-1">Declined or dismissed requests will appear here for archival record.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayedRejectedRequests.map((r) => (
                <div key={r.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 text-xs opacity-75 hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-600 text-xs">{r.request_number}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-800 font-mono">
                      DECLINED
                    </span>
                  </div>

                  <div>
                    <strong className="text-slate-900 font-bold block">{r.title}</strong>
                    <span className="text-slate-500 text-[11px] block">{r.company_name} • {r.contact_person}</span>
                    {r.rejection_reason && (
                      <p className="text-red-700 italic bg-red-50/60 p-2 rounded-lg mt-1 text-[11px]">
                        Reason: "{r.rejection_reason}"
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Archived Record</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDeclineTargetRequest(r);
                        setDeletePermanently(true);
                      }}
                      className="text-red-500 hover:text-red-700 text-xs font-bold hover:bg-red-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      🗑️ Delete Permanently
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. TAB VIEW: AUCTIONS LIST (LIVE, SCHEDULED, ENDED, ALL) */}
      {(activeTab === 'live' || activeTab === 'scheduled' || activeTab === 'ended' || activeTab === 'all') && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {displayedAuctions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 text-xs">
              <span className="text-3xl block mb-2">
                {activeTab === 'live' ? '🔴' : activeTab === 'scheduled' ? '⏳' : '🏁'}
              </span>
              <p className="text-sm font-semibold text-slate-700">
                {activeTab === 'live'
                  ? 'No reverse auctions are actively live right now'
                  : activeTab === 'scheduled'
                  ? 'No auctions scheduled for the future'
                  : activeTab === 'ended'
                  ? 'No settled auctions found'
                  : 'No auctions match your search criteria'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {activeTab === 'live'
                  ? 'Upcoming tenders will automatically appear here when their scheduled start time arrives.'
                  : 'Use the "+ Builder" tab to create new reverse auctions.'}
              </p>
            </div>
          ) : (
            displayedAuctions.map((auc) => {
              const isLive = auc.status === 'live' || auc.status === 'extended';
              const isScheduled = auc.status === 'scheduled';
              const isEnded = auc.status === 'ended';

              return (
                <div
                  key={auc.id}
                  className={`bg-white p-5 rounded-2xl border shadow-xs space-y-3.5 text-xs transition-shadow ${
                    isLive ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200 hover:shadow-sm'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 text-sm">{auc.id}</span>
                        <span
                          className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full border font-mono ${
                            isLive
                              ? 'bg-red-100 text-red-800 border-red-300 animate-pulse'
                              : isScheduled
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                        >
                          {isLive ? '● LIVE BIDDING' : auc.status}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900">{auc.title}</h3>
                      <p className="text-[11px] text-slate-500">
                        Corporate Client: <strong className="text-slate-700">{auc.customer_name || 'Direct Enterprise Client'}</strong>
                      </p>
                    </div>

                    {/* ACTION BUTTONS (with whitespace-nowrap & flex-shrink-0 to guarantee clean layout) */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {isScheduled ? (
                        <Link
                          to={`/admin/auction-editor?id=${auc.id}`}
                          className="bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold px-3.5 py-2 rounded-xl border border-amber-200 transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 shadow-2xs"
                        >
                          <span>✏️</span> Edit Specs
                        </Link>
                      ) : (
                        <Link
                          to={`/admin/auction-editor?id=${auc.id}`}
                          className="bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold px-3.5 py-2 rounded-xl border border-slate-200 transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 shadow-2xs"
                        >
                          <span>🔒</span> Inspect Specs
                        </Link>
                      )}

                      <button
                        type="button"
                        onClick={() => setActiveInvitesAuction({ id: auc.id, title: auc.title })}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3.5 py-2 rounded-xl border border-blue-200 transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <span>🔑</span> Magic Links
                      </button>

                      {/* Official Settlement Audit PDF: ONLY available once auction is ended */}
                      {isEnded && (
                        <a
                          href={`/api/admin/auctions/${auc.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold px-3.5 py-2 rounded-xl border border-slate-200 transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1 shadow-2xs btn-slate"
                        >
                          <span>📄</span> Official Audit PDF
                        </a>
                      )}

                      {/* SPECTATOR / SETTLEMENT BUTTON */}
                      <a
                        href={`/observer/${auc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`font-bold px-4 py-2 rounded-xl transition-all whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 shadow-xs btn-white ${
                          isLive
                            ? 'bg-red-600 hover:bg-red-700 animate-pulse text-white'
                            : isEnded
                            ? 'bg-slate-700 hover:bg-slate-800 text-white'
                            : 'bg-slate-800 hover:bg-slate-900 text-white'
                        }`}
                        style={{ color: '#ffffff' }}
                      >
                        <span className="btn-white">{isLive ? '🔴' : '👁️'}</span>
                        <span className="btn-white" style={{ color: '#ffffff' }}>
                          {isLive ? 'Watch Live' : isEnded ? 'Settlement Room' : 'Spectator Room'}
                        </span>
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Start Time</span>
                      <strong className="text-slate-800">{new Date(auc.scheduled_start).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Duration</span>
                      <strong className="text-slate-800">{auc.duration_minutes} Mins</strong>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Facility</span>
                      <strong className="text-slate-800">{auc.delivery_location || 'Corporate Site'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Procurement Lots</span>
                      <strong className="text-slate-800">{auc.lot_count || 0} Lots</strong>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* URL-Synchronized Review Modal */}
      {reviewReqId && (
        <ReviewRequestModal
          requestId={reviewReqId}
          onClose={handleCloseReviewModal}
          onSuccess={loadData}
        />
      )}

      {/* Invites Modal */}
      {activeInvitesAuction && (
        <InvitesModal
          auctionId={activeInvitesAuction.id}
          auctionTitle={activeInvitesAuction.title}
          invites={invites}
          onClose={() => setActiveInvitesAuction(null)}
        />
      )}

      {/* DECLINE / REMOVE REQUEST MODAL */}
      <ConfirmModal
        isOpen={!!declineTargetRequest}
        variant="danger"
        title={deletePermanently ? "Delete Tender Request Permanently" : "Decline Client Tender Request"}
        message={
          deletePermanently
            ? `Permanently purge "${declineTargetRequest?.title}" (${declineTargetRequest?.request_number}) from the system? This action cannot be undone.`
            : `Are you sure you want to decline "${declineTargetRequest?.title}" (${declineTargetRequest?.request_number})? It will be removed from your active intake queue.`
        }
        confirmText={deletePermanently ? "Purge Permanently" : "Decline Request"}
        cancelText="Cancel"
        isLoading={isDecliningRequest}
        onConfirm={handleConfirmDeclineRequest}
        onCancel={() => {
          setDeclineTargetRequest(null);
          setDeletePermanently(false);
        }}
      />
    </div>
  );
};
