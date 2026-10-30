import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Auction, TenderRequest, Facility, Vendor, Amendment, Organization } from '../../types/procurement';
import { InspectRequestModal } from './InspectRequestModal';

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
    setSearchParams(searchParams); // Cleanly removes parameter from browser address bar!
  };

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
            {tenderRequests.map((r) => (
              <div key={r.id} className="bg-white p-3 rounded-lg border border-amber-200 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900">{r.title}</strong>
                  <span className="text-[11px] text-slate-500 font-mono">{r.request_number} • {r.lots?.length} Lots</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    searchParams.set('inspectRequest', r.id);
                    setSearchParams(searchParams);
                  }}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-[11px] cursor-pointer"
                >
                  Inspect / Sign Off
                </button>
              </div>
            ))}
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
      {activeTab === 'auctions' && (
        <div className="space-y-3">
          {activeAuctions.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl bg-white text-xs text-slate-400">
              No live or scheduled auctions right now.
            </div>
          ) : (
            activeAuctions.map((auc) => {
              const isLive = auc.status === 'live' || auc.status === 'extended';
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
                            isLive ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {isLive ? '● LIVE BIDDING' : 'SCHEDULED'}
                        </span>
                      </div>
                      <a href={`/customer/auctions/${auc.id}`} className="text-sm font-bold text-slate-900 hover:text-blue-600 mt-0.5 block">
                        {auc.title} &rarr;
                      </a>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Reserve Baseline</span>
                      <span className="text-sm font-black text-slate-900">
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
                      <strong>{auc.category || 'Commodities'}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <a
                      href={auc.observerUrl || `/observer/${auc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                    >
                      <span>👁️</span> Executive Observer Screen
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'facilities' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {facilities.map((f) => (
            <div key={f.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1 text-xs">
              <strong className="text-slate-900 block font-bold text-sm">{f.facility_name}</strong>
              <span className="text-slate-500 block">{f.city}, {f.state}</span>
              <p className="text-[11px] text-slate-400 pt-1">{f.address || 'Standard plant access requirements apply.'}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'suppliers' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {suppliers.map((v) => (
            <div key={v.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <strong className="text-slate-900 text-sm font-bold">{v.company_name}</strong>
                <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-200">
                  APPROVED
                </span>
              </div>
              <span className="text-slate-600 block">{v.contact_person} • {v.phone}</span>
              <span className="text-slate-400 font-mono text-[11px] block">{v.email}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'amendments' && (
        <div className="space-y-3">
          {amendments.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-xl border text-xs text-slate-400">
              No amendment requests recorded yet.
            </div>
          ) : (
            amendments.map((a) => (
              <div key={a.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-blue-600">{a.id} &rarr; {a.auction_id}</span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {a.status}
                  </span>
                </div>
                <p className="text-slate-800 font-medium">Reason: "{a.reason}"</p>
                {a.admin_notes && <p className="text-blue-700 text-[11px]">Desk Remark: {a.admin_notes}</p>}
              </div>
            ))
          )}
        </div>
      )}

      {/* URL-Synchronized Modal */}
      {inspectReqId && (
        <InspectRequestModal
          requestId={inspectReqId}
          onClose={handleCloseInspect}
          onSuccess={loadDashboard}
        />
      )}
    </div>
  );
};

