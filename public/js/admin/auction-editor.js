import { renderAdminNav } from './nav.js';
import { showToast } from '../toast.js';

let lots = [];
let assignedVendors = []; // { company_name, contact_person, email, phone }
let companyVendorPool = [];
let isEditing = false;

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
    assignedVendors.push({ company_name: '', contact_person: '', email: '', phone: '' });
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

    // Populate assigned vendors
    assignedVendors = fetchedVendors.map((v) => ({
      company_name: v.company_name,
      contact_person: '',
      email: v.email,
      phone: v.phone || '',
    }));
    renderAssignedVendors();

    await loadCompanyVendorPool(auction.customer_org_id);
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
          <input type="text" required placeholder="e.g. Imported Indonesian Steam Coal (5000 GAR)" value="${lot.product_name || ''}" onchange="window.updateLotField(${idx}, 'product_name', this.value)" class="w-full border border-slate-300 p-2 rounded-lg bg-white" />
        </div>
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">Category</label>
          <input type="text" placeholder="e.g. Raw Material" value="${lot.category || 'Standard'}" onchange="window.updateLotField(${idx}, 'category', this.value)" class="w-full border border-slate-300 p-2 rounded-lg bg-white" />
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">Quantity</label>
          <input type="number" step="any" required min="0.01" value="${lot.quantity || ''}" onchange="window.updateLotField(${idx}, 'quantity', parseFloat(this.value))" class="w-full border border-slate-300 p-2 rounded-lg bg-white" />
        </div>
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">UOM (Unit)</label>
          <input type="text" required placeholder="MT, Nos, Litres" value="${lot.uom || 'MT'}" onchange="window.updateLotField(${idx}, 'uom', this.value)" class="w-full border border-slate-300 p-2 rounded-lg bg-white uppercase font-bold" />
        </div>
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">Ceiling Price (₹)</label>
          <input type="number" step="any" required min="1" value="${lot.start_price || ''}" onchange="window.updateLotField(${idx}, 'start_price', parseFloat(this.value))" class="w-full border border-slate-300 p-2 rounded-lg bg-white font-mono" />
        </div>
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">Reserve Price (₹)</label>
          <input type="number" step="any" required min="1" value="${lot.reserve_price || ''}" onchange="window.updateLotField(${idx}, 'reserve_price', parseFloat(this.value))" class="w-full border border-slate-300 p-2 rounded-lg bg-white font-mono" />
        </div>
        <div>
          <label class="text-[11px] font-semibold text-slate-600 block mb-0.5">Decrement Step (₹)</label>
          <input type="number" step="any" required min="1" value="${lot.bid_decrement || 10}" onchange="window.updateLotField(${idx}, 'bid_decrement', parseFloat(this.value))" class="w-full border border-slate-300 p-2 rounded-lg bg-white font-mono" />
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
        No vendors assigned yet. Pick from the client's approved pool or add new customer-provided vendors.
      </div>
    `;
    return;
  }

  container.innerHTML = assignedVendors
    .map(
      (v, idx) => `
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 items-center">
      <div>
        <label class="text-[10px] text-slate-500 block mb-0.5">Vendor Company</label>
        <input type="text" required placeholder="Company Name" value="${v.company_name || ''}" onchange="window.updateVendorField(${idx}, 'company_name', this.value)" class="w-full border border-slate-300 p-1.5 rounded bg-white text-xs font-semibold" />
      </div>

      <div>
        <label class="text-[10px] text-slate-500 block mb-0.5">Email Address</label>
        <input type="email" required placeholder="vendor@procure.com" value="${v.email || ''}" onchange="window.updateVendorField(${idx}, 'email', this.value)" class="w-full border border-slate-300 p-1.5 rounded bg-white text-xs" />
      </div>

      <div>
        <label class="text-[10px] text-slate-500 block mb-0.5">Phone (for WhatsApp)</label>
        <input type="text" placeholder="e.g. 9876543210" value="${v.phone || ''}" onchange="window.updateVendorField(${idx}, 'phone', this.value)" class="w-full border border-slate-300 p-1.5 rounded bg-white text-xs font-mono" />
      </div>

      <div class="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-4">
        <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded">Private Pass</span>
        <button type="button" onclick="window.removeVendor(${idx})" class="text-red-500 hover:text-red-700 font-bold text-xs">✕ Remove</button>
      </div>
    </div>
  `
    )
    .join('');
}

window.updateVendorField = function (index, field, value) {
  if (assignedVendors[index]) assignedVendors[index][field] = value;
};

window.removeVendor = function (index) {
  assignedVendors.splice(index, 1);
  renderAssignedVendors();
};

// --- POOL MODAL CONTROLS ---
function openPoolModal() {
  const modal = document.getElementById('pool-modal');
  const checklist = document.getElementById('pool-vendors-checklist');

  if (companyVendorPool.length === 0) {
    checklist.innerHTML = `
      <div class="p-6 text-center text-slate-400 bg-slate-50 rounded-lg">
        This corporate buyer has no pre-registered vendors in its pool yet. Use "+ Add New Vendor" to add them.
      </div>
    `;
  } else {
    checklist.innerHTML = companyVendorPool
      .map((cv) => {
        const isAlreadyAdded = assignedVendors.some((av) => av.email === cv.email);
        return `
        <label class="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer">
          <div class="flex items-center gap-2">
            <input type="checkbox" value="${cv.id}" data-company="${cv.company_name}" data-email="${cv.email}" data-phone="${cv.phone || ''}" class="pool-checkbox rounded text-blue-600 focus:ring-blue-500" ${
          isAlreadyAdded ? 'checked disabled' : ''
        } />
            <div>
              <strong class="text-slate-800 text-xs">${cv.company_name}</strong>
              <div class="text-[11px] text-slate-500">${cv.email} | ${cv.phone || 'No phone'}</div>
            </div>
          </div>
          ${
            isAlreadyAdded
              ? '<span class="text-[10px] text-slate-400 font-semibold">Already Added</span>'
              : '<span class="text-[10px] text-emerald-600 font-bold">Approved</span>'
          }
        </label>
      `;
      })
      .join('');
  }

  modal.classList.remove('hidden');
}

function closePoolModal() {
  document.getElementById('pool-modal')?.classList.add('hidden');
}

function confirmPoolSelection() {
  const checkboxes = document.querySelectorAll('.pool-checkbox:checked:not(:disabled)');
  checkboxes.forEach((cb) => {
    assignedVendors.push({
      company_name: cb.dataset.company,
      contact_person: '',
      email: cb.dataset.email,
      phone: cb.dataset.phone,
    });
  });

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

  const payload = {
    id: auctionId,
    title,
    customer_org_id: customerOrgId,
    scheduled_start: scheduledStart,
    duration_minutes: duration,
    anti_sniping_minutes: antiSniping,
    max_buffer_minutes: maxBuffer,
    lots,
    customerVendors: assignedVendors,
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
