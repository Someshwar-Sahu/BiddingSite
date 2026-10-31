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
  address?: string;
  status: string;
  onboarding_type?: string;
  password_hash?: string;
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending_approval' | 'unregistered'>('all');
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Assign Modal State
  const [assignTargetVendor, setAssignTargetVendor] = useState<Vendor | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Approving state
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [copiedVendorId, setCopiedVendorId] = useState<string | null>(null);

  // Deletion modal state
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [conflictData, setConflictData] = useState<{
    bidCount: number;
    auctionCount: number;
    message: string;
  } | null>(null);

  // Invite Supplier Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteTrack, setInviteTrack] = useState<'quick' | 'full'>('quick');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCompanyName, setInviteCompanyName] = useState('');
  const [inviteContactPerson, setInviteContactPerson] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteGstin, setInviteGstin] = useState('');
  const [invitePan, setInvitePan] = useState('');
  const [inviteAddress, setInviteAddress] = useState('');
  const [inviteCompanyId, setInviteCompanyId] = useState('');
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [generatedInviteResult, setGeneratedInviteResult] = useState<{
    url: string;
    onboardingType: string;
    vendorName: string;
  } | null>(null);

  const showAlert = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAlert({ message, type });
    setTimeout(() => {
      setAlert(null);
    }, 4500);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/overview');
      if (res.ok) {
        const data = await res.json();
        setVendors(Array.isArray(data.vendors) ? data.vendors : []);
      } else {
        showAlert('Failed to load vendors', 'error');
      }

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve vendor KYC');

      showAlert(data.message || 'Vendor KYC approved successfully! Supplier is now authorized.', 'success');
      setVendors((prev) =>
        prev.map((v) => (v.id === vendorId ? { ...v, status: 'approved' } : v))
      );
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRevokeKyc = async (vendorId: string) => {
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/revoke`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke approval');
      showAlert('Supplier approval revoked. Status reset to Unregistered.', 'info');
      setVendors((prev) =>
        prev.map((v) => (v.id === vendorId ? { ...v, status: 'unregistered' } : v))
      );
    } catch (err: any) {
      showAlert(err.message, 'error');
    }
  };

  const handleCopyInviteLink = async (vendorId: string) => {
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/invite-link`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch invite link');

      await navigator.clipboard.writeText(data.inviteUrl);
      setCopiedVendorId(vendorId);
      showAlert(
        data.onboardingType === 'pin_only'
          ? '📋 PIN Setup link copied to clipboard!'
          : '📋 Full KYC Onboarding link copied to clipboard!',
        'success'
      );
      setTimeout(() => setCopiedVendorId(null), 2500);
    } catch (err: any) {
      showAlert(err.message, 'error');
    }
  };

  const handleInitiateDelete = (v: Vendor) => {
    setVendorToDelete(v);
    setConflictData(null);
  };

  const handleConfirmDelete = async (force: boolean = false, action?: 'deactivate') => {
    if (!vendorToDelete) return;
    setIsDeleting(true);
    try {
      let url = `/api/admin/vendors/${vendorToDelete.id}`;
      const params: string[] = [];
      if (force) params.push('force=true');
      if (action) params.push(`action=${action}`);
      if (params.length > 0) url += `?${params.join('&')}`;

      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();

      if (res.status === 409 && data.conflict) {
        setConflictData({
          bidCount: data.bidCount,
          auctionCount: data.auctionCount,
          message: data.error,
        });
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to delete vendor');

      showAlert(data.message, 'success');
      setVendorToDelete(null);
      setConflictData(null);
      await loadData();
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setIsDeleting(false);
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

  const handleOpenInviteModal = () => {
    setInviteTrack('quick');
    setInviteEmail('');
    setInviteCompanyName('');
    setInviteContactPerson('');
    setInvitePhone('');
    setInviteGstin('');
    setInvitePan('');
    setInviteAddress('');
    setInviteCompanyId(companies.length > 0 ? companies[0].id : '');
    setGeneratedInviteResult(null);
    setIsInviteModalOpen(true);
  };

  const handleCloseInviteModal = () => {
    setIsInviteModalOpen(false);
    setGeneratedInviteResult(null);
  };

  const handleSendInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      showAlert('Supplier email address is required.', 'error');
      return;
    }

    setIsSubmittingInvite(true);
    try {
      const payload: any = {
        email: inviteEmail.trim(),
        company_name: inviteCompanyName.trim() || undefined,
        company_id: inviteCompanyId || undefined,
      };

      if (inviteTrack === 'full') {
        payload.contact_person = inviteContactPerson.trim() || undefined;
        payload.phone = invitePhone.trim() || undefined;
        payload.gstin = inviteGstin.trim().toUpperCase() || undefined;
        payload.pan = invitePan.trim().toUpperCase() || undefined;
        payload.address = inviteAddress.trim() || undefined;
      }

      const res = await fetch('/api/admin/vendors/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create supplier invitation');

      setGeneratedInviteResult({
        url: data.inviteUrl,
        onboardingType: data.onboardingType,
        vendorName: data.vendor.company_name,
      });

      showAlert(data.message, 'success');
      await loadData();
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setIsSubmittingInvite(false);
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
      (statusFilter === 'pending_approval' && v.status === 'pending_approval') ||
      (statusFilter === 'unregistered' && v.status === 'unregistered');

    return matchesQuery && matchesStatus;
  });

  const totalCount = vendors.length;
  const approvedCount = vendors.filter((v) => v.status === 'approved').length;
  const pendingCount = vendors.filter((v) => v.status === 'pending_approval').length;
  const unregCount = vendors.filter((v) => v.status === 'unregistered').length;

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
            Invite suppliers, review incoming KYC applications, and manage permanent access links for reverse auctions.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full sm:w-60">
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
            <option value="unregistered">Unregistered ({unregCount})</option>
          </select>

          <button
            type="button"
            onClick={handleOpenInviteModal}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap w-full sm:w-auto justify-center"
          >
            <span>+</span>
            <span>Invite / Onboard Supplier</span>
          </button>
        </div>
      </div>

      {/* KPI METRICS BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Unregistered</span>
            <span className="text-2xl font-black text-slate-500 font-mono mt-0.5 block">{unregCount}</span>
          </div>
          <span className="text-2xl p-2.5 bg-slate-50 text-slate-500 rounded-xl border border-slate-100">✉️</span>
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
                <th className="p-4 text-right">Actions</th>
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
                            ? !v.gstin || !v.pan
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : v.status === 'pending_approval'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {v.status === 'approved'
                          ? !v.gstin || !v.pan
                            ? 'Approved (No KYC)'
                            : 'Approved'
                          : v.status === 'pending_approval'
                          ? 'Pending Review'
                          : 'Unregistered'}
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

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        {/* Copy Link Button */}
                        <button
                          type="button"
                          onClick={() => handleCopyInviteLink(v.id)}
                          title="Copy personalized registration or PIN setup link"
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1 border border-slate-300"
                        >
                          <span>{copiedVendorId === v.id ? '✓' : '🔗'}</span>
                          <span>{copiedVendorId === v.id ? 'Copied' : 'Link'}</span>
                        </button>

                        {/* Approve KYC Button: ONLY allowed if vendor has filled their GSTIN & PAN details */}
                        {v.status !== 'approved' && (
                          v.gstin && v.pan ? (
                            <button
                              type="button"
                              onClick={() => handleApproveKyc(v.id)}
                              disabled={approvingId === v.id}
                              title="Authorize supplier and grant bidding access"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1.5 rounded-lg shadow-2xs text-xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap flex items-center gap-1"
                            >
                              <span>✓</span>
                              <span>{approvingId === v.id ? 'Approving...' : 'Approve KYC'}</span>
                            </button>
                          ) : (
                            <span
                              title="Supplier has not submitted legal KYC profile (GSTIN & PAN) yet."
                              className="bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-semibold px-2 py-1 rounded-md whitespace-nowrap cursor-help"
                            >
                              ⏳ Awaiting KYC
                            </span>
                          )
                        )}

                        {/* Assign to Buyer (Shown when approved) */}
                        {v.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => handleOpenAssignModal(v)}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-2.5 py-1.5 rounded-lg border border-blue-200 text-xs transition-colors whitespace-nowrap cursor-pointer shadow-2xs flex items-center gap-1"
                          >
                            <span>+</span>
                            <span>Assign</span>
                          </button>
                        )}

                        {/* Revoke button if accidentally approved without KYC */}
                        {v.status === 'approved' && (!v.gstin || !v.pan) && (
                          <button
                            type="button"
                            onClick={() => handleRevokeKyc(v.id)}
                            title="Revoke approval because KYC details (GSTIN/PAN) are missing"
                            className="bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-2 py-1.5 rounded-lg border border-amber-200 text-xs transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1"
                          >
                            <span>↩</span>
                            <span>Revoke</span>
                          </button>
                        )}

                        {/* Delete Supplier Button */}
                        <button
                          type="button"
                          onClick={() => handleInitiateDelete(v)}
                          title="Delete supplier record"
                          className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold p-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center border border-red-200"
                        >
                          <span>🗑️</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INVITE / ONBOARD SUPPLIER MODAL */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">Invite & Onboard Supplier</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generate an enterprise onboarding link for full self-registration or pre-filled PIN setup.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseInviteModal}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {generatedInviteResult ? (
              <div className="space-y-4 py-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold">
                    <span>✅</span>
                    <span>Supplier Invitation Generated Successfully!</span>
                  </div>
                  <p className="text-slate-600">
                    {generatedInviteResult.onboardingType === 'pin_only'
                      ? 'Pre-verified company details saved. The supplier only needs to create their access PIN.'
                      : 'Self-registration link created. The supplier will fill their legal KYC details and await your approval.'}
                  </p>
                  <div className="pt-2">
                    <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase tracking-wider">
                      Personalized Access Link
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={generatedInviteResult.url}
                        className="w-full bg-white border border-emerald-300 p-2 rounded-lg text-xs font-mono text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedInviteResult.url);
                          showAlert('Link copied to clipboard!', 'success');
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-lg text-xs whitespace-nowrap cursor-pointer shadow-xs"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <a
                    href={generatedInviteResult.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold underline"
                  >
                    Open Link in New Tab ↗
                  </a>

                  <button
                    type="button"
                    onClick={handleCloseInviteModal}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2 rounded-xl text-xs cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInviteSubmit} className="space-y-4 text-xs">
                {/* TRACK SELECTION TABS */}
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setInviteTrack('quick')}
                    className={`py-2 px-3 rounded-lg font-bold text-center transition-all cursor-pointer ${
                      inviteTrack === 'quick'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Track A: Email-Only Invite
                    <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                      Vendor fills KYC & awaits approval
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInviteTrack('full')}
                    className={`py-2 px-3 rounded-lg font-bold text-center transition-all cursor-pointer ${
                      inviteTrack === 'full'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Track B: Pre-Filled Details
                    <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                      Vendor only sets permanent PIN
                    </span>
                  </button>
                </div>

                {/* COMMON FIELDS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Corporate Client (Optional)</label>
                    <select
                      value={inviteCompanyId}
                      onChange={(e) => setInviteCompanyId(e.target.value)}
                      className="w-full border border-slate-300 p-2 rounded-xl bg-slate-50 text-xs font-semibold text-slate-800"
                    >
                      <option value="">-- Master Platform Pool --</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Supplier Email *</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="vendor@company.com"
                      required
                      className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Company / Business Name</label>
                  <input
                    type="text"
                    value={inviteCompanyName}
                    onChange={(e) => setInviteCompanyName(e.target.value)}
                    placeholder="e.g. Apex Steels & Alloys"
                    className="w-full border border-slate-300 p-2 rounded-xl bg-white text-slate-800"
                  />
                </div>

                {/* TRACK B SPECIFIC FIELDS */}
                {inviteTrack === 'full' && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Authorized Contact Officer *</label>
                        <input
                          type="text"
                          value={inviteContactPerson}
                          onChange={(e) => setInviteContactPerson(e.target.value)}
                          placeholder="e.g. Deepak Mehta"
                          required={inviteTrack === 'full'}
                          className="w-full border border-slate-300 p-2 rounded-xl bg-white text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Phone / Mobile *</label>
                        <input
                          type="text"
                          value={invitePhone}
                          onChange={(e) => setInvitePhone(e.target.value)}
                          placeholder="e.g. 9876543210"
                          required={inviteTrack === 'full'}
                          className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">GSTIN (15 Chars) *</label>
                        <input
                          type="text"
                          value={inviteGstin}
                          onChange={(e) => setInviteGstin(e.target.value.toUpperCase())}
                          placeholder="27AAPFU0939F1ZV"
                          maxLength={15}
                          required={inviteTrack === 'full'}
                          className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono uppercase text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">PAN (10 Chars) *</label>
                        <input
                          type="text"
                          value={invitePan}
                          onChange={(e) => setInvitePan(e.target.value.toUpperCase())}
                          placeholder="AAPFU0939F"
                          maxLength={10}
                          required={inviteTrack === 'full'}
                          className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono uppercase text-slate-800"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Business Address</label>
                      <input
                        type="text"
                        value={inviteAddress}
                        onChange={(e) => setInviteAddress(e.target.value)}
                        placeholder="Plot No, Industrial Estate, City, State"
                        className="w-full border border-slate-300 p-2 rounded-xl bg-white text-slate-800"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCloseInviteModal}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingInvite}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingInvite ? 'Generating Link...' : 'Generate Invitation Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

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

      {/* DELETE / COMPLIANCE WARNING MODAL */}
      {vendorToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xl">🗑️</span>
                <h3 className="text-base font-bold text-slate-900">
                  {conflictData ? 'Compliance Notice: Historical Bids' : 'Delete Supplier'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVendorToDelete(null);
                  setConflictData(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {conflictData ? (
              <div className="space-y-4 text-xs">
                <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl space-y-2">
                  <div className="font-bold flex items-center gap-2 text-amber-800">
                    <span>⚠️</span>
                    <span>Tender Participation History Detected</span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    Supplier <strong>"{vendorToDelete.company_name}"</strong> has placed{' '}
                    <strong className="text-amber-900 font-mono font-bold">{conflictData.bidCount} bids</strong> in{' '}
                    <strong className="text-amber-900 font-mono font-bold">{conflictData.auctionCount} tender events</strong>.
                  </p>
                  <p className="text-slate-600">
                    Deleting this supplier directly will permanently remove their bids and alter historical auction certificates.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => handleConfirmDelete(false, 'deactivate')}
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>🛡️ Safe Action: Deactivate & Blacklist</span>
                  </button>
                  <p className="text-[10px] text-slate-500 text-center">
                    Revokes all logins and cancels future auction invites, keeping past audit logs intact.
                  </p>

                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleConfirmDelete(true)}
                      className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <span>🔥 Force Wipe (Delete All Bids & Records)</span>
                    </button>
                    <p className="text-[10px] text-red-500 text-center mt-1">
                      Wipes all historical test bids, invitations, and master credentials.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <p className="text-slate-600 leading-relaxed">
                  Are you sure you want to permanently delete supplier{' '}
                  <strong className="text-slate-900">{vendorToDelete.company_name}</strong>{' '}
                  (<span className="font-mono text-slate-700">{vendorToDelete.email}</span>)?
                </p>
                <p className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  This will remove their profile, unassign them from corporate buyers, cancel pending invitations, and delete their login credentials.
                </p>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setVendorToDelete(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => handleConfirmDelete(false)}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete Supplier'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
