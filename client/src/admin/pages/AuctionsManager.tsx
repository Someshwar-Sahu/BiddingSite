import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Auction, TenderRequest, Amendment } from '../../types/procurement';
import { SearchBar } from '../../components/SearchBar';
import { ReviewRequestModal } from './ReviewRequestModal';
import { InvitesModal } from './InvitesModal';

export const AuctionsManager: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [requests, setRequests] = useState<TenderRequest[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeInvitesAuction, setActiveInvitesAuction] = useState<{ id: string; title: string } | null>(null);

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

      // 2. Pending Requests
      const reqRes = await fetch('/api/admin/tender-requests?status=pending_review');
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
  }, []);

  const handleCloseReviewModal = () => {
    searchParams.delete('reviewRequest');
    setSearchParams(searchParams); // Instantly cleanly strips query parameter from URL bar!
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

  const filteredAuctions = auctions.filter((a) => {
    const matchesQuery =
      a.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.customer_name && a.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl shadow-xs border border-slate-200">
        <div>
          <h1 className="text-base font-bold text-slate-800">Auctions & Tender Operations</h1>
          <p className="text-xs text-slate-500">Live bidding rooms, scheduled parameters, and official settlement audits.</p>
        </div>

        <div className="flex items-center gap-2">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search tender, code, client..."
            className="w-52 sm:w-64"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 bg-white"
          >
            <option value="all">All States</option>
            <option value="live">Live Bidding</option>
            <option value="scheduled">Scheduled</option>
            <option value="ended">Settled</option>
          </select>
        </div>
      </div>

      {/* 1. Pending Tender Requests Queue */}
      {requests.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <h3 className="text-sm font-bold text-amber-950">Pending Client Tender Requests ({requests.length})</h3>
              <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                Requires Desk Review
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {requests.map((r) => (
              <div key={r.id} className="bg-white p-3.5 rounded-lg border border-amber-200 shadow-2xs space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-blue-600">{r.request_number}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-900">
                    {r.customer_approved === 1 ? '🟢 BUYER SIGNED OFF' : r.admin_revised === 1 ? '🟡 REVISED • AWAITING BUYER' : '📋 INTAKE RECEIVED'}
                  </span>
                </div>
                <div>
                  <strong className="text-slate-900 font-bold block">{r.title}</strong>
                  <span className="text-slate-500 text-[11px]">{r.company_name} • {r.contact_person}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded text-slate-600">
                  <span><strong>{r.lots?.length || 0}</strong> Lot(s)</span>
                  <span>Duration: <strong>{r.duration_minutes}m</strong></span>
                </div>
                <div className="pt-1 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenReviewModal(r.id)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded text-xs transition-colors cursor-pointer"
                  >
                    🔍 Inspect / Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Pending Amendments Queue */}
      {amendments.length > 0 && (
        <div className="bg-blue-50 border border-blue-300 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">📝</span>
              <h3 className="text-sm font-bold text-blue-950">Pending Tender Amendment Requests ({amendments.length})</h3>
              <span className="text-[10px] bg-blue-200 text-blue-900 font-bold px-2 py-0.5 rounded-full">
                Requires Approval
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {amendments.map((amd) => (
              <div key={amd.id} className="bg-white p-3.5 rounded-lg border border-blue-200 shadow-2xs space-y-2 text-xs">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="font-bold text-blue-700">{amd.id} &rarr; {amd.auction_id}</span>
                  <span className="text-slate-400">{new Date(amd.created_at).toLocaleDateString()}</span>
                </div>
                <div>
                  <strong className="text-slate-900 font-bold block">{amd.auction_title || amd.auction_id}</strong>
                  <span className="text-slate-500 text-[11px] block">Corporate Buyer: {amd.customer_org_name}</span>
                  <p className="text-slate-700 italic bg-blue-50/60 p-1.5 rounded mt-1 text-[11px]">Reason: "{amd.reason}"</p>
                </div>
                <div className="pt-2 border-t flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleRejectAmendment(amd.id)}
                    className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 rounded font-semibold border"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproveAmendment(amd.id)}
                    className="px-3 py-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
                  >
                    Approve & Auto-Apply
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Auctions List */}
      <div className="space-y-3">
        {filteredAuctions.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">
            No reverse auctions found matching filter.
          </div>
        ) : (
          filteredAuctions.map((auc) => {
            const isLive = auc.status === 'live' || auc.status === 'extended';
            return (
              <div key={auc.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{auc.id}</span>
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                          isLive
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}
                      >
                        {auc.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">{auc.title}</h3>
                    <p className="text-[11px] text-slate-500">Corporate Client: <strong className="text-slate-700">{auc.customer_name || 'Direct Client'}</strong></p>
                  </div>

                  <div className="flex items-center gap-2">
                    {auc.status === 'scheduled' ? (
                      <a
                        href={`/admin/auction-editor?id=${auc.id}`}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold px-3 py-1.5 rounded-lg border border-amber-200"
                      >
                        ✏️ Edit
                      </a>
                    ) : (
                      <a
                        href={`/admin/auction-editor?id=${auc.id}`}
                        className="bg-slate-50 text-slate-500 font-bold px-3 py-1.5 rounded-lg border border-slate-200"
                      >
                        🔒 Inspect
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setActiveInvitesAuction({ id: auc.id, title: auc.title })}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-lg border border-blue-200"
                    >
                      🔑 Magic Links
                    </button>

                    <a
                      href={`/api/admin/auctions/${auc.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-200"
                    >
                      📄 Audit PDF
                    </a>

                    <a
                      href={`/observer/${auc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 py-1.5 rounded-lg"
                    >
                      👁️ Spectator
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Start</span>
                    <strong>{new Date(auc.scheduled_start).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Duration</span>
                    <strong>{auc.duration_minutes} Mins</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Location</span>
                    <strong>{auc.delivery_location || 'Corporate Site'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Scope</span>
                    <strong>{auc.lots?.length || 0} Lots</strong>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

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
    </div>
  );
};

