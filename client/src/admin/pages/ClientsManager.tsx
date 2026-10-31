import React, { useEffect, useState, useMemo } from 'react';
import { SearchBar } from '../../components/SearchBar';
import { ConfirmModal } from '../../components/ConfirmModal';

interface Company {
  id: string;
  name: string;
  shortCode?: string;
  gstin?: string;
  email: string;
  phone?: string;
  created_at?: string;
}

interface Vendor {
  id: string;
  company_name: string;
  contact_person?: string;
  email: string;
  phone?: string;
  gstin?: string;
  pan?: string;
  status: string;
}

export const ClientsManager: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // New Client Form State
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formGstin, setFormGstin] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Vendor Pool Modal State
  const [poolModalCompany, setPoolModalCompany] = useState<Company | null>(null);
  const [poolVendors, setPoolVendors] = useState<Vendor[]>([]);
  const [poolSearchQuery, setPoolSearchQuery] = useState('');
  const [masterApprovedVendors, setMasterApprovedVendors] = useState<Vendor[]>([]);
  const [selectedMasterVendorId, setSelectedMasterVendorId] = useState('');
  const [isLinkingMaster, setIsLinkingMaster] = useState(false);
  const [isLoadingPool, setIsLoadingPool] = useState(false);

  // Add Custom Supplier to Pool form inside modal
  const [showAddCustomVendor, setShowAddCustomVendor] = useState(false);
  const [customVName, setCustomVName] = useState('');
  const [customVEmail, setCustomVEmail] = useState('');
  const [customVContact, setCustomVContact] = useState('');
  const [customVPhone, setCustomVPhone] = useState('');
  const [customVGstin, setCustomVGstin] = useState('');
  const [isSavingCustomVendor, setIsSavingCustomVendor] = useState(false);

  // Unlink Confirm Modal State
  const [unlinkVendorTarget, setUnlinkVendorTarget] = useState<{ companyId: string; vendorId: string; vendorName: string } | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const showAlert = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAlert({ message, type });
    setTimeout(() => {
      setAlert(null);
    }, 4500);
  };

  const loadCompanies = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      } else {
        showAlert('Failed to load corporate clients', 'error');
      }
    } catch (e: any) {
      showAlert(e.message || 'Error fetching clients', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const handleRegisterClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      showAlert('Company name and official email are required', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          shortCode: formCode.trim() || undefined,
          gstin: formGstin.trim() || undefined,
          email: formEmail.trim(),
          phone: formPhone.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register client');

      showAlert(`Corporate Buyer "${formName}" registered successfully!`, 'success');
      setFormName('');
      setFormCode('');
      setFormGstin('');
      setFormEmail('');
      setFormPhone('');
      await loadCompanies();
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Vendor Pool Modal
  const handleOpenPool = async (company: Company) => {
    setPoolModalCompany(company);
    setIsLoadingPool(true);
    setShowAddCustomVendor(false);
    setSelectedMasterVendorId('');

    try {
      // 1. Load company pool vendors
      const poolRes = await fetch(`/api/admin/companies/${company.id}/vendors`);
      const poolData = poolRes.ok ? await poolRes.json() : [];
      setPoolVendors(Array.isArray(poolData) ? poolData : []);

      // 2. Load master approved directory
      const masterRes = await fetch('/api/admin/overview');
      if (masterRes.ok) {
        const overviewData = await masterRes.json();
        const approved = (overviewData.vendors || []).filter((v: Vendor) => v.status === 'approved');
        setMasterApprovedVendors(approved);
      }
    } catch (err: any) {
      showAlert('Failed to load company vendor pool: ' + err.message, 'error');
    } finally {
      setIsLoadingPool(false);
    }
  };

  const handleClosePool = () => {
    setPoolModalCompany(null);
    setPoolVendors([]);
  };

  const handleLinkMasterVendor = async () => {
    if (!selectedMasterVendorId || !poolModalCompany) {
      showAlert('Please choose an approved master supplier to link', 'error');
      return;
    }

    setIsLinkingMaster(true);
    try {
      const res = await fetch(`/api/admin/companies/${poolModalCompany.id}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: selectedMasterVendorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to link supplier');

      showAlert('Supplier linked to buyer pool!', 'success');
      setSelectedMasterVendorId('');

      // Refresh pool
      const poolRes = await fetch(`/api/admin/companies/${poolModalCompany.id}/vendors`);
      if (poolRes.ok) setPoolVendors(await poolRes.json());
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setIsLinkingMaster(false);
    }
  };

  const handleAddCustomVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poolModalCompany) return;
    if (!customVName.trim() || !customVEmail.trim()) {
      showAlert('Supplier name and email are required', 'error');
      return;
    }

    setIsSavingCustomVendor(true);
    try {
      const res = await fetch(`/api/admin/companies/${poolModalCompany.id}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: customVName.trim(),
          email: customVEmail.trim(),
          contact_person: customVContact.trim() || 'Representative',
          phone: customVPhone.trim() || undefined,
          gstin: customVGstin.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add supplier');

      showAlert(`Supplier "${customVName}" registered and added to buyer pool!`, 'success');
      setCustomVName('');
      setCustomVEmail('');
      setCustomVContact('');
      setCustomVPhone('');
      setCustomVGstin('');
      setShowAddCustomVendor(false);

      // Refresh pool
      const poolRes = await fetch(`/api/admin/companies/${poolModalCompany.id}/vendors`);
      if (poolRes.ok) setPoolVendors(await poolRes.json());
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setIsSavingCustomVendor(false);
    }
  };

  const handleConfirmUnlink = async () => {
    if (!unlinkVendorTarget) return;
    setIsUnlinking(true);
    try {
      const res = await fetch(`/api/admin/companies/${unlinkVendorTarget.companyId}/vendors/${unlinkVendorTarget.vendorId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to unlink vendor');

      showAlert(`Supplier "${unlinkVendorTarget.vendorName}" unlinked from pool`, 'info');
      setUnlinkVendorTarget(null);

      // Refresh pool
      if (poolModalCompany) {
        const poolRes = await fetch(`/api/admin/companies/${poolModalCompany.id}/vendors`);
        if (poolRes.ok) setPoolVendors(await poolRes.json());
      }
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setIsUnlinking(false);
    }
  };

  // Filter companies by search query
  const filteredCompanies = companies.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.gstin && c.gstin.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    );
  });

  // Calculate master suppliers not yet in this pool
  const poolIds = new Set(poolVendors.map((v) => v.id));
  const availableMasterVendors = masterApprovedVendors.filter((mv) => !poolIds.has(mv.id));

  // Filter pool vendors by search query inside modal
  const displayedPoolVendors = useMemo(() => {
    if (!poolSearchQuery.trim()) return poolVendors;
    const q = poolSearchQuery.toLowerCase().trim();
    return poolVendors.filter(
      (v) =>
        (v.company_name && v.company_name.toLowerCase().includes(q)) ||
        (v.email && v.email.toLowerCase().includes(q)) ||
        (v.phone && v.phone.includes(q)) ||
        (v.gstin && v.gstin.toLowerCase().includes(q)) ||
        (v.contact_person && v.contact_person.toLowerCase().includes(q))
    );
  }, [poolVendors, poolSearchQuery]);

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

      {/* HEADER SECTION */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Corporate Client Directory</h1>
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full font-mono">
              {companies.length} Clients
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage enterprise buyer tenants, maintain authorized supplier pools, and track tax identification credentials.
          </p>
        </div>

        <div className="w-full md:w-72">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by client name, code, GSTIN..."
          />
        </div>
      </div>

      {/* TWO COLUMN GRID: ONBOARDING FORM & CLIENT DIRECTORY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN: ONBOARD NEW CLIENT FORM */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>🏢</span> Register Corporate Buyer
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Provision a new enterprise organization tenant with dedicated reverse auction workspaces.
            </p>
          </div>

          <form onSubmit={handleRegisterClient} className="space-y-3.5 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Company Official Name *</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. UltraTech Cement Ltd"
                className="w-full border border-slate-300 p-2.5 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Short Code</label>
                <input
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  placeholder="e.g. UTCL"
                  maxLength={8}
                  className="w-full border border-slate-300 p-2 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">GSTIN</label>
                <input
                  type="text"
                  value={formGstin}
                  onChange={(e) => setFormGstin(e.target.value.toUpperCase())}
                  placeholder="27AABCU9603R1ZM"
                  maxLength={15}
                  className="w-full border border-slate-300 p-2 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase text-xs"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Official Procurement Email *</label>
              <input
                type="email"
                required
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="procurement@company.com"
                className="w-full border border-slate-300 p-2.5 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Direct Phone / Hotline</label>
              <input
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full border border-slate-300 p-2.5 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Registering Tenant...</span>
              ) : (
                <>
                  <span>✓</span> Add Corporate Client
                </>
              )}
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: REGISTERED CLIENTS DIRECTORY */}
        <div className="lg:col-span-2 space-y-3">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <div className="inline-block animate-spin text-2xl mb-2">🔄</div>
              <p className="text-xs">Loading corporate client organizations...</p>
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <span className="text-3xl block mb-2">🏢</span>
              <p className="text-sm font-semibold text-slate-700">No corporate clients found</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchQuery
                  ? `No clients match "${searchQuery}". Clear your search.`
                  : 'Register your first enterprise buyer using the form on the left.'}
              </p>
            </div>
          ) : (
            filteredCompanies.map((c) => (
              <div
                key={c.id}
                className="p-5 bg-white border border-slate-200 rounded-2xl hover:shadow-sm transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <strong className="text-sm font-bold text-slate-900">{c.name}</strong>
                    <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                      {c.id}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center gap-3.5 flex-wrap">
                    <span>
                      GSTIN: <strong className="font-mono text-slate-700">{c.gstin || 'Unspecified'}</strong>
                    </span>
                    <span>
                      Email: <strong className="text-slate-700">{c.email}</strong>
                    </span>
                    <span>
                      Phone: <strong className="text-slate-700">{c.phone || 'N/A'}</strong>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenPool(c)}
                  className="bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold px-4 py-2 rounded-xl border border-slate-200 hover:border-blue-300 text-xs transition-colors flex items-center gap-1.5 self-start sm:self-center whitespace-nowrap cursor-pointer shadow-2xs"
                >
                  <span>👥</span> Manage Vendor Pool
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* VENDOR POOL MANAGEMENT MODAL */}
      {poolModalCompany && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
            {/* MODAL HEADER */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-blue-600 text-white font-mono text-[10px] px-2 py-0.5 rounded font-bold">
                    {poolModalCompany.id}
                  </span>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    {poolModalCompany.name} — Exclusive Vendor Pool
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Authorized supplier pool available when building reverse auctions or approving tenders.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClosePool}
                className="text-slate-400 hover:text-white font-bold text-lg p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* TOP LINK / ADD CONTROLS */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <span>🔗</span> Link Supplier to Buyer Pool
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomVendor(!showAddCustomVendor)}
                    className="text-blue-600 hover:text-blue-800 font-bold text-xs flex items-center gap-1"
                  >
                    {showAddCustomVendor ? '✕ Cancel Custom' : '+ Register New Supplier'}
                  </button>
                </div>

                {/* OPTION 1: LINK MASTER APPROVED SUPPLIER */}
                {!showAddCustomVendor && (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedMasterVendorId}
                      onChange={(e) => setSelectedMasterVendorId(e.target.value)}
                      className="flex-1 border border-slate-300 p-2 rounded-lg bg-white font-medium text-slate-700 text-xs"
                      disabled={availableMasterVendors.length === 0}
                    >
                      {availableMasterVendors.length === 0 ? (
                        <option value="">All master suppliers are already linked to this pool</option>
                      ) : (
                        <>
                          <option value="">Choose an approved supplier to link...</option>
                          {availableMasterVendors.map((mv) => (
                            <option key={mv.id} value={mv.id}>
                              {mv.company_name} ({mv.email})
                            </option>
                          ))}
                        </>
                      )}
                    </select>

                    <button
                      type="button"
                      onClick={handleLinkMasterVendor}
                      disabled={!selectedMasterVendorId || isLinkingMaster}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {isLinkingMaster ? 'Linking...' : '+ Link'}
                    </button>
                  </div>
                )}

                {/* OPTION 2: FORM FOR BRAND NEW SUPPLIER */}
                {showAddCustomVendor && (
                  <form onSubmit={handleAddCustomVendor} className="space-y-2.5 pt-2 border-t border-slate-200">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Company Name *</label>
                        <input
                          type="text"
                          required
                          value={customVName}
                          onChange={(e) => setCustomVName(e.target.value)}
                          placeholder="e.g. Apex Steels Ltd"
                          className="w-full border border-slate-300 p-1.5 rounded-lg bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Email Address *</label>
                        <input
                          type="email"
                          required
                          value={customVEmail}
                          onChange={(e) => setCustomVEmail(e.target.value)}
                          placeholder="sales@apex.com"
                          className="w-full border border-slate-300 p-1.5 rounded-lg bg-white text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Contact Person</label>
                        <input
                          type="text"
                          value={customVContact}
                          onChange={(e) => setCustomVContact(e.target.value)}
                          placeholder="Rajesh Kumar"
                          className="w-full border border-slate-300 p-1.5 rounded-lg bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Phone (WhatsApp)</label>
                        <input
                          type="tel"
                          value={customVPhone}
                          onChange={(e) => setCustomVPhone(e.target.value)}
                          placeholder="9876543210"
                          className="w-full border border-slate-300 p-1.5 rounded-lg bg-white text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">GSTIN</label>
                        <input
                          type="text"
                          value={customVGstin}
                          onChange={(e) => setCustomVGstin(e.target.value.toUpperCase())}
                          placeholder="07AAAAA0000A1Z5"
                          className="w-full border border-slate-300 p-1.5 rounded-lg bg-white text-xs font-mono uppercase"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSavingCustomVendor}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors cursor-pointer mt-1 disabled:opacity-50"
                    >
                      {isSavingCustomVendor ? 'Registering Supplier...' : '✓ Register & Add to Pool'}
                    </button>
                  </form>
                )}
              </div>

              {/* CURRENT POOL SUPPLIERS LIST */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-xs">
                      Linked Suppliers ({poolVendors.length})
                    </span>
                    <span className="text-[10px] text-slate-400">Pre-approved for all tenders by this client</span>
                  </div>
                  {poolVendors.length > 0 && (
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      Showing {displayedPoolVendors.length} of {poolVendors.length}
                    </span>
                  )}
                </div>

                {poolVendors.length > 0 && (
                  <SearchBar
                    value={poolSearchQuery}
                    onChange={setPoolSearchQuery}
                    placeholder="Search linked suppliers by company, email, phone, GSTIN..."
                    className="w-full"
                  />
                )}

                {isLoadingPool ? (
                  <div className="p-8 text-center text-slate-400">Loading suppliers...</div>
                ) : poolVendors.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs">No suppliers currently linked to {poolModalCompany.name}.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Use the controls above to link pre-approved suppliers.</p>
                  </div>
                ) : displayedPoolVendors.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs">No linked suppliers match "<strong>{poolSearchQuery}</strong>"</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {displayedPoolVendors.map((v) => (
                      <div
                        key={v.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <strong className="text-slate-900 text-xs font-bold">{v.company_name}</strong>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                              Approved
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {v.email} {v.phone ? `| ${v.phone}` : ''} {v.gstin ? `| GST: ${v.gstin}` : ''}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setUnlinkVendorTarget({
                              companyId: poolModalCompany.id,
                              vendorId: v.id,
                              vendorName: v.company_name,
                            })
                          }
                          className="text-red-500 hover:text-red-700 font-bold text-xs px-2.5 py-1 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
                        >
                          ✕ Unlink
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={handleClosePool}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM UNLINK MODAL */}
      <ConfirmModal
        isOpen={!!unlinkVendorTarget}
        title="Unlink Supplier from Pool"
        message={`Are you sure you want to remove "${unlinkVendorTarget?.vendorName}" from this buyer's pool? They will no longer be pre-approved for future tenders.`}
        confirmText="Unlink Supplier"
        cancelText="Cancel"
        variant="danger"
        isLoading={isUnlinking}
        onConfirm={handleConfirmUnlink}
        onCancel={() => setUnlinkVendorTarget(null)}
      />
    </div>
  );
};

