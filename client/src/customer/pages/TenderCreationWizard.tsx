import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Organization, Facility, Vendor, Lot } from '../../types/procurement';
import { SearchBar } from '../../components/SearchBar';

interface CustomVendor {
  company_name: string;
  contact_person: string;
  phone: string;
  email: string;
}

export const TenderCreationWizard: React.FC = () => {
  const navigate = useNavigate();

  // Wizard Navigation
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Authenticated Corporate Buyer Profile & Master Data
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [org, setOrg] = useState<Organization | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [vendorPool, setVendorPool] = useState<Vendor[]>([]);

  // Step 1: Scope & Plant
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Packaging & Pallets');
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date(Date.now() + 48 * 3600 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [selectedFacility, setSelectedFacility] = useState('');
  const [isCustomPlant, setIsCustomPlant] = useState(false);
  const [customPlantName, setCustomPlantName] = useState('');
  const [customPlantCity, setCustomPlantCity] = useState('');
  const [customPlantState, setCustomPlantState] = useState('');
  const [customPlantAddress, setCustomPlantAddress] = useState('');
  const [saveCustomPlant, setSaveCustomPlant] = useState(true);

  // Step 2: Lots Specifications & Economics
  const [lots, setLots] = useState<Lot[]>([
    {
      product_name: 'Procurement Item 01',
      quantity: 500,
      uom: 'Nos',
      reserve_price: 1500,
      bid_decrement: 10,
    },
  ]);

  // Step 3: Supplier Pool Allocation
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [customVendors, setCustomVendors] = useState<CustomVendor[]>([]);
  const [vendorSearch, setVendorSearch] = useState<string>('');

  // Step 4: Commercial Terms & Instructions
  const [paymentTerms, setPaymentTerms] = useState('100% within 30 days post-inspection');
  const [deliveryTimeline, setDeliveryTimeline] = useState('Within 7 business days of PO dispatch');
  const [certifications, setCertifications] = useState<string[]>([
    'Manufacturer Test Certificate (MTC)',
  ]);
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Step 5: Review & Submission
  const [confirmedAuth, setConfirmedAuth] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdRequest, setCreatedRequest] = useState<{
    requestId: string;
    requestNumber: string;
  } | null>(null);

  // Load Profile and Master Data
  useEffect(() => {
    fetch('/api/customer/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (data.organization) setOrg(data.organization);
          if (data.facilities) {
            setFacilities(data.facilities);
            if (data.facilities.length > 0) {
              const first = data.facilities[0];
              setSelectedFacility(`${first.facility_name}, ${first.city} (${first.state})`);
            }
          }
          if (data.vendorPool) {
            setVendorPool(data.vendorPool);
            // Pre-select all approved suppliers by default
            setSelectedVendorIds(data.vendorPool.map((v: Vendor) => v.id));
          }
        }
        setLoadingProfile(false);
      })
      .catch(() => setLoadingProfile(false));
  }, []);

  // Calculate live budget summary
  const totalLotsCount = lots.length;
  const totalBudgetCeiling = lots.reduce(
    (acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.reserve_price) || 0),
    0
  );

  // Lots Grid Handlers
  const handleAddLot = () => {
    setLots((prev) => [
      ...prev,
      {
        product_name: `Procurement Item ${String(prev.length + 1).padStart(2, '0')}`,
        quantity: 100,
        uom: 'Nos',
        reserve_price: 1000,
        bid_decrement: 10,
      },
    ]);
  };

  const handleRemoveLot = (idx: number) => {
    setLots((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleLotChange = (idx: number, field: keyof Lot, val: any) => {
    setLots((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  // CSV Template Download
  const handleDownloadCsvTemplate = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,Product Name,Quantity,UOM,Reserve Price,Bid Decrement\n' +
      'Chemical Drums HDPE 200L,2000,Nos,1200,10\n' +
      'Industrial Solvent Grade-A,100,MT,45000,100\n';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'NexTrade_Tender_Lots_Template.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // CSV Import Parser
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length <= 1) return; // Only header

        const parsedLots: Lot[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
          if (cols.length >= 5 && cols[0]) {
            parsedLots.push({
              product_name: cols[0],
              quantity: parseFloat(cols[1]) || 100,
              uom: cols[2] || 'Nos',
              reserve_price: parseFloat(cols[3]) || 1000,
              bid_decrement: parseFloat(cols[4]) || 10,
            });
          }
        }
        if (parsedLots.length > 0) {
          setLots(parsedLots);
        }
      } catch (_) {}
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Supplier Pool Handlers
  const handleToggleSelectAllVendors = () => {
    if (selectedVendorIds.length === vendorPool.length) {
      setSelectedVendorIds([]);
    } else {
      setSelectedVendorIds(vendorPool.map((v) => v.id));
    }
  };

  const handleToggleVendor = (id: string) => {
    setSelectedVendorIds((prev) =>
      prev.includes(id) ? prev.filter((vId) => vId !== id) : [...prev, id]
    );
  };

  const handleAddCustomVendor = () => {
    setCustomVendors((prev) => [
      ...prev,
      { company_name: '', contact_person: '', phone: '', email: '' },
    ]);
  };

  const handleRemoveCustomVendor = (idx: number) => {
    setCustomVendors((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCustomVendorChange = (idx: number, field: keyof CustomVendor, val: string) => {
    setCustomVendors((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  // Certification Handlers
  const handleToggleCert = (cert: string) => {
    setCertifications((prev) =>
      prev.includes(cert) ? prev.filter((c) => c !== cert) : [...prev, cert]
    );
  };

  // Step Validation & Navigation
  const validateStep = (s: number): boolean => {
    setErrorMessage(null);
    if (s === 1) {
      if (!title.trim()) {
        setErrorMessage('Tender Title is required.');
        return false;
      }
      if (isCustomPlant) {
        if (!customPlantName.trim() || !customPlantCity.trim() || !customPlantState.trim()) {
          setErrorMessage('Please provide Plant Name, City, and State for the custom delivery site.');
          return false;
        }
      } else if (!selectedFacility) {
        setErrorMessage('Please select a Target Delivery Plant / Site.');
        return false;
      }
    } else if (s === 2) {
      if (lots.length === 0) {
        setErrorMessage('At least one procurement lot is required.');
        return false;
      }
      for (let i = 0; i < lots.length; i++) {
        if (!lots[i].product_name.trim()) {
          setErrorMessage(`Product description is required for Lot #${i + 1}.`);
          return false;
        }
        if ((lots[i].quantity || 0) <= 0) {
          setErrorMessage(`Quantity must be greater than zero for Lot #${i + 1}.`);
          return false;
        }
        if ((lots[i].reserve_price || 0) <= 0) {
          setErrorMessage(`Reserve Ceiling price must be greater than zero for Lot #${i + 1}.`);
          return false;
        }
      }
    }
    return true;
  };

  const goToNextStep = () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < 5) setCurrentStep((prev) => (prev + 1) as any);
  };

  const goToPrevStep = () => {
    setErrorMessage(null);
    if (currentStep > 1) setCurrentStep((prev) => (prev - 1) as any);
  };

  // Final Submission Handler
  const handleFinalSubmit = async () => {
    if (!confirmedAuth) {
      setErrorMessage('Please confirm authorization checkbox before submitting.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    // 1. Resolve Delivery Location
    let deliveryLocation = selectedFacility;
    if (isCustomPlant) {
      deliveryLocation = `${customPlantName.trim()}, ${customPlantCity.trim()} (${customPlantState.trim()})`;

      // Auto-save to directory if checked
      if (saveCustomPlant) {
        try {
          await fetch('/api/customer/facilities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              facility_name: customPlantName.trim(),
              city: customPlantCity.trim(),
              state: customPlantState.trim(),
              address: customPlantAddress.trim() || undefined,
            }),
          });
        } catch (_) {}
      }
    }

    // 2. Prepare Invited Vendors
    const suggestedVendors: any[] = [];
    selectedVendorIds.forEach((vId) => {
      const v = vendorPool.find((item) => item.id === vId);
      if (v) {
        suggestedVendors.push({
          vendor_id: v.id,
          company_name: v.company_name,
          contact_person: v.contact_person,
          email: v.email,
          phone: v.phone,
        });
      }
    });

    customVendors.forEach((cv) => {
      if (cv.company_name.trim()) {
        suggestedVendors.push({
          company_name: cv.company_name.trim(),
          contact_person: cv.contact_person.trim() || 'Representative',
          email: cv.email.trim(),
          phone: cv.phone.trim(),
        });
      }
    });

    // 3. Prepare Commercial Instructions
    const termsSummary = [
      paymentTerms,
      deliveryTimeline,
      certifications.length > 0 ? `Required Certifications: ${certifications.join(', ')}` : '',
      specialInstructions.trim(),
    ]
      .filter(Boolean)
      .join(' | ');

    const payload = {
      customer_org_id: org?.id,
      company_name: org?.name || 'Epack Petrochem Solutions Pvt Ltd',
      contact_person: org?.contact_person || 'Procurement Executive',
      email: org?.email || 'procurement@epack.in',
      phone: org?.phone || '9876543210',
      title: title.trim(),
      category,
      target_date: targetDate ? new Date(targetDate).toISOString() : undefined,
      duration_minutes: Number(durationMinutes) || 45,
      delivery_location: deliveryLocation,
      special_terms: termsSummary,
      lots,
      suggested_vendors: suggestedVendors,
    };

    try {
      const res = await fetch('/api/customer/tender-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit tender request.');

      setCreatedRequest({
        requestId: data.requestId,
        requestNumber: data.requestNumber,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Submission error.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepsList = [
    { num: 1, label: 'Scope & Plant' },
    { num: 2, label: 'Lot Specifications' },
    { num: 3, label: 'Supplier Pool' },
    { num: 4, label: 'Commercial Terms' },
    { num: 5, label: 'Executive Review' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fadeIn">
      {/* SUCCESS MODAL DIALOG */}
      {createdRequest && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 text-xs text-center">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl select-none">
              ✅
            </div>
            <div>
              <span className="font-mono text-xs font-bold text-blue-600 uppercase">
                {createdRequest.requestNumber}
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-1">
                Tender Request Successfully Logged
              </h2>
              <p className="text-slate-600 mt-1 text-[11px] leading-relaxed">
                Your tender specifications and {lots.length} procurement lot(s) have been securely recorded in the ingestion ledger and dispatched to NexTrade Operations Desk.
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Corporate Buyer:</span>
                <strong className="text-slate-800">{org?.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Combined Budget Ceiling:</span>
                <strong className="text-slate-900 font-mono">
                  ₹{totalBudgetCeiling.toLocaleString('en-IN')}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Invited Suppliers:</span>
                <strong className="text-blue-600">
                  {selectedVendorIds.length + customVendors.filter((v) => v.company_name).length} Vendors
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Link
                to="/customer/dashboard"
                className="w-1/2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition-colors shadow-xs"
              >
                Go to Dashboard &rarr;
              </Link>
              <button
                type="button"
                onClick={() => {
                  setCreatedRequest(null);
                  setCurrentStep(1);
                  setTitle('');
                  setLots([
                    {
                      product_name: 'Procurement Item 01',
                      quantity: 500,
                      uom: 'Nos',
                      reserve_price: 1500,
                      bid_decrement: 10,
                    },
                  ]);
                }}
                className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Create Another
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP WIZARD TITLE & PROFILE BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to="/customer/dashboard"
              className="text-slate-400 hover:text-slate-700 font-bold text-xs"
            >
              &larr; Back to Dashboard
            </Link>
            <span className="text-slate-300">•</span>
            <span className="bg-blue-50 text-blue-700 font-bold text-[10px] uppercase px-2 py-0.5 rounded-md border border-blue-200">
              Procurement Wizard
            </span>
          </div>
          <h1 className="text-base font-bold text-slate-900 mt-0.5">Plan & Request New Reverse Tender</h1>
        </div>

        {org && (
          <div className="text-right text-xs">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Authenticated Buyer</span>
            <strong className="text-slate-800">{org.name}</strong>
            <span className="text-[10px] text-slate-500 font-mono block">GSTIN: {org.gstin || 'N/A'}</span>
          </div>
        )}
      </div>

      {/* 5-STEP PROGRESS TRACKER BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center justify-between relative max-w-3xl mx-auto px-2">
          {/* Connector Line */}
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-100 z-0"></div>
          <div
            className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-blue-600 transition-all duration-300 z-0"
            style={{ width: `${((currentStep - 1) / 4) * 88}%` }}
          ></div>

          {stepsList.map((st) => {
            const isCompleted = currentStep > st.num;
            const isCurrent = currentStep === st.num;
            return (
              <div
                key={st.num}
                onClick={() => {
                  if (st.num < currentStep) setCurrentStep(st.num as any);
                }}
                className={`relative z-10 flex flex-col items-center select-none ${
                  st.num < currentStep ? 'cursor-pointer' : ''
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-xs ${
                    isCurrent
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isCompleted ? '✓' : st.num}
                </div>
                <span
                  className={`text-[10px] font-bold mt-1.5 hidden sm:block ${
                    isCurrent ? 'text-blue-700' : isCompleted ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ERROR ALERT */}
      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2 animate-fadeIn">
          <span>⚠️</span>
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      {/* MAIN STEP PANELS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs text-xs space-y-5">
        {/* ========================================================= */}
        {/* STEP 1: EVENT SCOPE & DELIVERY PLANT                     */}
        {/* ========================================================= */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Step 1: Event Scope & Delivery Destination</h2>
              <p className="text-[11px] text-slate-500">
                Define the procurement event title, category, target schedule, and destination plant.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tender Event Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bulk Chemical Solvent & Heavy HDPE Drum Sourcing"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-slate-300 p-2.5 rounded-xl font-semibold text-slate-800 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Procurement Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-slate-300 p-2.5 rounded-xl bg-white font-medium text-slate-800"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Live Start Date & Time *</label>
                <input
                  type="datetime-local"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full border border-slate-300 p-2.5 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Auction Window Duration</label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full border border-slate-300 p-2.5 rounded-xl bg-white font-medium"
                >
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes (Standard)</option>
                  <option value={60}>60 Minutes</option>
                  <option value={90}>90 Minutes</option>
                  <option value={120}>120 Minutes</option>
                </select>
              </div>
            </div>

            {/* Delivery Destination */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <label className="font-bold text-slate-700 block">Target Delivery Plant / Site *</label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  onClick={() => setIsCustomPlant(false)}
                  className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-colors ${
                    !isCustomPlant ? 'bg-blue-50/60 border-blue-300' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="plant_type"
                    checked={!isCustomPlant}
                    onChange={() => setIsCustomPlant(false)}
                    className="mt-0.5"
                  />
                  <div>
                    <strong className="block text-slate-900 font-bold">Select Registered Facility</strong>
                    <span className="text-[11px] text-slate-500">Pick from existing corporate plant directory</span>
                  </div>
                </label>

                <label
                  onClick={() => setIsCustomPlant(true)}
                  className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-colors ${
                    isCustomPlant ? 'bg-blue-50/60 border-blue-300' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="plant_type"
                    checked={isCustomPlant}
                    onChange={() => setIsCustomPlant(true)}
                    className="mt-0.5"
                  />
                  <div>
                    <strong className="block text-slate-900 font-bold">+ Specify Custom Delivery Location</strong>
                    <span className="text-[11px] text-slate-500">Enter new project site or plant address</span>
                  </div>
                </label>
              </div>

              {!isCustomPlant ? (
                <div>
                  <select
                    value={selectedFacility}
                    onChange={(e) => setSelectedFacility(e.target.value)}
                    className="w-full border border-slate-300 p-2.5 rounded-xl bg-white font-medium"
                  >
                    {facilities.map((f) => (
                      <option key={f.id} value={`${f.facility_name}, ${f.city} (${f.state})`}>
                        {f.facility_name} — {f.city}, {f.state}
                      </option>
                    ))}
                    {facilities.length === 0 && (
                      <option value="Customer Facility">Corporate Headquarters Site</option>
                    )}
                  </select>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-fadeIn">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Plant Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Dahej Petrochem Complex"
                        value={customPlantName}
                        onChange={(e) => setCustomPlantName(e.target.value)}
                        className="w-full border border-slate-300 p-2 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">City *</label>
                      <input
                        type="text"
                        placeholder="e.g. Dahej"
                        value={customPlantCity}
                        onChange={(e) => setCustomPlantCity(e.target.value)}
                        className="w-full border border-slate-300 p-2 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">State *</label>
                      <input
                        type="text"
                        placeholder="e.g. Gujarat"
                        value={customPlantState}
                        onChange={(e) => setCustomPlantState(e.target.value)}
                        className="w-full border border-slate-300 p-2 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">Full Postal / Plant Address</label>
                    <input
                      type="text"
                      placeholder="e.g. Plot 42-45, GIDC Industrial Estate"
                      value={customPlantAddress}
                      onChange={(e) => setCustomPlantAddress(e.target.value)}
                      className="w-full border border-slate-300 p-2 rounded-lg bg-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={saveCustomPlant}
                      onChange={(e) => setSaveCustomPlant(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-[11px] text-slate-700 font-semibold">
                      Save this facility to corporate plant directory for future tenders
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 2: PROCUREMENT LOTS & BUDGET ECONOMICS             */}
        {/* ========================================================= */}
        {currentStep === 2 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Step 2: Procurement Lots & Reserve Ceilings</h2>
                <p className="text-[11px] text-slate-500">
                  Define lot line items, reserve price ceilings, and minimum decrement steps.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>📥</span> CSV Template
                </button>
                <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-colors">
                  <span>📤</span> Import CSV
                  <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={handleAddLot}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                >
                  <span>+</span> Add Lot
                </button>
              </div>
            </div>

            {/* Lots Spreadsheet Grid */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Product Description / Lot *</th>
                    <th className="p-2.5">Quantity *</th>
                    <th className="p-2.5">UOM</th>
                    <th className="p-2.5 font-mono">Reserve Ceiling (₹) *</th>
                    <th className="p-2.5 font-mono">Min Decr (₹)</th>
                    <th className="p-2.5 font-mono text-right">Extended Value (₹)</th>
                    <th className="p-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {lots.map((l, idx) => {
                    const extVal = (Number(l.quantity) || 0) * (Number(l.reserve_price) || 0);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="p-2.5 font-mono text-slate-400 font-bold">{idx + 1}</td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            required
                            placeholder="e.g. Imported Coal Grade-A"
                            value={l.product_name}
                            onChange={(e) => handleLotChange(idx, 'product_name', e.target.value)}
                            className="w-full border border-slate-300 p-1.5 rounded-lg font-semibold text-slate-800"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={l.quantity}
                            onChange={(e) => handleLotChange(idx, 'quantity', Number(e.target.value))}
                            className="w-20 border border-slate-300 p-1.5 rounded-lg font-mono font-bold"
                          />
                        </td>
                        <td className="p-2.5">
                          <select
                            value={l.uom || 'Nos'}
                            onChange={(e) => handleLotChange(idx, 'uom', e.target.value)}
                            className="border border-slate-300 p-1.5 rounded-lg bg-white font-medium"
                          >
                            <option value="Nos">Nos</option>
                            <option value="MT">MT</option>
                            <option value="KG">KG</option>
                            <option value="Ltr">Ltr</option>
                            <option value="Lots">Lots</option>
                          </select>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={l.reserve_price}
                            onChange={(e) => handleLotChange(idx, 'reserve_price', Number(e.target.value))}
                            className="w-24 border border-slate-300 p-1.5 rounded-lg font-mono font-bold"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="1"
                            value={l.bid_decrement || 10}
                            onChange={(e) => handleLotChange(idx, 'bid_decrement', Number(e.target.value))}
                            className="w-16 border border-slate-300 p-1.5 rounded-lg font-mono"
                          />
                        </td>
                        <td className="p-2.5 font-mono font-black text-slate-900 text-right">
                          ₹{extVal.toLocaleString('en-IN')}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            disabled={lots.length === 1}
                            onClick={() => handleRemoveLot(idx)}
                            className="text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5 rounded hover:bg-red-50 disabled:opacity-30 cursor-pointer"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Live Budget Ceiling Stats Bar */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Procurement Scope</span>
                <strong className="text-slate-800 text-sm">{totalLotsCount} Lot(s) Defined</strong>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">
                  Combined Reserve Budget Ceiling
                </span>
                <span className="text-base font-black text-emerald-700 font-mono">
                  ₹{totalBudgetCeiling.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 3: SUPPLIER POOL ALLOCATION                         */}
        {/* ========================================================= */}
        {currentStep === 3 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Step 3: Supplier Pool Allocation</h2>
              <p className="text-[11px] text-slate-500">
                Authorize vetted vendors from your corporate pool to receive tokenized bidding invites.
              </p>
            </div>

            {/* Pre-Approved Vendors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800">
                    Pre-Approved Corporate Pool ({vendorPool.length})
                  </h3>
                  {vendorPool.length > 0 && (
                    <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
                      {selectedVendorIds.length} Selected
                    </span>
                  )}
                </div>
                {vendorPool.length > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleSelectAllVendors}
                    className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
                  >
                    {selectedVendorIds.length === vendorPool.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              {vendorPool.length > 0 && (
                <SearchBar
                  value={vendorSearch}
                  onChange={setVendorSearch}
                  placeholder="Search suppliers by company, email, contact..."
                  className="w-full"
                />
              )}

              {vendorPool.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-400">
                  No pre-approved suppliers registered. Add external suppliers below.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1">
                  {vendorPool
                    .filter((v) => {
                      if (!vendorSearch.trim()) return true;
                      const q = vendorSearch.toLowerCase().trim();
                      return (
                        (v.company_name && v.company_name.toLowerCase().includes(q)) ||
                        (v.email && v.email.toLowerCase().includes(q)) ||
                        (v.phone && v.phone.includes(q)) ||
                        (v.contact_person && v.contact_person.toLowerCase().includes(q))
                      );
                    })
                    .map((v) => {
                      const isSelected = selectedVendorIds.includes(v.id);
                      return (
                        <label
                          key={v.id}
                          className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50/70 border-blue-300' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleVendor(v.id)}
                            className="mt-0.5 rounded cursor-pointer"
                          />
                          <div className="flex-1 leading-snug">
                            <strong className="block text-slate-900 font-bold">{v.company_name}</strong>
                            <span className="text-[11px] text-slate-500 block">
                              {v.contact_person} • {v.phone}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono block">{v.email}</span>
                          </div>
                        </label>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Custom External Vendors */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800">Invite Additional External Suppliers</h3>
                  <p className="text-[11px] text-slate-400">
                    Desk will vet and dispatch tokenized magic links to these participants.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddCustomVendor}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>+</span> Add Supplier
                </button>
              </div>

              {customVendors.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-400 text-[11px]">
                  No external suppliers added. Click "+ Add Supplier" above if needed.
                </div>
              ) : (
                <div className="space-y-2">
                  {customVendors.map((cv, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2 items-center"
                    >
                      <input
                        type="text"
                        placeholder="Company Name *"
                        value={cv.company_name}
                        onChange={(e) => handleCustomVendorChange(idx, 'company_name', e.target.value)}
                        className="border border-slate-300 p-1.5 rounded-lg bg-white"
                      />
                      <input
                        type="text"
                        placeholder="Contact Person"
                        value={cv.contact_person}
                        onChange={(e) => handleCustomVendorChange(idx, 'contact_person', e.target.value)}
                        className="border border-slate-300 p-1.5 rounded-lg bg-white"
                      />
                      <input
                        type="text"
                        placeholder="Phone / WhatsApp *"
                        value={cv.phone}
                        onChange={(e) => handleCustomVendorChange(idx, 'phone', e.target.value)}
                        className="border border-slate-300 p-1.5 rounded-lg bg-white font-mono"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          placeholder="Email Address *"
                          value={cv.email}
                          onChange={(e) => handleCustomVendorChange(idx, 'email', e.target.value)}
                          className="w-full border border-slate-300 p-1.5 rounded-lg bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomVendor(idx)}
                          className="text-red-500 hover:text-red-700 font-bold p-1 rounded hover:bg-red-50 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 4: COMMERCIAL TERMS & INSTRUCTIONS                  */}
        {/* ========================================================= */}
        {currentStep === 4 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Step 4: Commercial Settlement Terms & Compliance</h2>
              <p className="text-[11px] text-slate-500">
                Specify legal settlement conditions, delivery timelines, and mandatory QC certificates.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Commercial Payment Terms *</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full border border-slate-300 p-2.5 rounded-xl bg-white font-medium"
                >
                  <option value="100% within 30 days post-inspection">100% within 30 days post-inspection</option>
                  <option value="Immediate settlement on delivery & QC clearance">Immediate settlement on delivery & QC clearance</option>
                  <option value="45 Days PDC post material delivery">45 Days PDC post material delivery</option>
                  <option value="Net 60 Days with Letter of Credit (LC)">Net 60 Days with Letter of Credit (LC)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Delivery Timeline *</label>
                <select
                  value={deliveryTimeline}
                  onChange={(e) => setDeliveryTimeline(e.target.value)}
                  className="w-full border border-slate-300 p-2.5 rounded-xl bg-white font-medium"
                >
                  <option value="Within 7 business days of PO dispatch">Within 7 business days of PO dispatch</option>
                  <option value="Within 14 business days of PO dispatch">Within 14 business days of PO dispatch</option>
                  <option value="Immediate dispatch upon auction conclusion">Immediate dispatch upon auction conclusion</option>
                  <option value="Phased monthly deliveries as per PO call-offs">Phased monthly deliveries as per PO call-offs</option>
                </select>
              </div>
            </div>

            {/* Certifications Required */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="font-bold text-slate-700 block">Required Testing & Compliance Certifications</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  'Manufacturer Test Certificate (MTC)',
                  'Certificate of Analysis (CoA)',
                  'ISO 9001 Certified Quality Standard',
                  'Pollution Control Board (PCB) Clearance',
                  'Weighment Slip at Delivery Weighbridge',
                ].map((cert) => {
                  const isChecked = certifications.includes(cert);
                  return (
                    <label
                      key={cert}
                      className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors ${
                        isChecked ? 'bg-blue-50/70 border-blue-300 text-blue-950 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleCert(cert)}
                        className="rounded"
                      />
                      <span className="text-[11px]">{cert}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Special Instructions */}
            <div className="pt-2 border-t border-slate-100">
              <label className="font-bold text-slate-700 block mb-1">
                Special Delivery Instructions & Commercial Notes
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Unloading at plant to be managed by supplier. All drivers must wear safety PPE."
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                className="w-full border border-slate-300 p-2.5 rounded-xl text-xs"
              ></textarea>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 5: EXECUTIVE REVIEW & SUBMISSION                     */}
        {/* ========================================================= */}
        {currentStep === 5 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Step 5: Executive Review & Submission</h2>
              <p className="text-[11px] text-slate-500">
                Verify procurement parameters before formal submission to NexTrade Operations Desk.
              </p>
            </div>

            {/* Overview Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Tender Event</span>
                <strong className="text-slate-900 block mt-0.5">{title}</strong>
                <span className="text-slate-500 text-[11px]">{category}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Target Schedule</span>
                <strong className="text-slate-900 block mt-0.5">
                  {new Date(targetDate).toLocaleDateString()}
                </strong>
                <span className="text-slate-500 text-[11px]">{durationMinutes} Minutes Live</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Delivery Site</span>
                <strong className="text-slate-900 block mt-0.5">
                  {isCustomPlant
                    ? `${customPlantName}, ${customPlantCity} (${customPlantState})`
                    : selectedFacility}
                </strong>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Budget Ceiling</span>
                <span className="text-base font-black text-emerald-700 font-mono block mt-0.5">
                  ₹{totalBudgetCeiling.toLocaleString('en-IN')}
                </span>
                <span className="text-slate-500 text-[11px]">{lots.length} Lots Defined</span>
              </div>
            </div>

            {/* Lots Breakdown */}
            <div className="space-y-2">
              <h3 className="font-bold text-slate-800">Procurement Lots Summary</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">Product Description</th>
                      <th className="p-2">Quantity</th>
                      <th className="p-2 font-mono">Reserve Ceiling</th>
                      <th className="p-2 font-mono">Min Decr</th>
                      <th className="p-2 font-mono text-right">Extended Budget</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {lots.map((l, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-mono text-slate-400">{idx + 1}</td>
                        <td className="p-2 font-semibold text-slate-900">{l.product_name}</td>
                        <td className="p-2">
                          {l.quantity} {l.uom}
                        </td>
                        <td className="p-2 font-mono text-slate-800">
                          ₹{Number(l.reserve_price).toLocaleString('en-IN')}
                        </td>
                        <td className="p-2 font-mono text-slate-500">₹{l.bid_decrement}</td>
                        <td className="p-2 font-mono font-bold text-slate-900 text-right">
                          ₹{((Number(l.quantity) || 0) * (Number(l.reserve_price) || 0)).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Suppliers Summary */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Invited Supplier Count</span>
              <strong className="text-slate-800 text-xs">
                {selectedVendorIds.length + customVendors.filter((v) => v.company_name).length} Suppliers Selected
              </strong>
            </div>

            {/* Authorization Checkbox */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedAuth}
                  onChange={(e) => setConfirmedAuth(e.target.checked)}
                  className="mt-0.5 rounded"
                />
                <span className="text-[11px] text-blue-950 font-semibold leading-relaxed">
                  I confirm these procurement parameters represent authorized corporate requirements for{' '}
                  <strong>{org?.name}</strong>. Upon submission, NexTrade Operations Desk will review and prepare the live bidding room.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* WIZARD CONTROLLER BUTTONS (FOOTER) */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <button
            type="button"
            disabled={currentStep === 1 || submitting}
            onClick={goToPrevStep}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors disabled:opacity-30 cursor-pointer"
          >
            &larr; Previous Step
          </button>

          {currentStep < 5 ? (
            <button
              type="button"
              onClick={goToNextStep}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Continue to {stepsList[currentStep]?.label} &rarr;
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !confirmedAuth}
              onClick={handleFinalSubmit}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-40 flex items-center gap-2 cursor-pointer"
            >
              {submitting && (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              )}
              <span>🚀 Submit Tender Request to NexTrade Desk</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

