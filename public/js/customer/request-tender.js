import { showToast } from '../toast.js';
import { initNotificationWidget, disconnectNotificationWidget } from '../notifications-widget.js';

let currentStep = 1;
let currentProfile = null;
let lotCounter = 0;
let customVendorCounter = 0;

document.addEventListener('DOMContentLoaded', async () => {
  initNotificationWidget('customer-notif-container', { realm: 'customer' });
  await loadBuyerProfile();
  initSampleLots();
  initStepIndicators();
  initCsvHandlers();
  initFormListeners();
  updateProgressUI();
});

// --- 1. LOAD AUTHENTICATED BUYER PROFILE & FACILITIES ---
async function loadBuyerProfile() {
  try {
    const res = await fetch('/api/customer/profile');
    if (res.status === 401) {
      window.location.href = '/customer/login';
      return;
    }
    if (!res.ok) throw new Error('Unable to load corporate profile.');
    const data = await res.json();
    currentProfile = data;

    // Logout listener
    document.getElementById('btn-customer-logout')?.addEventListener('click', async () => {
      try {
        disconnectNotificationWidget();
        await fetch('/api/customer/logout', { method: 'POST' });
        window.location.href = '/customer/login';
      } catch (e) {
        window.location.href = '/customer/login';
      }
    });

    const org = data.organization || {};
    const facilities = data.facilities || [];
    const vendors = data.vendorPool || [];

    // Header badge
    const headerBadge = document.getElementById('top-company-badge');
    const authCompName = document.getElementById('auth-company-name');
    if (headerBadge) {
      headerBadge.innerText = `${org.name} • GSTIN: ${org.gstin || 'N/A'}`;
    }
    if (authCompName) {
      authCompName.innerText = org.name;
    }

    // Step 1 Profile Card
    const cardComp = document.getElementById('card-company-name');
    const cardGstin = document.getElementById('card-gstin');
    const cardOfficer = document.getElementById('card-officer');
    const cardContact = document.getElementById('card-contact');

    if (cardComp) cardComp.innerText = org.name;
    if (cardGstin) cardGstin.innerText = org.gstin || 'GSTIN Pending';
    if (cardOfficer) cardOfficer.innerText = org.contact_person || 'Procurement Executive';
    if (cardContact) cardContact.innerText = `${org.email} • ${org.phone || 'N/A'}`;

    // Step 1 Facility Dropdown
    const facilitySelect = document.getElementById('wizard-facility');
    if (facilitySelect && facilities.length > 0) {
      facilitySelect.innerHTML = facilities
        .map(
          (f) => `
        <option value="${f.facility_name}, ${f.city} (${f.state})">
          ${f.facility_name} — ${f.city}, ${f.state}
        </option>
      `
        )
        .join('');
      facilitySelect.innerHTML += '<option value="Other / Client Site">+ Specify Custom Plant / Delivery Site</option>';
    }

    // Step 3 Pre-approved Vendor Pool Checklist
    renderPreApprovedVendors(vendors);
  } catch (err) {
    console.warn('Profile load error:', err);
    showToast('Loaded in offline procurement mode.', 'warning');
  }
}

function renderPreApprovedVendors(vendors) {
  const container = document.getElementById('vendor-pool-checklist');
  if (!container) return;

  if (!vendors || vendors.length === 0) {
    container.innerHTML = `
      <div class="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
        No pre-registered vendors found in corporate pool. You can invite external vendors below.
      </div>
    `;
    return;
  }

  container.innerHTML = vendors
    .map(
      (v) => `
    <label class="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer transition-colors text-xs">
      <div class="flex items-center gap-3">
        <input type="checkbox" checked value="${v.id}" data-vendor-name="${v.company_name}" data-vendor-email="${v.email}" data-vendor-phone="${v.phone}" class="approved-vendor-checkbox rounded text-blue-600 focus:ring-0" />
        <div>
          <strong class="text-slate-900 block font-bold">${v.company_name}</strong>
          <span class="text-slate-500 text-[11px]">${v.contact_person || 'Rep'} • ${v.email} • ${v.phone}</span>
        </div>
      </div>
      <span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 uppercase">
        Approved ✅
      </span>
    </label>
  `
    )
    .join('');
}

// --- 2. STEPPER NAVIGATION & VALIDATION ---
window.wizardGoTo = function (targetStep) {
  if (targetStep < 1 || targetStep > 5) return;

  // Validate forward progression
  if (targetStep > currentStep) {
    const isValid = validateStep(currentStep);
    if (!isValid) return;
  }

  currentStep = targetStep;

  // Hide all panes & show target
  document.querySelectorAll('.wizard-pane').forEach((p) => p.classList.add('hidden'));
  const targetPane = document.getElementById(`step-pane-${currentStep}`);
  if (targetPane) targetPane.classList.remove('hidden');

  updateProgressUI();

  // If entering review step, populate summary card
  if (currentStep === 5) {
    populateReviewSummary();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function validateStep(step) {
  if (step === 1) {
    const title = document.getElementById('wizard-title')?.value.trim();
    if (!title) {
      showToast('Please enter a tender title to proceed.', 'error');
      document.getElementById('wizard-title')?.focus();
      return false;
    }
    return true;
  }

  if (step === 2) {
    const rows = document.querySelectorAll('#wizard-lots-tbody tr');
    if (rows.length === 0) {
      showToast('Please define at least one procurement lot item.', 'error');
      return false;
    }

    let hasEmpty = false;
    rows.forEach((row) => {
      const name = row.querySelector('[data-field="product_name"]')?.value.trim();
      const qty = parseFloat(row.querySelector('[data-field="quantity"]')?.value) || 0;
      const price = parseFloat(row.querySelector('[data-field="reserve_price"]')?.value) || 0;
      if (!name || qty <= 0 || price <= 0) {
        hasEmpty = true;
      }
    });

    if (hasEmpty) {
      showToast('Please ensure all lot names, quantities, and reserve ceilings are filled with valid values.', 'error');
      return false;
    }
    return true;
  }

  if (step === 3) {
    const checked = document.querySelectorAll('.approved-vendor-checkbox:checked').length;
    const customRows = document.querySelectorAll('#custom-vendors-container .custom-vendor-row').length;
    if (checked === 0 && customRows === 0) {
      showToast('Please allocate at least one supplier to participate in this auction.', 'warning');
    }
    return true;
  }

  return true;
}

function updateProgressUI() {
  const percent = ((currentStep - 1) / 4) * 100;
  const bar = document.getElementById('progress-bar-fill');
  if (bar) bar.style.width = `${percent}%`;

  for (let i = 1; i <= 5; i++) {
    const circle = document.getElementById(`step-circle-${i}`);
    if (!circle) continue;

    if (i < currentStep) {
      // Completed step
      circle.className = 'w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow transition-all ring-2 ring-emerald-200';
      circle.innerHTML = '✓';
    } else if (i === currentStep) {
      // Current active step
      circle.className = 'w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow transition-all ring-4 ring-blue-100';
      circle.innerText = i;
    } else {
      // Future step
      circle.className = 'w-8 h-8 rounded-full bg-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center shadow transition-all';
      circle.innerText = i;
    }
  }
}

function initStepIndicators() {
  document.querySelectorAll('.step-indicator').forEach((el) => {
    el.addEventListener('click', () => {
      const step = parseInt(el.getAttribute('data-step'), 10);
      if (step < currentStep) {
        window.wizardGoTo(step);
      }
    });
  });
}

// --- 3. DYNAMIC LOTS SPREADSHEET BUILDER ---
function initSampleLots() {
  addLotRow({
    product_name: 'Pallets Epackpetro-07',
    category: 'Packaging',
    quantity: 5000,
    uom: 'Nos',
    reserve_price: 1500,
    bid_decrement: 5,
  });

  addLotRow({
    product_name: 'Imported Coal _Epackpetro-07',
    category: 'Non-PCB',
    quantity: 500,
    uom: 'MT',
    reserve_price: 13500,
    bid_decrement: 10,
  });
}

function addLotRow(initialData = null) {
  lotCounter++;
  const id = lotCounter;
  const tbody = document.getElementById('wizard-lots-tbody');
  if (!tbody) return;

  const data = initialData || {
    product_name: '',
    category: 'General',
    quantity: 100,
    uom: 'Nos',
    reserve_price: 1000,
    bid_decrement: 10,
  };

  const row = document.createElement('tr');
  row.id = `lot-row-${id}`;
  row.className = 'hover:bg-slate-50 transition-colors';
  row.innerHTML = `
    <td class="py-3 px-3 font-bold text-slate-400 text-center">${id}</td>
    <td class="py-2 px-2">
      <input type="text" data-field="product_name" required value="${data.product_name}" placeholder="e.g. Chemical Drums HDPE 200L" class="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-medium" />
    </td>
    <td class="py-2 px-2">
      <input type="text" data-field="category" value="${data.category}" placeholder="Grade/Spec" class="w-full border border-slate-300 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500" />
    </td>
    <td class="py-2 px-2">
      <input type="number" data-field="quantity" min="1" step="any" required value="${data.quantity}" class="w-full border border-slate-300 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-center lot-calc" />
    </td>
    <td class="py-2 px-2">
      <select data-field="uom" class="w-full border border-slate-300 rounded px-1.5 py-1.5 outline-none bg-white font-medium">
        <option value="Nos" ${data.uom === 'Nos' ? 'selected' : ''}>Nos</option>
        <option value="MT" ${data.uom === 'MT' ? 'selected' : ''}>MT</option>
        <option value="Kgs" ${data.uom === 'Kgs' ? 'selected' : ''}>Kgs</option>
        <option value="Liters" ${data.uom === 'Liters' ? 'selected' : ''}>Liters</option>
        <option value="Barrels" ${data.uom === 'Barrels' ? 'selected' : ''}>Barrels</option>
        <option value="Lots" ${data.uom === 'Lots' ? 'selected' : ''}>Lots</option>
      </select>
    </td>
    <td class="py-2 px-2">
      <input type="number" data-field="reserve_price" min="1" step="any" required value="${data.reserve_price}" class="w-full border border-slate-300 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-right lot-calc" />
    </td>
    <td class="py-2 px-2">
      <input type="number" data-field="bid_decrement" min="1" step="any" required value="${data.bid_decrement}" class="w-full border border-slate-300 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-right" />
    </td>
    <td class="py-2 px-3 text-right font-mono font-bold text-slate-800" id="lot-baseline-${id}">
      ₹0
    </td>
    <td class="py-2 px-2 text-center">
      <button type="button" class="btn-remove-lot text-red-500 hover:text-red-700 font-bold p-1 text-sm" title="Remove Lot">
        ✕
      </button>
    </td>
  `;

  tbody.appendChild(row);

  row.querySelectorAll('.lot-calc').forEach((el) => {
    el.addEventListener('input', () => updateRowTotal(id));
  });

  row.querySelector('.btn-remove-lot')?.addEventListener('click', () => {
    if (tbody.querySelectorAll('tr').length <= 1) {
      showToast('A tender must contain at least one lot item.', 'warning');
      return;
    }
    row.remove();
    recalculateLotsBudget();
  });

  updateRowTotal(id);
}

function updateRowTotal(rowId) {
  const row = document.getElementById(`lot-row-${rowId}`);
  if (!row) return;

  const qty = parseFloat(row.querySelector('[data-field="quantity"]')?.value) || 0;
  const price = parseFloat(row.querySelector('[data-field="reserve_price"]')?.value) || 0;
  const total = qty * price;

  const display = document.getElementById(`lot-baseline-${rowId}`);
  if (display) {
    display.innerText = `₹${total.toLocaleString('en-IN')}`;
  }

  recalculateLotsBudget();
}

function recalculateLotsBudget() {
  let grandTotal = 0;
  let count = 0;
  const rows = document.querySelectorAll('#wizard-lots-tbody tr');

  rows.forEach((r) => {
    const qty = parseFloat(r.querySelector('[data-field="quantity"]')?.value) || 0;
    const price = parseFloat(r.querySelector('[data-field="reserve_price"]')?.value) || 0;
    grandTotal += qty * price;
    count++;
  });

  const totalEl = document.getElementById('wizard-total-budget');
  const countEl = document.getElementById('wizard-lots-count');

  if (totalEl) totalEl.innerText = `₹${grandTotal.toLocaleString('en-IN')}`;
  if (countEl) countEl.innerText = `${count} Lot(s)`;
}

// --- 4. STEP 3 CUSTOM VENDOR BUILDER ---
function addCustomVendorRow() {
  customVendorCounter++;
  const container = document.getElementById('custom-vendors-container');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'custom-vendor-row grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs items-center';
  div.innerHTML = `
    <div>
      <input type="text" data-custom="company_name" placeholder="Supplier Legal Name" required class="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium" />
    </div>
    <div>
      <input type="text" data-custom="contact_person" placeholder="Representative" class="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none" />
    </div>
    <div>
      <input type="tel" data-custom="phone" placeholder="Phone / WhatsApp" class="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none" />
    </div>
    <div class="flex items-center gap-2">
      <input type="email" data-custom="email" placeholder="Email Address" class="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none" />
      <button type="button" class="text-red-500 hover:text-red-700 font-bold px-1.5" onclick="this.closest('.custom-vendor-row').remove()">✕</button>
    </div>
  `;

  container.appendChild(div);
}

// --- 5. STEP 5 EXECUTIVE SUMMARY POPULATOR ---
function populateReviewSummary() {
  const org = currentProfile?.organization || {};
  const title = document.getElementById('wizard-title')?.value.trim();
  const category = document.getElementById('wizard-category')?.value;
  const facility = document.getElementById('wizard-facility')?.value;
  const duration = document.getElementById('wizard-duration')?.value;
  const paymentTerms = document.getElementById('wizard-payment-terms')?.value;
  const deliveryTimeline = document.getElementById('wizard-delivery-timeline')?.value;

  let facilityText = facility;
  if (facility === 'Other / Client Site') {
    const customName = document.getElementById('wizard-custom-plant-name')?.value.trim();
    const customCity = document.getElementById('wizard-custom-plant-city')?.value.trim();
    facilityText = customName ? `${customName} (${customCity || 'Custom Site'})` : 'Custom Plant / Delivery Site';
  }

  document.getElementById('rev-company').innerText = org.name || 'Epack Petrochem Solutions Pvt Ltd';
  document.getElementById('rev-facility').innerText = `Delivery Facility: ${facilityText}`;
  document.getElementById('rev-title').innerText = title || 'Untitled Procurement Event';
  document.getElementById('rev-timing').innerText = `Duration: ${duration} Mins • Category: ${category}`;

  // Populate Lots Table in Review
  const revTbody = document.getElementById('rev-lots-tbody');
  revTbody.innerHTML = '';
  let grandTotal = 0;
  let lotsCount = 0;

  document.querySelectorAll('#wizard-lots-tbody tr').forEach((r, idx) => {
    const name = r.querySelector('[data-field="product_name"]')?.value || 'Lot';
    const qty = parseFloat(r.querySelector('[data-field="quantity"]')?.value) || 0;
    const uom = r.querySelector('[data-field="uom"]')?.value || 'Nos';
    const price = parseFloat(r.querySelector('[data-field="reserve_price"]')?.value) || 0;
    const dec = parseFloat(r.querySelector('[data-field="bid_decrement"]')?.value) || 0;
    const total = qty * price;
    grandTotal += total;
    lotsCount++;

    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100';
    tr.innerHTML = `
      <td class="py-2 px-3 text-slate-500 font-mono">${idx + 1}</td>
      <td class="py-2 px-3 font-bold text-slate-900">${name}</td>
      <td class="py-2 px-3">${qty} ${uom}</td>
      <td class="py-2 px-3 text-right font-mono">₹${price.toLocaleString('en-IN')}</td>
      <td class="py-2 px-3 text-right font-mono">₹${dec}</td>
      <td class="py-2 px-3 text-right font-mono font-bold text-slate-900">₹${total.toLocaleString('en-IN')}</td>
    `;
    revTbody.appendChild(tr);
  });

  document.getElementById('rev-budget').innerText = `₹${grandTotal.toLocaleString('en-IN')}`;
  document.getElementById('rev-lots-summary').innerText = `${lotsCount} Lot Item(s) Across Scope`;

  // Assigned Suppliers
  const selectedVendors = [];
  document.querySelectorAll('.approved-vendor-checkbox:checked').forEach((cb) => {
    selectedVendors.push(cb.getAttribute('data-vendor-name'));
  });
  document.querySelectorAll('#custom-vendors-container .custom-vendor-row').forEach((row) => {
    const name = row.querySelector('[data-custom="company_name"]')?.value.trim();
    if (name) selectedVendors.push(`${name} (External)`);
  });

  const countBadge = document.getElementById('rev-suppliers-count');
  if (countBadge) countBadge.innerText = `${selectedVendors.length} Supplier(s)`;

  const suppListEl = document.getElementById('rev-suppliers-list');
  if (suppListEl) {
    if (selectedVendors.length === 0) {
      suppListEl.innerHTML = '<span class="text-slate-400 italic">No suppliers allocated.</span>';
    } else {
      suppListEl.innerHTML = selectedVendors
        .map(
          (v) => `
        <span class="bg-white border border-slate-200 text-slate-800 px-2 py-0.5 rounded text-[11px] font-medium inline-flex items-center gap-1 shadow-2xs whitespace-nowrap">
          <span>🏢</span> ${v}
        </span>
      `
        )
        .join('');
    }
  }

  // Commercial Terms
  const complianceSelected = [];
  document.querySelectorAll('.compliance-check:checked').forEach((c) => complianceSelected.push(c.value));
  document.getElementById('rev-terms-summary').innerText = `${paymentTerms} • ${deliveryTimeline} • Compliance: ${
    complianceSelected.join(', ') || 'Standard'
  }`;
}

// --- 6. FINAL SUBMISSION ---
async function handleFinalSubmission() {
  const authCheck = document.getElementById('wizard-auth-check');
  if (!authCheck || !authCheck.checked) {
    showToast('Please confirm your corporate procurement authorization to submit.', 'warning');
    authCheck?.focus();
    return;
  }

  const submitBtn = document.getElementById('btn-submit-wizard');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Submitting Request to Desk...';
  }

  // Collect Lots
  const lots = [];
  document.querySelectorAll('#wizard-lots-tbody tr').forEach((r) => {
    lots.push({
      product_name: r.querySelector('[data-field="product_name"]')?.value.trim(),
      category: r.querySelector('[data-field="category"]')?.value.trim() || 'General',
      quantity: parseFloat(r.querySelector('[data-field="quantity"]')?.value) || 1,
      uom: r.querySelector('[data-field="uom"]')?.value || 'Nos',
      reserve_price: parseFloat(r.querySelector('[data-field="reserve_price"]')?.value) || 1000,
      bid_decrement: parseFloat(r.querySelector('[data-field="bid_decrement"]')?.value) || 10,
    });
  });

  // Collect Suppliers
  const vendors = [];
  document.querySelectorAll('.approved-vendor-checkbox:checked').forEach((cb) => {
    vendors.push({
      vendor_id: cb.value,
      company_name: cb.getAttribute('data-vendor-name'),
      email: cb.getAttribute('data-vendor-email'),
      phone: cb.getAttribute('data-vendor-phone'),
    });
  });

  document.querySelectorAll('#custom-vendors-container .custom-vendor-row').forEach((row) => {
    const comp = row.querySelector('[data-custom="company_name"]')?.value.trim();
    if (comp) {
      vendors.push({
        company_name: comp,
        contact_person: row.querySelector('[data-custom="contact_person"]')?.value.trim() || 'Representative',
        phone: row.querySelector('[data-custom="phone"]')?.value.trim() || 'N/A',
        email: row.querySelector('[data-custom="email"]')?.value.trim() || 'N/A',
      });
    }
  });

  const org = currentProfile?.organization || {};

  let deliveryLocation = document.getElementById('wizard-facility')?.value || 'Plant Facility';
  if (deliveryLocation === 'Other / Client Site') {
    const customName = document.getElementById('wizard-custom-plant-name')?.value.trim();
    const customCity = document.getElementById('wizard-custom-plant-city')?.value.trim();
    const customState = document.getElementById('wizard-custom-plant-state')?.value.trim();
    const customAddr = document.getElementById('wizard-custom-plant-address')?.value.trim();

    if (!customName || !customCity || !customState) {
      showToast('Please specify the custom plant name, city, and state in Step 1.', 'warning');
      window.wizardGoTo(1);
      document.getElementById('wizard-custom-plant-name')?.focus();
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🚀</span> Submit Tender Request to NexTrade Desk';
      }
      return;
    }

    deliveryLocation = `${customName}, ${customCity} (${customState})`;

    // If auto-save to directory is checked, save to DB
    if (document.getElementById('wizard-custom-plant-save')?.checked) {
      try {
        await fetch('/api/customer/facilities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facility_name: customName,
            city: customCity,
            state: customState,
            address: customAddr,
          }),
        });
      } catch (facErr) {
        console.warn('Facility auto-save notice:', facErr);
      }
    }
  }

  const payload = {
    customer_org_id: org.id || 'org_epack',
    company_name: org.name || 'Epack Petrochem Solutions Pvt Ltd',
    gstin: org.gstin || '03AAPCP3056IZE',
    contact_person: org.contact_person || 'Saurabh Verma (Procurement Head)',
    email: org.email || 'procurement@epack.in',
    phone: org.phone || '9876543210',
    delivery_location: deliveryLocation,
    title: document.getElementById('wizard-title')?.value.trim(),
    category: document.getElementById('wizard-category')?.value,
    target_date: document.getElementById('wizard-target-date')?.value || null,
    duration_minutes: parseInt(document.getElementById('wizard-duration')?.value, 10) || 45,
    special_terms: `${document.getElementById('wizard-payment-terms')?.value} | ${document.getElementById('wizard-delivery-timeline')?.value} | ${document.getElementById('wizard-special-notes')?.value.trim()}`,
    lots,
    suggested_vendors: vendors,
  };

  try {
    const res = await fetch('/api/customer/tender-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit tender request.');

    // Success Modal
    document.getElementById('modal-req-number').innerText = data.requestNumber;
    document.getElementById('modal-company').innerText = payload.company_name;
    document.getElementById('modal-lots-count').innerText = `${lots.length} Lot(s)`;
    document.getElementById('success-modal')?.classList.remove('hidden');

    showToast('Tender request submitted to NexTrade Desk!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>🚀</span> Submit Tender Request to NexTrade Desk';
    }
  }
}

// --- 7. CSV TEMPLATE & LISTENERS ---
function initCsvHandlers() {
  document.getElementById('btn-download-sample-csv')?.addEventListener('click', () => {
    const csvContent =
      'data:text/csv;charset=utf-8,Product Name,Category,Quantity,UOM,Reserve Price,Bid Decrement\n' +
      'Chemical Drums HDPE 200L,Packaging,2000,Nos,1200,10\n' +
      'Industrial Solvent Grade-A,Chemicals,100,MT,45000,100\n';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'NexTrade_Tender_Lots_Template.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
}

function initFormListeners() {
  document.getElementById('btn-add-lot-wizard')?.addEventListener('click', () => addLotRow());
  document.getElementById('btn-add-custom-vendor-row')?.addEventListener('click', () => addCustomVendorRow());
  document.getElementById('btn-submit-wizard')?.addEventListener('click', handleFinalSubmission);

  document.getElementById('wizard-facility')?.addEventListener('change', (e) => {
    const customContainer = document.getElementById('wizard-custom-plant-container');
    if (e.target.value === 'Other / Client Site') {
      customContainer?.classList.remove('hidden');
    } else {
      customContainer?.classList.add('hidden');
    }
  });

  document.getElementById('btn-select-all-vendors')?.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.approved-vendor-checkbox');
    const allChecked = Array.from(checkboxes).every((c) => c.checked);
    checkboxes.forEach((c) => (c.checked = !allChecked));
  });

  document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    window.location.reload();
  });
}
