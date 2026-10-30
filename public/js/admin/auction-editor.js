import { renderAdminNav } from './nav.js';
import { showToast } from '../toast.js';

let lots = [];
let assignedVendors = []; // { vendor_id, company_name, contact_person, email, phone, gstin, is_pool }
let companyVendorPool = [];
let isEditing = false;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

document.addEventListener('DOMContentLoaded', async () => {
  renderAdminNav('editor');

  const urlParams = new URLSearchParams(window.location.search);
  const auctionId = urlParams.get('id');

  await loadCompaniesDropdown();

  if (auctionId) {
    isEditing = true;
    await enterEditMode(auctionId);
  } else {
    enterCreateMode();
  }

  // Event Listeners
  document.getElementById('input-client')?.addEventListener('change', async (e) => {
    if (!isEditing) {
      await autoFetchNextId(e.target.value);
    }
    await loadCompanyVendorPool(e.target.value);
  });

  document.getElementById('btn-regen-id')?.addEventListener('click', () => {
    const orgId = document.getElementById('input-client')?.value;
    autoFetchNextId(orgId);
  });

  document.getElementById('btn-add-lot')?.addEventListener('click', () => {
    lots.push({
      product_name: '',
      category: 'Standard',
      quantity: 100,
      uom: 'MT',
      start_price: 1000,
      reserve_price: 1000,
      bid_decrement: 10,
    });
    renderLots();
  });

  document.getElementById('btn-add-custom-vendor')?.addEventListener('click', () => {
    assignedVendors.push({
      company_name: '',
      contact_person: '',
      email: '',
      phone: '',
      gstin: '',
      is_pool: false,
    });
    renderAssignedVendors();
  });

  // Client Pool Modal Listeners
  document.getElementById('btn-pool-modal')?.addEventListener('click', openPoolModal);
  document.getElementById('close-pool-modal')?.addEventListener('click', closePoolModal);
  document.getElementById('cancel-pool-modal')?.addEventListener('click', closePoolModal);
  document.getElementById('confirm-pool-modal')?.addEventListener('click', confirmPoolSelection);

  // Form Submission
  document.getElementById('auction-form')?.addEventListener('submit', handleFormSubmit);
});

// --- LOAD CLIENTS DROPDOWN ---
async function loadCompaniesDropdown() {
  const select = document.getElementById('input-client');
  try {
    const res = await fetch('/api/admin/companies');
    const companies = await res.json();

    select.innerHTML = companies
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join('');

    if (companies.length > 0 && !isEditing) {
      await autoFetchNextId(companies[0].id);
      await loadCompanyVendorPool(companies[0].id);
    }
  } catch (err) {
    showToast('Failed to load companies: ' + err.message, 'error');
  }
}

// --- AUTO FETCH NEXT SEQUENTIAL ID ---
async function autoFetchNextId(orgId) {
  if (!orgId) return;
  try {
    const res = await fetch(`/api/admin/next-auction-id?orgId=${encodeURIComponent(orgId)}`);
    const data = await res.json();
    if (data.nextId) {
      document.getElementById('input-auction-id').value = data.nextId;
    }
  } catch (err) {}
}

// --- LOAD COMPANY SPECIFIC VENDOR POOL ---
async function loadCompanyVendorPool(companyId) {
  if (!companyId) return;
  try {
    const res = await fetch(`/api/admin/companies/${companyId}/vendors`);
    companyVendorPool = await res.json();
  } catch (err) {
    companyVendorPool = [];
  }
}

// --- CREATE MODE INIT ---
function enterCreateMode() {
  document.getElementById('editor-heading').innerText = 'Create Planned Reverse Auction';
  document.getElementById('editor-badge').innerText = 'New Tender';
  document.getElementById('editor-badge').className = 'bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full';
  document.getElementById('edit-auction-id').value = '';
  document.getElementById('input-auction-id').readOnly = false;
  document.getElementById('notification-toggle-box').classList.add('hidden');

  // Set default start time to 1 hour from now
  const defaultStart = new Date(Date.now() + 60 * 60 * 1000);
  const tzOffset = defaultStart.getTimezoneOffset() * 60000;
  document.getElementById('input-start-time').value = new Date(defaultStart.getTime() - tzOffset).toISOString().slice(0, 16);

  // Default initial lot
  lots = [
    {
      product_name: 'Industrial Pallets',
      category: 'Non-PCB',
      quantity: 1000,
      uom: 'Nos',
      start_price: 1500,
      reserve_price: 1450,
      bid_decrement: 10,
    },
  ];
  renderLots();

  assignedVendors = [];
  renderAssignedVendors();
}

// --- EDIT MODE INIT ---
async function enterEditMode(auctionId) {
  try {
    const res = await fetch(`/api/admin/auctions/${auctionId}`);
    if (!res.ok) throw new Error('Auction not found');
    const data = await res.json();

    const { auction, lots: fetchedLots, assignedVendors: fetchedVendors } = data;

    document.getElementById('editor-heading').innerText = `Edit Auction: ${auction.id}`;
    document.getElementById('editor-badge').innerText = 'Editing Tender';
    document.getElementById('editor-badge').className = 'bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full';
    document.getElementById('edit-auction-id').value = auction.id;

    document.getElementById('input-auction-id').value = auction.id;
    document.getElementById('input-auction-id').readOnly = true;
    document.getElementById('btn-regen-id')?.classList.add('hidden');

    document.getElementById('input-client').value = auction.customer_org_id;
    document.getElementById('input-client').disabled = true; // Cannot switch buyer on existing tender
    document.getElementById('input-title').value = auction.title;

    // Populate Category, Delivery Location, and Commercial Instructions
    const catSelect = document.getElementById('input-category');
    if (catSelect) {
      const catVal = auction.category || 'General Enterprise Procurement';
      const exists = Array.from(catSelect.options).some((o) => o.value.toLowerCase() === catVal.toLowerCase());
      if (!exists && catVal) {
        const opt = document.createElement('option');
        opt.value = catVal;
        opt.textContent = catVal;
        catSelect.appendChild(opt);
      }
      catSelect.value = catVal;
    }

    if (document.getElementById('input-delivery-location')) {
      document.getElementById('input-delivery-location').value = auction.delivery_location || '';
    }

    if (document.getElementById('input-special-instructions')) {
      document.getElementById('input-special-instructions').value = auction.special_instructions || '';
    }

    // Convert start time
    const d = new Date(auction.scheduled_start);
    const tzOffset = d.getTimezoneOffset() * 60000;
    document.getElementById('input-start-time').value = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);

    document.getElementById('input-duration').value = auction.duration_minutes;
    document.getElementById('input-anti-sniping').value = auction.anti_sniping_minutes;
    document.getElementById('input-max-buffer').value = auction.max_buffer_minutes;

    // Show Material Update Notification Checkbox
    document.getElementById('notification-toggle-box').classList.remove('hidden');

    // Populate lots
    lots = fetchedLots.map((l) => ({
      product_name: l.product_name,
      category: l.category || 'Standard',
      quantity: l.quantity,
      uom: l.uom || 'MT',
      start_price: l.start_price,
      reserve_price: l.reserve_price,
      bid_decrement: l.bid_decrement,
    }));
    renderLots();

    // Populate assigned vendors preserving details
    assignedVendors = fetchedVendors.map((v) => ({
      vendor_id: v.vendor_id,
      company_name: v.company_name,
      contact_person: v.contact_person || 'Representative',
      email: v.email,
      phone: v.phone || '',
      gstin: v.gstin || '',
      is_pool: true,
    }));
    renderAssignedVendors();

    await loadCompanyVendorPool(auction.customer_org_id);

    // If auction is LIVE or ENDED, enforce strict lockout
    if (auction.status === 'live' || auction.status === 'extended' || auction.status === 'ended') {
      const isLive = auction.status === 'live' || auction.status === 'extended';
      document.getElementById('editor-badge').innerText = isLive ? '● Live Bidding (Locked)' : 'Ended (Locked)';
      document.getElementById('editor-badge').className = isLive
        ? 'bg-red-100 text-red-800 text-xs font-bold px-3 py-1 rounded-full'
        : 'bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1 rounded-full';

      const banner = document.createElement('div');
      banner.id = 'live-locked-banner';
      banner.className = 'p-4 rounded-xl text-xs flex items-center gap-3 bg-red-50 border border-red-200 text-red-900 mb-4';
      banner.innerHTML = `
        <span class="text-2xl">🔒</span>
        <div>
          <strong class="block text-sm font-bold">${isLive ? 'Auction is currently LIVE' : 'Auction has Concluded'} — Modifications Locked</strong>
          <p class="text-[11px] text-red-700 mt-0.5">Procurement lots, reserve ceilings, decrements, and commercial rules cannot be modified while bidding is ${isLive ? 'active' : 'concluded'}. Bidding records are immutable.</p>
        </div>
      `;
      document.querySelector('main > div')?.prepend(banner);

      document.querySelectorAll('#auction-form input, #auction-form select').forEach((el) => {
        el.disabled = true;
      });
      document.getElementById('btn-add-lot')?.classList.add('hidden');
      document.getElementById('btn-add-custom-vendor')?.classList.add('hidden');
      document.getElementById('btn-pool-modal')?.classList.add('hidden');
      const submitBtn = document.querySelector('#auction-form button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.className = 'w-full py-3 bg-slate-300 text-slate-600 font-bold rounded-xl cursor-not-allowed text-xs';
        submitBtn.innerText = '🔒 Modifications Locked on Live/Ended Auction';
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- DYNAMIC LOTS RENDERER ---
function renderLots() {
  const container = document.getElementById('lots-container');
  if (!container) return;

  if (lots.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 bg-slate-50 rounded-lg">
        No lots added. Click "+ Add Lot" to add items to this procurement tender.
      </div>
    `;
    return;
  }

  container.innerHTML = lots
    .map(
      (lot, idx) => `
    <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
      <div class="flex items-center justify-between pb-2 border-b border-slate-200">
        <span class="font-bold text-slate-800 text-xs uppercase tracking-wider">Lot #${idx + 1}</span>
        ${
          lots.length > 1
            ? `<button type="button" onclick="window.removeLot(${idx})" class="text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1">✕ Remove Lot</button>`
            : '<span class="text-[10px] text-slate-400">Primary Lot</span>'
        }
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="sm:col-span-2">
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">Product / Item Description</label>
          <input type="text" required placeholder="e.g. Imported Indonesian Steam Coal (5000 GAR)" value="${escapeHtml(lot.product_name || '')}" oninput="window.updateLotField(${idx}, 'product_name', this.value)" class="w-full border border-slate-300 p-2 rounded-lg bg-white" />
        </div>
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">Category</label>
          <input type="text" placeholder="e.g. Raw Material" value="${escapeHtml(lot.category || 'Standard')}" oninput="window.updateLotField(${idx}, 'category', this.value)" class="w-full border border-slate-300 p-2 rounded-lg bg-white" />
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">Quantity</label>
          <input type="number" step="any" required min="0.01" value="${lot.quantity || ''}" oninput="window.updateLotField(${idx}, 'quantity', parseFloat(this.value))" class="w-full border border-slate-300 p-2 rounded-lg bg-white" />
        </div>
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">UOM (Unit)</label>
          <input type="text" required placeholder="MT, Nos, Litres" value="${escapeHtml(lot.uom || 'MT')}" oninput="window.updateLotField(${idx}, 'uom', this.value)" class="w-full border border-slate-300 p-2 rounded-lg bg-white uppercase font-bold" />
        </div>
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">Ceiling Price (₹)</label>
          <input type="number" step="any" required min="1" value="${lot.start_price || ''}" oninput="window.updateLotField(${idx}, 'start_price', parseFloat(this.value))" class="w-full border border-slate-300 p-2 rounded-lg bg-white font-mono" />
        </div>
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">Reserve Price (₹)</label>
          <input type="number" step="any" required min="1" value="${lot.reserve_price || ''}" oninput="window.updateLotField(${idx}, 'reserve_price', parseFloat(this.value))" class="w-full border border-slate-300 p-2 rounded-lg bg-white font-mono" />
        </div>
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">Decrement Step (₹)</label>
          <input type="number" step="any" required min="1" value="${lot.bid_decrement || 10}" oninput="window.updateLotField(${idx}, 'bid_decrement', parseFloat(this.value))" class="w-full border border-slate-300 p-2 rounded-lg bg-white font-mono" />
        </div>
      </div>
    </div>
  `
    )
    .join('');
}

window.updateLotField = function (index, field, value) {
  if (lots[index]) lots[index][field] = value;
};

window.removeLot = function (index) {
  if (lots.length <= 1) {
    showToast('An auction must have at least one lot.', 'warning');
    return;
  }
  lots.splice(index, 1);
  renderLots();
};

// --- ASSIGNED VENDORS RENDERER ---
function renderAssignedVendors() {
  const container = document.getElementById('vendors-container');
  if (!container) return;

  if (assignedVendors.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 bg-slate-50 rounded-lg">
        No vendors assigned yet. Click "Pick from Vendor Pool / Directory" to select suppliers, or "+ Add Custom Vendor".
      </div>
    `;
    return;
  }

  container.innerHTML = assignedVendors
    .map(
      (v, idx) => `
    <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5" data-vendor-index="${idx}">
      <div class="flex items-center justify-between pb-1 border-b border-slate-200">
        <div class="flex items-center gap-2">
          <span class="font-bold text-slate-800 text-xs">Supplier #${idx + 1}</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded ${
            v.is_pool ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
          }">
            ${v.is_pool ? 'Pre-Approved Pool' : 'New Custom Vendor (Will auto-save to directory)'}
          </span>
        </div>
        <button type="button" onclick="window.removeVendor(${idx})" class="text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1">
          ✕ Remove
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
        <div>
          <label class="text-[10px] text-slate-500 block mb-0.5">Company Name *</label>
          <input type="text" placeholder="e.g. Apex Steels Ltd" value="${escapeHtml(v.company_name || '')}" oninput="window.updateVendorField(${idx}, 'company_name', this.value)" class="w-full border border-slate-300 p-1.5 rounded-lg bg-white text-xs font-semibold text-slate-800" />
        </div>

        <div>
          <label class="text-[10px] text-slate-500 block mb-0.5">Contact Person</label>
          <input type="text" placeholder="Representative" value="${escapeHtml(v.contact_person || '')}" oninput="window.updateVendorField(${idx}, 'contact_person', this.value)" class="w-full border border-slate-300 p-1.5 rounded-lg bg-white text-xs text-slate-700" />
        </div>

        <div>
          <label class="text-[10px] text-slate-500 block mb-0.5">Email Address</label>
          <input type="email" placeholder="vendor@company.com" value="${escapeHtml(v.email || '')}" oninput="window.updateVendorField(${idx}, 'email', this.value)" class="w-full border border-slate-300 p-1.5 rounded-lg bg-white text-xs text-slate-800 font-mono" />
        </div>

        <div>
          <label class="text-[10px] text-slate-500 block mb-0.5">Phone (WhatsApp)</label>
          <input type="text" placeholder="9876543210" value="${escapeHtml(v.phone || '')}" oninput="window.updateVendorField(${idx}, 'phone', this.value)" class="w-full border border-slate-300 p-1.5 rounded-lg bg-white text-xs font-mono" />
        </div>
      </div>
    </div>
  `
    )
    .join('');
}

window.updateVendorField = function (index, field, value) {
  if (assignedVendors[index]) {
    assignedVendors[index][field] = value;
  }
};

window.removeVendor = function (index) {
  assignedVendors.splice(index, 1);
  renderAssignedVendors();
};

// --- POOL & MASTER VENDOR MODAL CONTROLS ---
async function openPoolModal() {
  const modal = document.getElementById('pool-modal');
  const checklist = document.getElementById('pool-vendors-checklist');
  const clientSelect = document.getElementById('input-client');
  const orgId = clientSelect.value;
  const orgName = clientSelect.options[clientSelect.selectedIndex]?.text || 'Selected Buyer';

  document.getElementById('pool-modal-subtitle').innerText = `Select approved suppliers for ${orgName}`;

  // Fetch company pool AND master directory
  let masterVendors = [];
  try {
    const res = await fetch('/api/admin/overview');
    const data = await res.json();
    masterVendors = (data.vendors || []).filter((v) => v.status === 'approved');
  } catch (e) {}

  await loadCompanyVendorPool(orgId);

  const poolIds = new Set(companyVendorPool.map((v) => v.id));
  const otherVendors = masterVendors.filter((v) => !poolIds.has(v.id));

  let html = '';

  // 1. Company Pre-Approved Pool Section
  html += `
    <div class="space-y-2">
      <div class="flex items-center justify-between pb-1.5 border-b border-slate-200">
        <span class="font-bold text-slate-900 text-xs">🏢 Pre-Approved for ${orgName} (${companyVendorPool.length})</span>
        <span class="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">Buyer's Saved Pool</span>
      </div>
  `;

  if (companyVendorPool.length === 0) {
    html += `
      <div class="p-3 text-center text-slate-400 bg-slate-50 rounded-lg text-xs">
        No suppliers pre-linked to ${orgName} yet. Select from the Master Directory below to link them!
      </div>
    `;
  } else {
    html += companyVendorPool
      .map((cv) => {
        const isAlreadyAdded = assignedVendors.some((av) => av.email === cv.email);
        return `
        <label class="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer transition-colors">
          <div class="flex items-center gap-2.5">
            <input type="checkbox" value="${cv.id}" data-company="${escapeHtml(cv.company_name)}" data-contact="${escapeHtml(cv.contact_person || 'Representative')}" data-email="${escapeHtml(cv.email)}" data-phone="${escapeHtml(cv.phone || '')}" data-in-pool="true" class="pool-checkbox rounded text-blue-600 focus:ring-blue-500" ${
          isAlreadyAdded ? 'checked disabled' : ''
        } />
            <div>
              <strong class="text-slate-800 text-xs">${cv.company_name}</strong>
              <div class="text-[11px] text-slate-500">${cv.email} | ${cv.phone || 'No phone'}</div>
            </div>
          </div>
          ${
            isAlreadyAdded
              ? '<span class="text-[10px] text-slate-400 font-semibold bg-slate-200 px-2 py-0.5 rounded">In Tender</span>'
              : '<span class="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded">Pre-Approved</span>'
          }
        </label>
      `;
      })
      .join('');
  }
  html += '</div>';

  // 2. Master Directory Approved Vendors Section
  if (otherVendors.length > 0) {
    html += `
      <div class="space-y-2 pt-3">
        <div class="flex items-center justify-between pb-1.5 border-b border-slate-200">
          <span class="font-bold text-slate-900 text-xs">🌐 Other Master Directory Approved Suppliers (${otherVendors.length})</span>
          <span class="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-bold">Auto-links to Buyer Pool</span>
        </div>
    `;

    html += otherVendors
      .map((ov) => {
        const isAlreadyAdded = assignedVendors.some((av) => av.email === ov.email);
        return `
        <label class="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer transition-colors">
          <div class="flex items-center gap-2.5">
            <input type="checkbox" value="${ov.id}" data-company="${escapeHtml(ov.company_name)}" data-contact="${escapeHtml(ov.contact_person || 'Representative')}" data-email="${escapeHtml(ov.email)}" data-phone="${escapeHtml(ov.phone || '')}" data-in-pool="false" class="pool-checkbox rounded text-blue-600 focus:ring-blue-500" ${
          isAlreadyAdded ? 'checked disabled' : ''
        } />
            <div>
              <strong class="text-slate-800 text-xs">${ov.company_name}</strong>
              <div class="text-[11px] text-slate-500">${ov.email} | ${ov.phone || 'No phone'}</div>
            </div>
          </div>
          ${
            isAlreadyAdded
              ? '<span class="text-[10px] text-slate-400 font-semibold bg-slate-200 px-2 py-0.5 rounded">In Tender</span>'
              : '<span class="text-[10px] text-blue-700 font-bold bg-blue-100 px-2 py-0.5 rounded">+ Link & Add</span>'
          }
        </label>
      `;
      })
      .join('');
    html += '</div>';
  }

  checklist.innerHTML = html;
  modal.classList.remove('hidden');
}

function closePoolModal() {
  document.getElementById('pool-modal')?.classList.add('hidden');
}

async function confirmPoolSelection() {
  const checkboxes = document.querySelectorAll('.pool-checkbox:checked:not(:disabled)');
  const clientSelect = document.getElementById('input-client');
  const orgId = clientSelect.value;

  let addedCount = 0;
  for (const cb of checkboxes) {
    assignedVendors.push({
      vendor_id: cb.value,
      company_name: cb.dataset.company,
      contact_person: cb.dataset.contact || 'Representative',
      email: cb.dataset.email,
      phone: cb.dataset.phone || '',
      is_pool: true,
    });
    addedCount++;

    // If vendor was from Master Directory (not yet in company pool), auto-link to company pool!
    if (cb.dataset.inPool === 'false' && orgId) {
      try {
        await fetch(`/api/admin/companies/${orgId}/vendors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendorId: cb.value }),
        });
      } catch (e) {}
    }
  }

  if (addedCount > 0) {
    showToast(`${addedCount} supplier(s) added to tender!`, 'success');
    await loadCompanyVendorPool(orgId);
  }

  renderAssignedVendors();
  closePoolModal();
}

// --- FORM SUBMIT (CREATE OR EDIT) ---
async function handleFormSubmit(e) {
  e.preventDefault();

  const auctionId = document.getElementById('input-auction-id').value.trim();
  const customerOrgId = document.getElementById('input-client').value;
  const title = document.getElementById('input-title').value.trim();
  const scheduledStart = document.getElementById('input-start-time').value;
  const duration = parseInt(document.getElementById('input-duration').value, 10) || 60;
  const antiSniping = parseInt(document.getElementById('input-anti-sniping').value, 10) || 2;
  const maxBuffer = parseInt(document.getElementById('input-max-buffer').value, 10) || 30;
  const notifyVendors = document.getElementById('chk-notify-vendors')?.checked === true;
  const category = document.getElementById('input-category')?.value || 'General Enterprise Procurement';
  const deliveryLocation = document.getElementById('input-delivery-location')?.value?.trim() || '';
  const specialInstructions = document.getElementById('input-special-instructions')?.value?.trim() || '';

  if (lots.length === 0) {
    showToast('Please add at least one procurement lot.', 'error');
    return;
  }

  // Validate lot pricing
  for (let i = 0; i < lots.length; i++) {
    const l = lots[i];
    if (l.start_price < l.reserve_price) {
      showToast(`Lot #${i + 1}: Starting ceiling price cannot be lower than reserve price.`, 'error');
      return;
    }
  }

  // Filter and sanitize assigned vendors
  const validCustomerVendors = [];
  for (let i = 0; i < assignedVendors.length; i++) {
    const v = assignedVendors[i];
    const name = (v.company_name || '').trim();
    const email = (v.email || '').trim();
    const phone = (v.phone || '').trim();
    const contact = (v.contact_person || '').trim();

    // Skip completely blank rows
    if (!name && !email && !phone) continue;

    // Gracefully handle partial input:
    // If only phone or only email or only company is entered, ensure at least one identifier is present
    if (!name && !email && !phone) {
      continue;
    }

    validCustomerVendors.push({
      vendor_id: v.vendor_id || undefined,
      company_name: name,
      contact_person: contact,
      email: email,
      phone: phone,
      gstin: (v.gstin || '').trim() || undefined,
    });
  }

  const payload = {
    id: auctionId,
    title,
    customer_org_id: customerOrgId,
    scheduled_start: scheduledStart,
    duration_minutes: duration,
    anti_sniping_minutes: antiSniping,
    max_buffer_minutes: maxBuffer,
    category,
    delivery_location: deliveryLocation,
    special_instructions: specialInstructions,
    lots,
    customerVendors: validCustomerVendors,
    notify_vendors: notifyVendors,
  };

  const url = isEditing ? `/api/admin/auctions/${auctionId}` : '/api/admin/auctions';
  const method = isEditing ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(`Auction ${auctionId} ${isEditing ? 'updated' : 'published'} successfully!`, 'success');
    setTimeout(() => {
      window.location.href = '/admin/auctions';
    }, 1000);
  } catch (err) {
    showToast(err.message, 'error');
  }
}
