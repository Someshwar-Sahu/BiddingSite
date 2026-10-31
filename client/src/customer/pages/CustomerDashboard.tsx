import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Auction, TenderRequest, Facility, Vendor, Amendment, Organization } from '../../types/procurement';
import { SearchBar } from '../../components/SearchBar';
import { InspectRequestModal } from './InspectRequestModal';
import { CustomerEditRequestModal } from './CustomerEditRequestModal';
import { CustomerAmendmentModal } from './CustomerAmendmentModal';
import { AddFacilityModal } from './AddFacilityModal';
import { AddSupplierModal } from './AddSupplierModal';

export const CustomerDashboard: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [org, setOrg] = useState<Organization | null>(null);
  const [kpis, setKpis] = useState<any>({});
  const [activeAuctions, setActiveAuctions] = useState<Auction[]>([]);
  const [concludedAuctions, setConcludedAuctions] = useState<Auction[]>([]);
  const [tenderRequests, setTenderRequests] = useState<TenderRequest[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [suppliers, setSuppliers] = useState<Vendor[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [activeTab, setActiveTab] = useState<'auctions' | 'facilities' | 'suppliers' | 'amendments'>('auctions');

  // Search states for all sections
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'scheduled' | 'ended'>('all');
  const [auctionSearch, setAuctionSearch] = useState('');
  const [facilitySearch, setFacilitySearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [amendmentSearch, setAmendmentSearch] = useState('');

  // Modals state
  const [editReqId, setEditReqId] = useState<string | null>(null);
  const [amendAuction, setAmendAuction] = useState<Auction | null>(null);
  const [isAddFacilityOpen, setIsAddFacilityOpen] = useState(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  const inspectReqId = searchParams.get('inspectRequest');
  const targetAuctionId = searchParams.get('auctionId');

  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/customer/dashboard');
      if (res.status === 401) {
        window.location.href = '/customer/login';
        return;
      }
      if (!res.ok) return;
      const d = await res.json();
      setOrg(d.organization);
      setKpis(d.kpis || {});
      setActiveAuctions(d.activeAuctions || []);
      setConcludedAuctions(d.concludedAuctions || []);
      setTenderRequests(d.tenderRequests || []);
      setFacilities(d.facilities || []);
      setSuppliers(d.vendorPool || []);
      setAmendments(d.amendments || []);
    } catch (_) {}
  };

  useEffect(() => {
    loadDashboard();
    const tabParam = searchParams.get('tab') as any;
    if (['auctions', 'facilities', 'suppliers', 'amendments'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []);

  const handleTabChange = (t: 'auctions' | 'facilities' | 'suppliers' | 'amendments') => {
    setActiveTab(t);
    if (t === 'auctions') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', t);
    }
    setSearchParams(searchParams);
  };

  const handleCloseInspect = () => {
    searchParams.delete('inspectRequest');
    setSearchParams(searchParams);
  };

  const handleDeleteFacility = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this delivery plant?')) return;
    try {
      const res = await fetch(`/api/customer/facilities/${id}`, { method: 'DELETE' });
      if (res.ok) loadDashboard();
    } catch (_) {}
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this vendor from your corporate pool?')) return;
    try {
      const res = await fetch(`/api/customer/vendors/${id}`, { method: 'DELETE' });
      if (res.ok) loadDashboard();
    } catch (_) {}
  };

  // 1. Filtered Auctions
  const allAuctions = [...activeAuctions, ...concludedAuctions];
  const filteredAuctions = allAuctions.filter((a) => {
    if (statusFilter === 'live' && a.status !== 'live' && a.status !== 'extended') return false;
    if (statusFilter === 'scheduled' && a.status !== 'scheduled') return false;
    if (statusFilter === 'ended' && a.status !== 'ended') return false;
    if (auctionSearch.trim()) {
      const q = auctionSearch.toLowerCase();
      const matchId = a.id.toLowerCase().includes(q);
      const matchTitle = (a.title || '').toLowerCase().includes(q);
      const matchLoc = (a.delivery_location || '').toLowerCase().includes(q);
      const matchCat = (a.category || '').toLowerCase().includes(q);
      if (!matchId && !matchTitle && !matchLoc && !matchCat) return false;
    }
    return true;
  });

  // 2. Filtered Facilities
  const filteredFacilities = facilities.filter((f) => {
    if (!facilitySearch.trim()) return true;
    const q = facilitySearch.toLowerCase();
    return (
      f.facility_name.toLowerCase().includes(q) ||
      f.city.toLowerCase().includes(q) ||
      f.state.toLowerCase().includes(q) ||
      (f.address || '').toLowerCase().includes(q)
    );
  });

  // 3. Filtered Suppliers
  const filteredSuppliers = suppliers.filter((v) => {
    if (!supplierSearch.trim()) return true;
    const q = supplierSearch.toLowerCase();
    return (
      v.company_name.toLowerCase().includes(q) ||
      (v.contact_person || '').toLowerCase().includes(q) ||
      (v.email || '').toLowerCase().includes(q) ||
      (v.phone || '').includes(q) ||
      (v.gstin || '').toLowerCase().includes(q)
    );
  });

  // 4. Filtered Amendments
  const filteredAmendments = amendments.filter((a) => {
    if (!amendmentSearch.trim()) return true;
    const q = amendmentSearch.toLowerCase();
    return (
      a.id.toLowerCase().includes(q) ||
      (a.auction_title || '').toLowerCase().includes(q) ||
      (a.auction_id || '').toLowerCase().includes(q) ||
      (a.reason || '').toLowerCase().includes(q) ||
      (a.admin_notes || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* 1. KPI Spend Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Committed Spend</span>
          <span className="text-xl font-black text-slate-900 mt-1 block">
            ₹{Number(kpis.totalCommittedSpend || 0).toLocaleString('en-IN')}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Cost Savings</span>
          <span className="text-xl font-black text-emerald-600 mt-1 block">
            ₹{Number(kpis.totalSavings || 0).toLocaleString('en-IN')}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Active Reverse Tenders</span>
          <span className="text-xl font-black text-blue-600 mt-1 block">{kpis.activeCount || 0}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Settled Contracts</span>
          <span className="text-xl font-black text-slate-700 mt-1 block">{kpis.concludedCount || 0}</span>
        </div>
      </div>

      {/* 2. Pending Requests Notification Banner */}
      {tenderRequests.filter((r) => r.status === 'pending_review').length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <span>📋</span> Tender Intake Specifications in Review
            </h3>
            <Link to="/customer/request-tender" className="text-xs text-blue-700 font-bold hover:underline">
              + Plan New Tender &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {tenderRequests
              .filter((r) => r.status === 'pending_review')
              .map((r) => {
                const isRevised = r.admin_revised === 1;
                return (
                  <div
                    key={r.id}
                    className="bg-white p-3.5 rounded-xl border border-amber-200 flex flex-col justify-between gap-3 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded font-mono bg-slate-100 text-slate-600">
                          {r.request_number}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isRevised
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-blue-50 text-blue-800'
                          }`}
                        >
                          {isRevised ? '⚡ REVISED • AWAITING BUYER' : '📋 INTAKE RECEIVED'}
                        </span>
                      </div>
                      <strong className="block text-slate-900 text-xs mt-1.5">{r.title}</strong>
                      <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                        {r.lots?.length || 0} Lots • {r.delivery_location || 'Customer Facility'}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setEditReqId(r.id)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <span>✏️</span> Edit Specs
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          searchParams.set('inspectRequest', r.id);
                          setSearchParams(searchParams);
                        }}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[11px] transition-colors shadow-xs cursor-pointer flex items-center gap-1"
                      >
                        <span>🔍</span> Inspect / Sign Off
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 3. Navigation Tabs */}
      <div className="border-b border-slate-200 flex items-center gap-2 text-xs font-bold">
        {[
          { key: 'auctions', label: `Active & Scheduled Tenders (${activeAuctions.length})` },
          { key: 'facilities', label: `Delivery Plants (${facilities.length})` },
          { key: 'suppliers', label: `Authorized Suppliers (${suppliers.length})` },
          { key: 'amendments', label: `Amendments History (${amendments.length})` },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTabChange(t.key as any)}
            className={`py-3 px-4 border-b-2 transition-colors cursor-pointer ${
              activeTab === t.key
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 4. Tab Panes */}

      {/* TAB 1: AUCTIONS */}
      {activeTab === 'auctions' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-slate-400 font-bold text-xs">Status:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                {(['all', 'live', 'scheduled', 'ended'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 rounded-md font-bold uppercase text-[10px] transition-colors cursor-pointer ${
                      statusFilter === st ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st === 'all' ? 'All' : st === 'ended' ? 'Concluded' : st}
                  </button>
                ))}
              </div>
            </div>
            <SearchBar
              value={auctionSearch}
              onChange={setAuctionSearch}
              placeholder="Search by tender ID, title, category, destination..."
              className="w-full sm:w-80"
            />
          </div>

          {filteredAuctions.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-white text-xs text-slate-400">
              No auctions match your current filters.
            </div>
          ) : (
            filteredAuctions.map((auc) => {
              const isLive = auc.status === 'live' || auc.status === 'extended';
              const isScheduled = auc.status === 'scheduled';
              const isEnded = auc.status === 'ended';
              const isHighlighted = targetAuctionId === auc.id;

              return (
                <div
                  key={auc.id}
                  className={`bg-white border rounded-xl p-5 shadow-2xs space-y-3 transition-all ${
                    isHighlighted ? 'ring-2 ring-blue-500 border-blue-500' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-500">{auc.id}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isLive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 animate-pulse'
                              : isScheduled
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isLive ? '● LIVE BIDDING' : isScheduled ? 'SCHEDULED' : 'CONCLUDED'}
                        </span>
                      </div>
                      <a href={`/customer/auctions/${auc.id}`} className="text-sm font-bold text-slate-900 hover:text-blue-600 mt-0.5 block">
                        {auc.title} &rarr;
                      </a>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Reserve Baseline</span>
                      <span className="text-sm font-black text-slate-900 font-mono">
                        ₹{Number(auc.totalReserve || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Plant Destination</span>
                      <strong>{auc.delivery_location || 'Corporate Site'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Scope</span>
                      <strong>{auc.lots?.length || 0} Procurement Lots</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Category</span>
                      <strong>{auc.category || 'General Procurement'}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      {isScheduled && (
                        <button
                          type="button"
                          onClick={() => setAmendAuction(auc)}
                          className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <span>📝</span> Request Amendment
                        </button>
                      )}
                      {isEnded && (
                        <a
                          href={`/api/admin/auctions/${auc.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 btn-slate"
                        >
                          <span>📄</span> Download Settlement PDF
                        </a>
                      )}
                    </div>

                    <a
                      href={auc.observerUrl || `/observer/${auc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-slate-800 hover:bg-slate-900 text-white font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer btn-white"
                      style={{ color: '#ffffff' }}
                    >
                      <span className="btn-white">👁️</span>
                      <span className="btn-white" style={{ color: '#ffffff' }}>Executive Observer Screen</span>
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: DELIVERY PLANTS */}
      {activeTab === 'facilities' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
            <div>
              <h3 className="font-bold text-slate-800 text-xs">Corporate Delivery Sites & Plants ({facilities.length})</h3>
              <p className="text-[11px] text-slate-400">Manage plant destinations available for tender delivery.</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <SearchBar
                value={facilitySearch}
                onChange={setFacilitySearch}
                placeholder="Search plants by name, city, state..."
                className="w-full sm:w-64"
              />
              <button
                type="button"
                onClick={() => setIsAddFacilityOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer shadow-xs"
              >
                <span>+</span> Add Plant
              </button>
            </div>
          </div>

          {filteredFacilities.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-white text-xs text-slate-400">
              No delivery facilities found matching your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {filteredFacilities.map((f) => (
                <div key={f.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2 text-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
                  <div>
                    <div className="flex items-start justify-between">
                      <strong className="text-slate-900 block font-bold text-sm">{f.facility_name}</strong>
                      <button
                        type="button"
                        onClick={() => handleDeleteFacility(f.id)}
                        className="text-slate-300 hover:text-red-600 font-bold p-1 rounded hover:bg-red-50 cursor-pointer"
                        title="Delete Facility"
                      >
                        ✕
                      </button>
                    </div>
                    <span className="text-slate-500 block font-medium mt-0.5">{f.city}, {f.state}</span>
                    <p className="text-[11px] text-slate-400 pt-1 leading-snug">{f.address || 'Standard plant access requirements apply.'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUTHORIZED SUPPLIERS */}
      {activeTab === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
            <div>
              <h3 className="font-bold text-slate-800 text-xs">Vetted Supplier Network ({suppliers.length})</h3>
              <p className="text-[11px] text-slate-400">Suppliers authorized to receive tender invitations from your corporate pool.</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <SearchBar
                value={supplierSearch}
                onChange={setSupplierSearch}
                placeholder="Search vendors by name, email, contact..."
                className="w-full sm:w-64"
              />
              <button
                type="button"
                onClick={() => setIsAddSupplierOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer shadow-xs"
              >
                <span>+</span> Add Supplier
              </button>
            </div>
          </div>

          {filteredSuppliers.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-white text-xs text-slate-400">
              No suppliers found matching your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredSuppliers.map((v) => (
                <div key={v.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2 text-xs hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <strong className="text-slate-900 text-sm font-bold">{v.company_name}</strong>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-200">
                        APPROVED
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteSupplier(v.id)}
                        className="text-slate-300 hover:text-red-600 font-bold p-1 rounded hover:bg-red-50 cursor-pointer"
                        title="Remove from pool"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <span className="text-slate-600 block">{v.contact_person} • {v.phone}</span>
                  <span className="text-slate-400 font-mono text-[11px] block">{v.email}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: AMENDMENTS HISTORY */}
      {activeTab === 'amendments' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
            <div>
              <h3 className="font-bold text-slate-800 text-xs">Tender Amendments History ({amendments.length})</h3>
              <p className="text-[11px] text-slate-400">All governed specification and schedule revisions submitted to the desk.</p>
            </div>
            <SearchBar
              value={amendmentSearch}
              onChange={setAmendmentSearch}
              placeholder="Search by amendment ID, tender title, reason..."
              className="w-full sm:w-80"
            />
          </div>

          {filteredAmendments.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
              No amendment requests found matching your query.
            </div>
          ) : (
            filteredAmendments.map((a) => (
              <div key={a.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-blue-600">{a.id}</span>
                    <span className="text-slate-400">&rarr;</span>
                    <strong className="text-slate-800">{a.auction_title || a.auction_id}</strong>
                  </div>
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                      a.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : a.status === 'rejected'
                        ? 'bg-red-50 text-red-800 border border-red-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {a.status}
                  </span>
                </div>
                <p className="text-slate-800 font-medium">Business Justification: "{a.reason}"</p>
                {a.admin_notes && (
                  <p className="text-blue-700 bg-blue-50 p-2 rounded-lg text-[11px]">
                    <strong>NexTrade Operations Desk Remark:</strong> {a.admin_notes}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* MODAL 1: Inspect & Sign Off (URL-Synchronized) */}
      {inspectReqId && (
        <InspectRequestModal
          requestId={inspectReqId}
          onClose={handleCloseInspect}
          onSuccess={loadDashboard}
        />
      )}

      {/* MODAL 2: Edit Pending Request Specs */}
      {editReqId && (
        <CustomerEditRequestModal
          requestId={editReqId}
          onClose={() => setEditReqId(null)}
          onSuccess={loadDashboard}
        />
      )}

      {/* MODAL 3: Submit Amendment */}
      {amendAuction && (
        <CustomerAmendmentModal
          auction={amendAuction}
          facilities={facilities}
          onClose={() => setAmendAuction(null)}
          onSuccess={loadDashboard}
        />
      )}

      {/* MODAL 4: Add Facility */}
      <AddFacilityModal
        isOpen={isAddFacilityOpen}
        onClose={() => setIsAddFacilityOpen(false)}
        onSuccess={loadDashboard}
      />

      {/* MODAL 5: Add Supplier */}
      <AddSupplierModal
        isOpen={isAddSupplierOpen}
        onClose={() => setIsAddSupplierOpen(false)}
        onSuccess={loadDashboard}
      />
    </div>
  );
};
