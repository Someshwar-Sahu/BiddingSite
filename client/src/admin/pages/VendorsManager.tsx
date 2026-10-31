import React, { useEffect, useState } from 'react';
import { SearchBar } from '../../components/SearchBar';

interface Vendor {
  id: string;
  company_name: string;
  contact_person?: string;
  email: string;
  phone?: string;
  gstin?: string;
  pan?: string;
  status: string;
  assigned_companies?: string;
  assigned_company_ids?: string;
  created_at?: string;
}

interface Company {
  id: string;
  name: string;
}

export const VendorsManager: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending_approval'>('all');
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Assign Modal State
  const [assignTargetVendor, setAssignTargetVendor] = useState<Vendor | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Approving state
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const showAlert = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAlert({ message, type });
    setTimeout(() => {
      setAlert(null);
    }, 4500);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch vendors from overview
      const res = await fetch('/api/admin/overview');
      if (res.ok) {
        const data = await res.json();
        setVendors(Array.isArray(data.vendors) ? data.vendors : []);
      } else {
        showAlert('Failed to load vendors', 'error');
      }

      // 2. Fetch companies for assignment
      const compRes = await fetch('/api/admin/companies');
      if (compRes.ok) {
        const compData = await compRes.json();
        setCompanies(Array.isArray(compData) ? compData : []);
      }
    } catch (e: any) {
      showAlert(e.message || 'Error fetching vendors data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApproveKyc = async (vendorId: string) => {
    setApprovingId(vendorId);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/approve`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to approve vendor KYC');

      showAlert('Vendor KYC approved successfully!', 'success');
      // Update local state instantly
      setVendors((prev) =>
        prev.map((v) => (v.id === vendorId ? { ...v, status: 'approved' } : v))
      );
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setApprovingId(null);
    }
  };

  const handleOpenAssignModal = (vendor: Vendor) => {
    setAssignTargetVendor(vendor);
    if (companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    }
  };

  const handleCloseAssignModal = () => {
    setAssignTargetVendor(null);
    setSelectedCompanyId('');
  };

  const handleConfirmAssign = async () => {
    if (!assignTargetVendor || !selectedCompanyId) return;

    setIsAssigning(true);
    try {
      const res = await fetch(`/api/admin/companies/${selectedCompanyId}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: assignTargetVendor.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign vendor');

      const targetComp = companies.find((c) => c.id === selectedCompanyId);
      showAlert(`Supplier successfully linked to ${targetComp?.name || 'corporate buyer'}!`, 'success');
      handleCloseAssignModal();
      await loadData();
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setIsAssigning(false);
    }
  };

  // Filter vendors
  const filteredVendors = vendors.filter((v) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      (v.company_name && v.company_name.toLowerCase().includes(q)) ||
      (v.contact_person && v.contact_person.toLowerCase().includes(q)) ||
      (v.email && v.email.toLowerCase().includes(q)) ||
      (v.phone && v.phone.toLowerCase().includes(q)) ||
      (v.gstin && v.gstin.toLowerCase().includes(q)) ||
      (v.pan && v.pan.toLowerCase().includes(q)) ||
      (v.assigned_companies && v.assigned_companies.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'approved' && v.status === 'approved') ||
      (statusFilter === 'pending_approval' && v.status !== 'approved');

    return matchesQuery && matchesStatus;
  });

  const totalCount = vendors.length;
  const approvedCount = vendors.filter((v) => v.status === 'approved').length;
  const pendingCount = vendors.filter((v) => v.status !== 'approved').length;

  return (
    <div className="space-y-6">
      {/* ALERT BANNER */}
      {alert && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs transition-all ${
            alert.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : alert.type === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          <span>{alert.message}</span>
          <button type="button" onClick={() => setAlert(null)} className="text-slate-400 hover:text-slate-700 ml-4">
            ✕
          </button>
        </div>
      )}

      {/* HEADER & FILTER CONTROLS */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Master Vendor Directory & KYC</h1>
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full font-mono">
              {totalCount} Suppliers
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Verify vendor onboarding credentials, review tax compliance (GST/PAN), and authorize suppliers for corporate clients.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full sm:w-64">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by name, GSTIN, email..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer w-full sm:w-auto"
          >
            <option value="all">All Statuses ({totalCount})</option>
            <option value="pending_approval">Pending KYC ({pendingCount})</option>
            <option value="approved">Approved ({approvedCount})</option>
          </select>
        </div>
      </div>

      {/* KPI METRICS BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Directory</span>
            <span className="text-2xl font-black text-slate-900 font-mono mt-0.5 block">{totalCount}</span>
          </div>
          <span className="text-2xl p-2.5 bg-slate-50 rounded-xl border border-slate-100">👥</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Approved KYC</span>
            <span className="text-2xl font-black text-emerald-600 font-mono mt-0.5 block">{approvedCount}</span>
          </div>
          <span className="text-2xl p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">✓</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Pending Review</span>
            <span className="text-2xl font-black text-amber-600 font-mono mt-0.5 block">{pendingCount}</span>
          </div>
          <span className="text-2xl p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">⏳</span>
        </div>
      </div>

      {/* VENDORS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">Supplier Company</th>
                <th className="p-4">Contact Representative</th>
                <th className="p-4">Email & Phone</th>
                <th className="p-4">Tax Identification (GST/PAN)</th>
                <th className="p-4">Compliance Status</th>
                <th className="p-4">Assigned Corporate Buyers</th>
                <th className="p-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <div className="inline-block animate-spin text-xl mb-1">🔄</div>
                    <p className="text-xs">Loading master vendor directory...</p>
                  </td>
                </tr>
              ) : filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <span className="text-2xl block mb-1">👥</span>
                    <p className="text-sm font-semibold text-slate-700">No vendors found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {searchQuery
                        ? `No suppliers match "${searchQuery}". Clear your search.`
                        : 'No suppliers registered in this filter category.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredVendors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4">
                      <strong className="text-slate-900 font-bold block">{v.company_name}</strong>
                      <span className="text-[10px] text-slate-400 font-mono">{v.id}</span>
                    </td>

                    <td className="p-4 text-slate-700 font-medium">
                      {v.contact_person || 'Representative'}
                    </td>

                    <td className="p-4">
                      <div className="text-slate-800 font-medium font-mono">{v.email}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{v.phone || 'No phone'}</div>
                    </td>

                    <td className="p-4 font-mono text-[11px]">
                      <div>
                        GSTIN: <strong className="text-slate-700">{v.gstin || 'None Provided'}</strong>
                      </div>
                      <div>
                        PAN: <strong className="text-slate-700">{v.pan || 'N/A'}</strong>
                      </div>
                    </td>

                    <td className="p-4">
                      <span
                        className={`px-2.5 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider inline-block ${
                          v.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                        }`}
                      >
                        {v.status === 'approved' ? 'Approved' : 'Pending Review'}
                      </span>
                    </td>

                    <td className="p-4">
                      {v.assigned_companies ? (
                        <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 rounded-lg text-[11px] font-semibold inline-block">
                          {v.assigned_companies}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">Not assigned to any client</span>
                      )}
                    </td>

                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {v.status !== 'approved' ? (
                          <button
                            type="button"
                            onClick={() => handleApproveKyc(v.id)}
                            disabled={approvingId === v.id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xs text-xs transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {approvingId === v.id ? 'Approving...' : '✓ Approve KYC'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenAssignModal(v)}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-lg border border-blue-200 text-xs transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
                          >
                            + Assign to Buyer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ASSIGN SUPPLIER TO CORPORATE BUYER MODAL */}
      {assignTargetVendor && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Assign "{assignTargetVendor.company_name}"
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Authorize this supplier for a corporate client's tenders and procurement pool.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseAssignModal}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Corporate Client (Buyer)</label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full border border-slate-300 p-2.5 rounded-xl bg-slate-50 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseAssignModal}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAssign}
                disabled={isAssigning || !selectedCompanyId}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isAssigning ? 'Linking...' : 'Link Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

