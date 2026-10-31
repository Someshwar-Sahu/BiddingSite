import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { SearchBar } from '../../components/SearchBar';

interface Company {
  id: string;
  name: string;
}

interface LotItem {
  product_name: string;
  category: string;
  quantity: number;
  uom: string;
  start_price: number;
  reserve_price: number;
  bid_decrement: number;
}

interface AssignedVendor {
  vendor_id?: string;
  company_name: string;
  contact_person?: string;
  email: string;
  phone?: string;
  gstin?: string;
  is_pool?: boolean;
}

interface PoolVendor {
  id: string;
  company_name: string;
  contact_person?: string;
  email: string;
  phone?: string;
  status?: string;
}

export const AuctionBuilder: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const auctionIdParam = searchParams.get('id');
  const isEditing = Boolean(auctionIdParam);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Form Fields
  const [auctionId, setAuctionId] = useState('');
  const [customerOrgId, setCustomerOrgId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Packaging & Pallets');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [antiSnipingMinutes, setAntiSnipingMinutes] = useState(2);
  const [maxBufferMinutes, setMaxBufferMinutes] = useState(30);
  const [notifyVendors, setNotifyVendors] = useState(false);
  const [isAuctionLocked, setIsAuctionLocked] = useState(false);
  const [lockStatus, setLockStatus] = useState<string | null>(null);

  // Dynamic Lots
  const [lots, setLots] = useState<LotItem[]>([
    {
      product_name: 'Industrial Pallets',
      category: 'Non-PCB',
      quantity: 1000,
      uom: 'Nos',
      start_price: 1500,
      reserve_price: 1450,
      bid_decrement: 10,
    },
  ]);

  // Assigned Vendors
  const [assignedVendors, setAssignedVendors] = useState<AssignedVendor[]>([]);

  // Vendor Pool Modal State
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [companyPool, setCompanyPool] = useState<PoolVendor[]>([]);
  const [masterApprovedVendors, setMasterApprovedVendors] = useState<PoolVendor[]>([]);
  const [selectedPoolVendorIds, setSelectedPoolVendorIds] = useState<Set<string>>(new Set());
  const [poolVendorSearch, setPoolVendorSearch] = useState('');

  const showAlert = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAlert({ message, type });
    setTimeout(() => {
      setAlert(null);
    }, 4500);
  };

  const autoFetchNextId = async (orgId: string) => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/admin/next-auction-id?orgId=${encodeURIComponent(orgId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.nextId) {
          setAuctionId(data.nextId);
        }
      }
    } catch (_) {}
  };

  const loadCompanyVendorPool = async (orgId: string) => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/admin/companies/${orgId}/vendors`);
      if (res.ok) {
        const pool = await res.json();
        setCompanyPool(Array.isArray(pool) ? pool : []);
      }
    } catch (_) {
      setCompanyPool([]);
    }
  };

  // Initial Load
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch companies
        const compRes = await fetch('/api/admin/companies');
        const comps: Company[] = compRes.ok ? await compRes.json() : [];
        setCompanies(comps);

        if (isEditing && auctionIdParam) {
          // Fetch existing auction details
          const aucRes = await fetch(`/api/admin/auctions/${auctionIdParam}`);
          if (!aucRes.ok) throw new Error('Auction not found');
          const data = await aucRes.json();
          const { auction, lots: fetchedLots, assignedVendors: fetchedVendors } = data;

          setAuctionId(auction.id);
          setCustomerOrgId(auction.customer_org_id);
          setTitle(auction.title || '');
          setCategory(auction.category || 'General Enterprise Procurement');
          setDeliveryLocation(auction.delivery_location || '');
          setSpecialInstructions(auction.special_instructions || '');

          const d = new Date(auction.scheduled_start);
          const tzOffset = d.getTimezoneOffset() * 60000;
          setScheduledStart(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));

          setDurationMinutes(auction.duration_minutes || 60);
          setAntiSnipingMinutes(auction.anti_sniping_minutes || 2);
          setMaxBufferMinutes(auction.max_buffer_minutes || 30);

          if (Array.isArray(fetchedLots) && fetchedLots.length > 0) {
            setLots(
              fetchedLots.map((l: any) => ({
                product_name: l.product_name,
                category: l.category || 'Standard',
                quantity: l.quantity,
                uom: l.uom || 'MT',
                start_price: l.start_price,
                reserve_price: l.reserve_price,
                bid_decrement: l.bid_decrement,
              }))
            );
          }

          if (Array.isArray(fetchedVendors)) {
            setAssignedVendors(
              fetchedVendors.map((v: any) => ({
                vendor_id: v.vendor_id || v.id,
                company_name: v.company_name || 'Authorized Supplier',
                contact_person: v.contact_person || 'Representative',
                email: v.email || '',
                phone: v.phone || '',
                gstin: v.gstin || '',
                is_pool: true,
              }))
            );
          }

          // Check lock
          if (auction.status === 'live' || auction.status === 'extended' || auction.status === 'ended') {
            setIsAuctionLocked(true);
            setLockStatus(auction.status);
          }

          await loadCompanyVendorPool(auction.customer_org_id);
        } else {
          // CREATE MODE
          const defaultStart = new Date(Date.now() + 60 * 60 * 1000);
          const tzOffset = defaultStart.getTimezoneOffset() * 60000;
          setScheduledStart(new Date(defaultStart.getTime() - tzOffset).toISOString().slice(0, 16));

          if (comps.length > 0) {
            const firstOrg = comps[0].id;
            setCustomerOrgId(firstOrg);
            await autoFetchNextId(firstOrg);
            await loadCompanyVendorPool(firstOrg);
          }
        }
      } catch (err: any) {
        showAlert(err.message, 'error');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [isEditing, auctionIdParam]);

  // Handle client change in create mode
  const handleClientChange = async (newOrgId: string) => {
    setCustomerOrgId(newOrgId);
    if (!isEditing) {
      await autoFetchNextId(newOrgId);
    }
    await loadCompanyVendorPool(newOrgId);
  };

  // Lots Helpers
  const handleAddLot = () => {
    setLots((prev) => [
      ...prev,
      {
        product_name: '',
        category: 'Standard',
        quantity: 100,
        uom: 'MT',
        start_price: 1000,
        reserve_price: 1000,
        bid_decrement: 10,
      },
    ]);
  };

  const handleRemoveLot = (index: number) => {
    if (lots.length <= 1) {
      showAlert('An auction must have at least one procurement lot.', 'error');
      return;
    }
    setLots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateLot = (index: number, field: keyof LotItem, value: any) => {
    setLots((prev) =>
      prev.map((lot, i) => (i === index ? { ...lot, [field]: value } : lot))
    );
  };

  // Assigned Vendors Helpers
  const handleAddCustomVendor = () => {
    setAssignedVendors((prev) => [
      ...prev,
      {
        company_name: '',
        contact_person: '',
        email: '',
        phone: '',
        gstin: '',
        is_pool: false,
      },
    ]);
  };

  const handleRemoveVendor = (index: number) => {
    setAssignedVendors((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateVendor = (index: number, field: keyof AssignedVendor, value: string) => {
    setAssignedVendors((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    );
  };

  // Pool Selection Modal Helpers
  const handleOpenPoolModal = async () => {
    try {
      const res = await fetch('/api/admin/overview');
      if (res.ok) {
        const data = await res.json();
        const approved = (data.vendors || []).filter((v: any) => v.status === 'approved');
        setMasterApprovedVendors(approved);
      }
      await loadCompanyVendorPool(customerOrgId);
      setSelectedPoolVendorIds(new Set());
      setIsPoolModalOpen(true);
    } catch (_) {
      setIsPoolModalOpen(true);
    }
  };

  const handleToggleSelectVendor = (vendorId: string) => {
    setSelectedPoolVendorIds((prev) => {
      const next = new Set(prev);
      if (next.has(vendorId)) next.delete(vendorId);
      else next.add(vendorId);
      return next;
    });
  };

  const handleConfirmPoolModal = async () => {
    const existingEmails = new Set(
      assignedVendors
        .map((v) => (v.email ? v.email.toLowerCase().trim() : ''))
        .filter(Boolean)
    );
    const existingVendorIds = new Set(assignedVendors.map((v) => v.vendor_id).filter(Boolean));
    const allCandidates = [...companyPool, ...masterApprovedVendors];
    const newlyAdded: AssignedVendor[] = [];

    for (const vId of selectedPoolVendorIds) {
      const vendor = allCandidates.find((c) => c.id === vId);
      const vEmail = vendor?.email ? vendor.email.toLowerCase().trim() : '';
      const isAlreadyAdded = (vEmail && existingEmails.has(vEmail)) || (vendor && existingVendorIds.has(vendor.id));
      if (vendor && !isAlreadyAdded) {
        newlyAdded.push({
          vendor_id: vendor.id,
          company_name: vendor.company_name || 'Authorized Supplier',
          contact_person: vendor.contact_person || 'Representative',
          email: vendor.email || '',
          phone: vendor.phone || '',
          is_pool: true,
        });

        // If not in company pool, auto-link to buyer pool on backend!
        const isInCompanyPool = companyPool.some((cp) => cp.id === vId);
        if (!isInCompanyPool && customerOrgId) {
          try {
            await fetch(`/api/admin/companies/${customerOrgId}/vendors`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vendorId: vId }),
            });
          } catch (_) {}
        }
      }
    }

    setAssignedVendors((prev) => [...prev, ...newlyAdded]);
    showAlert(`${newlyAdded.length} supplier(s) added to tender!`, 'success');
    setIsPoolModalOpen(false);
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!auctionId.trim() || !title.trim() || !customerOrgId) {
      showAlert('Please fill in Auction ID, Corporate Buyer, and Tender Title.', 'error');
      return;
    }

    if (lots.length === 0) {
      showAlert('Please add at least one procurement lot.', 'error');
      return;
    }

    for (let i = 0; i < lots.length; i++) {
      const l = lots[i];
      if (l.start_price < l.reserve_price) {
        showAlert(`Lot #${i + 1}: Starting ceiling price (₹${l.start_price}) cannot be lower than reserve price (₹${l.reserve_price}).`, 'error');
        return;
      }
    }

    // Filter valid vendors
    const validVendors = assignedVendors
      .filter((v) => v.company_name.trim() || v.email.trim() || (v.phone && v.phone.trim()))
      .map((v) => ({
        vendor_id: v.vendor_id || undefined,
        company_name: v.company_name.trim(),
        contact_person: v.contact_person?.trim() || 'Representative',
        email: v.email.trim(),
        phone: v.phone?.trim() || '',
        gstin: v.gstin?.trim() || undefined,
      }));

    const payload = {
      id: auctionId.trim(),
      title: title.trim(),
      customer_org_id: customerOrgId,
      scheduled_start: scheduledStart,
      duration_minutes: durationMinutes,
      anti_sniping_minutes: antiSnipingMinutes,
      max_buffer_minutes: maxBufferMinutes,
      category,
      delivery_location: deliveryLocation.trim(),
      special_instructions: specialInstructions.trim(),
      lots,
      customerVendors: validVendors,
      notify_vendors: notifyVendors,
    };

    setIsSubmitting(true);
    const url = isEditing ? `/api/admin/auctions/${auctionId}` : '/api/admin/auctions';
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save tender');

      showAlert(`Auction ${auctionId} ${isEditing ? 'updated' : 'published'} successfully!`, 'success');
      setTimeout(() => {
        navigate('/admin/auctions');
      }, 1000);
    } catch (err: any) {
      showAlert(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const poolIds = new Set(companyPool.map((v) => v.id));
  const otherMasterVendors = masterApprovedVendors.filter((mv) => !poolIds.has(mv.id));
  const assignedEmails = new Set(
    assignedVendors
      .map((av) => (av.email ? av.email.toLowerCase().trim() : ''))
      .filter(Boolean)
  );
  const assignedVendorIds = new Set(assignedVendors.map((av) => av.vendor_id).filter(Boolean));

  const filteredCompanyPool = useMemo(() => {
    if (!poolVendorSearch.trim()) return companyPool;
    const q = poolVendorSearch.toLowerCase().trim();
    return companyPool.filter(
      (v) =>
        (v.company_name && v.company_name.toLowerCase().includes(q)) ||
        (v.email && v.email.toLowerCase().includes(q)) ||
        (v.phone && v.phone.includes(q)) ||
        (v.gstin && v.gstin.toLowerCase().includes(q))
    );
  }, [companyPool, poolVendorSearch]);

  const filteredOtherMasterVendors = useMemo(() => {
    if (!poolVendorSearch.trim()) return otherMasterVendors;
    const q = poolVendorSearch.toLowerCase().trim();
    return otherMasterVendors.filter(
      (v) =>
        (v.company_name && v.company_name.toLowerCase().includes(q)) ||
        (v.email && v.email.toLowerCase().includes(q)) ||
        (v.phone && v.phone.includes(q)) ||
        (v.gstin && v.gstin.toLowerCase().includes(q))
    );
  }, [otherMasterVendors, poolVendorSearch]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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

      {/* LIVE OR ENDED LOCK BANNER */}
      {isAuctionLocked && (
        <div className="p-4 rounded-2xl text-xs flex items-center gap-3 bg-red-50 border border-red-200 text-red-900 shadow-2xs">
          <span className="text-2xl">🔒</span>
          <div>
            <strong className="block text-sm font-bold">
              {lockStatus === 'live' || lockStatus === 'extended'
                ? 'Auction is currently LIVE'
                : 'Auction has Concluded'}{' '}
              — Specifications Locked
            </strong>
            <p className="text-[11px] text-red-700 mt-0.5">
              Procurement lots, reserve ceilings, decrements, and commercial rules cannot be modified while bidding is{' '}
              {lockStatus === 'live' || lockStatus === 'extended' ? 'active' : 'concluded'}. Bidding records are immutable.
            </p>
          </div>
        </div>
      )}

      {/* FORM CARD */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
        {/* HEADER & MODE BADGE */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {isEditing ? `Edit Reverse Auction: ${auctionId}` : 'Configure Planned Reverse Auction'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Define multi-lot procurement items, timing parameters, and assign exclusive vendor pools.
            </p>
          </div>

          <span
            className={`text-xs font-bold px-3 py-1 rounded-full self-start sm:self-center font-mono ${
              isAuctionLocked
                ? 'bg-red-100 text-red-800'
                : isEditing
                ? 'bg-amber-100 text-amber-800'
                : 'bg-blue-100 text-blue-800'
            }`}
          >
            {isAuctionLocked ? `● ${lockStatus?.toUpperCase()} (Locked)` : isEditing ? 'Editing Tender' : 'New Tender'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 text-xs">
          {/* 1. CORPORATE CLIENT & AUCTION ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Corporate Client (Buyer) *</label>
              <select
                value={customerOrgId}
                onChange={(e) => handleClientChange(e.target.value)}
                disabled={isEditing || isAuctionLocked}
                required
                className="w-full border border-slate-300 p-2.5 rounded-xl bg-slate-50 font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1 flex items-center justify-between">
                <span>Auction ID (Auto-Generated) *</span>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => autoFetchNextId(customerOrgId)}
                    className="text-blue-600 hover:text-blue-800 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <span>🔄</span> Regenerate
                  </button>
                )}
              </label>
              <input
                type="text"
                required
                value={auctionId}
                readOnly={isEditing}
                onChange={(e) => setAuctionId(e.target.value.toUpperCase())}
                disabled={isAuctionLocked}
                className="w-full border border-slate-300 p-2.5 rounded-xl font-mono font-bold text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
              />
            </div>
          </div>

          {/* 2. EVENT TITLE & CATEGORY */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="font-bold text-slate-700 block mb-1">Procurement Event Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isAuctionLocked}
                placeholder="e.g. Q4 Bulk Steam Coal & Non-PCB Pallets Tender"
                className="w-full border border-slate-300 p-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Procurement Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isAuctionLocked}
                className="w-full border border-slate-300 p-2.5 rounded-xl bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
              >
                <option value="Packaging & Pallets">Packaging & Pallets</option>
                <option value="Petrochemicals & Solvents">Petrochemicals & Solvents</option>
                <option value="Raw Materials & Minerals">Raw Materials & Minerals</option>
                <option value="Metals & Disposal Scrap">Metals & Disposal Scrap</option>
                <option value="Freight & Logistics">Freight & Logistics</option>
                <option value="General Enterprise Procurement">General Enterprise Procurement</option>
              </select>
            </div>
          </div>

          {/* 2B. DELIVERY LOCATION & COMMERCIAL TERMS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Target Delivery Facility / Plant</label>
              <input
                type="text"
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                disabled={isAuctionLocked}
                placeholder="e.g. Bhiwadi Packaging Hub, Bhiwadi (Rajasthan)"
                className="w-full border border-slate-300 p-2.5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Commercial Instructions / Payment Terms</label>
              <input
                type="text"
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                disabled={isAuctionLocked}
                placeholder="e.g. 100% within 30 days post-inspection"
                className="w-full border border-slate-300 p-2.5 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
              />
            </div>
          </div>

          {/* 3. TIMING & RULES */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Scheduled Start Time</label>
              <input
                type="datetime-local"
                required
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                disabled={isAuctionLocked}
                className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Duration (Minutes)</label>
              <input
                type="number"
                min="5"
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 60)}
                disabled={isAuctionLocked}
                className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Anti-Sniping Trigger (Min)</label>
              <input
                type="number"
                min="1"
                max="10"
                required
                value={antiSnipingMinutes}
                onChange={(e) => setAntiSnipingMinutes(parseInt(e.target.value, 10) || 2)}
                disabled={isAuctionLocked}
                className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Hard Stop Buffer (Min)</label>
              <input
                type="number"
                min="5"
                required
                value={maxBufferMinutes}
                onChange={(e) => setMaxBufferMinutes(parseInt(e.target.value, 10) || 30)}
                disabled={isAuctionLocked}
                className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
              />
            </div>
          </div>

          {/* 4. MULTI-LOT DYNAMIC BUILDER */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Procurement Lots ({lots.length})</h2>
                <p className="text-[11px] text-slate-500">Each lot runs concurrently with independent ceiling, reserve, and decrement steps.</p>
              </div>

              {!isAuctionLocked && (
                <button
                  type="button"
                  onClick={handleAddLot}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-xl border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>+</span> Add Lot
                </button>
              )}
            </div>

            <div className="space-y-3">
              {lots.map((lot, idx) => (
                <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="font-bold text-slate-800 text-xs uppercase tracking-wider font-mono">
                      Lot #{idx + 1}
                    </span>
                    {!isAuctionLocked && lots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLot(idx)}
                        className="text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
                      >
                        ✕ Remove Lot
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Product / Item Description *</label>
                      <input
                        type="text"
                        required
                        disabled={isAuctionLocked}
                        value={lot.product_name}
                        onChange={(e) => handleUpdateLot(idx, 'product_name', e.target.value)}
                        placeholder="e.g. Imported Indonesian Steam Coal (5000 GAR)"
                        className="w-full border border-slate-300 p-2 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Category</label>
                      <input
                        type="text"
                        disabled={isAuctionLocked}
                        value={lot.category}
                        onChange={(e) => handleUpdateLot(idx, 'category', e.target.value)}
                        placeholder="e.g. Raw Material"
                        className="w-full border border-slate-300 p-2 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Quantity *</label>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        required
                        disabled={isAuctionLocked}
                        value={lot.quantity}
                        onChange={(e) => handleUpdateLot(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">UOM (Unit) *</label>
                      <input
                        type="text"
                        required
                        disabled={isAuctionLocked}
                        value={lot.uom}
                        onChange={(e) => handleUpdateLot(idx, 'uom', e.target.value.toUpperCase())}
                        placeholder="MT, Nos, Litres"
                        className="w-full border border-slate-300 p-2 rounded-xl bg-white uppercase font-bold font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Ceiling Price (₹) *</label>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        required
                        disabled={isAuctionLocked}
                        value={lot.start_price}
                        onChange={(e) => handleUpdateLot(idx, 'start_price', parseFloat(e.target.value) || 0)}
                        className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Reserve Price (₹) *</label>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        required
                        disabled={isAuctionLocked}
                        value={lot.reserve_price}
                        onChange={(e) => handleUpdateLot(idx, 'reserve_price', parseFloat(e.target.value) || 0)}
                        className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">Decrement Step (₹) *</label>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        required
                        disabled={isAuctionLocked}
                        value={lot.bid_decrement}
                        onChange={(e) => handleUpdateLot(idx, 'bid_decrement', parseFloat(e.target.value) || 0)}
                        className="w-full border border-slate-300 p-2 rounded-xl bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. EXCLUSIVE ASSIGNED VENDORS */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-2">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Assign Exclusive Vendors (Private Tender)</h2>
                <p className="text-[11px] text-slate-500">Only vendors added below will be authorized to access this room and submit bids.</p>
              </div>

              {!isAuctionLocked && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenPoolModal}
                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-xl border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>🏢</span> Pick from Vendor Pool
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomVendor}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1.5 rounded-xl border border-emerald-200 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>+</span> Add Custom Vendor
                  </button>
                </div>
              )}
            </div>

            {assignedVendors.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <span className="text-2xl block mb-1">👥</span>
                <p className="text-xs">No vendors assigned yet.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Click "Pick from Vendor Pool" to authorize suppliers, or "+ Add Custom Vendor".
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {assignedVendors.map((v, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-xs">Supplier #{idx + 1}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            v.is_pool
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {v.is_pool ? 'Pre-Approved Pool' : 'New Custom Vendor'}
                        </span>
                      </div>

                      {!isAuctionLocked && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVendor(idx)}
                          className="text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          ✕ Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">Company Name *</label>
                        <input
                          type="text"
                          disabled={isAuctionLocked}
                          value={v.company_name}
                          onChange={(e) => handleUpdateVendor(idx, 'company_name', e.target.value)}
                          placeholder="e.g. Apex Steels Ltd"
                          className="w-full border border-slate-300 p-2 rounded-xl bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">Contact Person</label>
                        <input
                          type="text"
                          disabled={isAuctionLocked}
                          value={v.contact_person || ''}
                          onChange={(e) => handleUpdateVendor(idx, 'contact_person', e.target.value)}
                          placeholder="Representative"
                          className="w-full border border-slate-300 p-2 rounded-xl bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">Email Address</label>
                        <input
                          type="email"
                          disabled={isAuctionLocked}
                          value={v.email}
                          onChange={(e) => handleUpdateVendor(idx, 'email', e.target.value)}
                          placeholder="vendor@company.com"
                          className="w-full border border-slate-300 p-2 rounded-xl bg-white text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">Phone (WhatsApp)</label>
                        <input
                          type="text"
                          disabled={isAuctionLocked}
                          value={v.phone || ''}
                          onChange={(e) => handleUpdateVendor(idx, 'phone', e.target.value)}
                          placeholder="9876543210"
                          className="w-full border border-slate-300 p-2 rounded-xl bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 6. EDIT MODE NOTIFICATION TOGGLE */}
          {isEditing && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs space-y-2">
              <div className="flex items-start gap-2.5">
                <input
                  id="chk-notify-vendors"
                  type="checkbox"
                  checked={notifyVendors}
                  onChange={(e) => setNotifyVendors(e.target.checked)}
                  disabled={isAuctionLocked}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div>
                  <label htmlFor="chk-notify-vendors" className="font-bold text-amber-900 cursor-pointer">
                    Notify assigned vendors of material updates
                  </label>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Check this box if schedule timings, lots, or reserve price terms have changed so authorized vendors receive an automated update notice. Leave unchecked for minor cosmetic edits.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 7. ACTION BUTTONS */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <Link
              to="/admin/auctions"
              className="px-5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isAuctionLocked || isSubmitting}
              className={`px-8 py-2.5 rounded-xl font-bold text-sm shadow-xs transition-colors flex items-center gap-2 cursor-pointer ${
                isAuctionLocked
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isSubmitting ? (
                <span>Saving Tender...</span>
              ) : isAuctionLocked ? (
                <span>🔒 Modifications Locked</span>
              ) : (
                <>
                  <span>💾</span> {isEditing ? 'Update Reverse Auction' : 'Save & Publish Tender'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* POOL & MASTER DIRECTORY PICKER MODAL */}
      {isPoolModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">Select Vendors for Tender</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pick pre-approved suppliers or add from the master directory.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPoolModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <SearchBar
              value={poolVendorSearch}
              onChange={setPoolVendorSearch}
              placeholder="Search vendor by company name, contact, email, or GSTIN..."
              className="w-full"
            />

            <div className="space-y-4 text-xs overflow-y-auto flex-1 pr-1">
              {/* 1. Pre-Approved Buyer Pool */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <span className="font-bold text-slate-900 text-xs">
                    🏢 Pre-Approved Buyer Pool ({filteredCompanyPool.length})
                  </span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">
                    Saved Pool
                  </span>
                </div>

                {filteredCompanyPool.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 bg-slate-50 rounded-xl text-xs">
                    {poolVendorSearch.trim()
                      ? `No saved pool suppliers match "${poolVendorSearch}"`
                      : 'No suppliers pre-linked to this buyer yet. Pick from the master directory below!'}
                  </div>
                ) : (
                  filteredCompanyPool.map((cv) => {
                    const cvEmail = cv.email ? cv.email.toLowerCase().trim() : '';
                    const isAlreadyInTender = (cvEmail && assignedEmails.has(cvEmail)) || assignedVendorIds.has(cv.id);
                    const isSelected = selectedPoolVendorIds.has(cv.id);
                    return (
                      <label
                        key={cv.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                          isAlreadyInTender
                            ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isAlreadyInTender || isSelected}
                            disabled={isAlreadyInTender}
                            onChange={() => handleToggleSelectVendor(cv.id)}
                            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div>
                            <strong className="text-slate-800 text-xs block">{cv.company_name}</strong>
                            <div className="text-[11px] text-slate-500">
                              {cv.email} {cv.phone ? `| ${cv.phone}` : ''}
                            </div>
                          </div>
                        </div>

                        {isAlreadyInTender ? (
                          <span className="text-[10px] text-slate-400 font-semibold bg-slate-200 px-2 py-0.5 rounded">
                            In Tender
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded">
                            Pre-Approved
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>

              {/* 2. Master Approved Directory Suppliers */}
              {filteredOtherMasterVendors.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <span className="font-bold text-slate-900 text-xs">
                      🌐 Other Approved Directory Suppliers ({filteredOtherMasterVendors.length})
                    </span>
                    <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-bold">
                      Auto-links to Buyer Pool
                    </span>
                  </div>

                  {filteredOtherMasterVendors.map((ov) => {
                    const ovEmail = ov.email ? ov.email.toLowerCase().trim() : '';
                    const isAlreadyInTender = (ovEmail && assignedEmails.has(ovEmail)) || assignedVendorIds.has(ov.id);
                    const isSelected = selectedPoolVendorIds.has(ov.id);
                    return (
                      <label
                        key={ov.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                          isAlreadyInTender
                            ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isAlreadyInTender || isSelected}
                            disabled={isAlreadyInTender}
                            onChange={() => handleToggleSelectVendor(ov.id)}
                            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div>
                            <strong className="text-slate-800 text-xs block">{ov.company_name}</strong>
                            <div className="text-[11px] text-slate-500">
                              {ov.email} {ov.phone ? `| ${ov.phone}` : ''}
                            </div>
                          </div>
                        </div>

                        {isAlreadyInTender ? (
                          <span className="text-[10px] text-slate-400 font-semibold bg-slate-200 px-2 py-0.5 rounded">
                            In Tender
                          </span>
                        ) : (
                          <span className="text-[10px] text-blue-700 font-bold bg-blue-100 px-2 py-0.5 rounded">
                            + Link & Add
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPoolModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPoolModal}
                disabled={selectedPoolVendorIds.size === 0}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Add Selected to Tender ({selectedPoolVendorIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

