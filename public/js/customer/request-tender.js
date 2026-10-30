import { showToast } from '../toast.js';

let lots = [];
let lotCounter = 0;

document.addEventListener('DOMContentLoaded', () => {
  // Add 2 default sample rows to guide the user
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

  // Event Listeners
  document.getElementById('btn-add-lot')?.addEventListener('click', () => addLotRow());
  document.getElementById('btn-add-vendor')?.addEventListener('click', () => addVendorRow());
  document.getElementById('tender-request-form')?.addEventListener('submit', handleFormSubmit);

  // Close modal
  document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    document.getElementById('success-modal')?.classList.add('hidden');
    window.location.reload();
  });
});

// --- 1. LOT BUILDER ---
function addLotRow(initialData = null) {
  lotCounter++;
  const id = lotCounter;
  const tbody = document.getElementById('lots-tbody');
  if (!tbody) return;

  const row = document.createElement('tr');
  row.id = `lot-row-${id}`;
  row.className = 'hover:bg-slate-50 transition-colors';

  const defaultData = initialData || {
    product_name: '',
    category: 'General',
    quantity: 100,
    uom: 'Nos',
    reserve_price: 1000,
    bid_decrement: 10,
  };

  row.innerHTML = `
    <td class="py-3 px-3 font-bold text-slate-500">${id}</td>
    <td class="py-2 px-2">
      <input type="text" data-field="product_name" required value="${defaultData.product_name}" placeholder="e.g. HDPE Drums 200L" class="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-medium" />
    </td>
    <td class="py-2 px-2">
      <input type="text" data-field="category" value="${defaultData.category}" placeholder="e.g. Non-PCB" class="w-full border border-slate-300 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500" />
    </td>
    <td class="py-2 px-2">
      <input type="number" data-field="quantity" min="1" step="any" required value="${defaultData.quantity}" class="w-full border border-slate-300 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-center lot-calc" />
    </td>
    <td class="py-2 px-2">
      <select data-field="uom" class="w-full border border-slate-300 rounded px-1.5 py-1.5 outline-none bg-white font-medium">
        <option value="Nos" ${defaultData.uom === 'Nos' ? 'selected' : ''}>Nos</option>
        <option value="MT" ${defaultData.uom === 'MT' ? 'selected' : ''}>MT</option>
        <option value="Kgs" ${defaultData.uom === 'Kgs' ? 'selected' : ''}>Kgs</option>
        <option value="Liters" ${defaultData.uom === 'Liters' ? 'selected' : ''}>Liters</option>
        <option value="Lots" ${defaultData.uom === 'Lots' ? 'selected' : ''}>Lots</option>
      </select>
    </td>
    <td class="py-2 px-2">
      <input type="number" data-field="reserve_price" min="1" step="any" required value="${defaultData.reserve_price}" class="w-full border border-slate-300 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-right lot-calc" />
    </td>
    <td class="py-2 px-2">
      <input type="number" data-field="bid_decrement" min="1" step="any" required value="${defaultData.bid_decrement}" class="w-full border border-slate-300 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-right" />
    </td>
    <td class="py-2 px-3 text-right font-mono font-bold text-slate-800" id="baseline-val-${id}">
      ₹0
    </td>
    <td class="py-2 px-2 text-center">
      <button type="button" class="btn-remove-lot text-red-500 hover:text-red-700 font-bold p-1" title="Remove Lot">
        ✕
      </button>
    </td>
  `;

  tbody.appendChild(row);

  // Wire input listeners for live budget calculation
  row.querySelectorAll('.lot-calc').forEach((input) => {
    input.addEventListener('input', () => updateLotBudget(id));
  });

  // Wire remove button
  row.querySelector('.btn-remove-lot')?.addEventListener('click', () => {
    const totalRows = tbody.querySelectorAll('tr').length;
    if (totalRows <= 1) {
      showToast('A tender must contain at least one lot item.', 'warning');
      return;
    }
    row.remove();
    recalculateTotalBudget();
  });

  updateLotBudget(id);
}

function updateLotBudget(rowId) {
  const row = document.getElementById(`lot-row-${rowId}`);
  if (!row) return;

  const qtyInput = row.querySelector('[data-field="quantity"]');
  const priceInput = row.querySelector('[data-field="reserve_price"]');
  const display = document.getElementById(`baseline-val-${rowId}`);

  const qty = parseFloat(qtyInput?.value) || 0;
  const price = parseFloat(priceInput?.value) || 0;
  const baseline = qty * price;

  if (display) {
    display.innerText = `₹${baseline.toLocaleString('en-IN')}`;
  }

  recalculateTotalBudget();
}

function recalculateTotalBudget() {
  let total = 0;
  const rows = document.querySelectorAll('#lots-tbody tr');

  rows.forEach((row) => {
    const qty = parseFloat(row.querySelector('[data-field="quantity"]')?.value) || 0;
    const price = parseFloat(row.querySelector('[data-field="reserve_price"]')?.value) || 0;
    total += qty * price;
  });

  const totalEl = document.getElementById('total-baseline-display');
  if (totalEl) {
    totalEl.innerText = `₹${total.toLocaleString('en-IN')}`;
  }
}

// --- 2. OPTIONAL RECOMMENDED SUPPLIERS BUILDER ---
function addVendorRow() {
  const container = document.getElementById('vendors-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs items-center';
  row.innerHTML = `
    <div>
      <input type="text" data-vendor="company_name" placeholder="Supplier Company Name" class="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none font-medium" />
    </div>
    <div>
      <input type="text" data-vendor="contact_person" placeholder="Representative Name" class="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none" />
    </div>
    <div>
      <input type="tel" data-vendor="phone" placeholder="Phone Number" class="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none" />
    </div>
    <div class="flex items-center gap-2">
      <input type="email" data-vendor="email" placeholder="Email Address" class="w-full border border-slate-300 rounded px-2.5 py-1.5 outline-none" />
      <button type="button" class="text-red-500 hover:text-red-700 font-bold px-1.5" onclick="this.closest('.grid').remove()">✕</button>
    </div>
  `;

  container.appendChild(row);
}

// --- 3. FORM SUBMISSION ---
async function handleFormSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('btn-submit-request');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Submitting Request...';
  }

  // Collect Lots
  const lotRows = document.querySelectorAll('#lots-tbody tr');
  const collectedLots = [];

  lotRows.forEach((row) => {
    collectedLots.push({
      product_name: row.querySelector('[data-field="product_name"]')?.value.trim(),
      category: row.querySelector('[data-field="category"]')?.value.trim() || 'General',
      quantity: parseFloat(row.querySelector('[data-field="quantity"]')?.value) || 1,
      uom: row.querySelector('[data-field="uom"]')?.value || 'Nos',
      reserve_price: parseFloat(row.querySelector('[data-field="reserve_price"]')?.value) || 1000,
      bid_decrement: parseFloat(row.querySelector('[data-field="bid_decrement"]')?.value) || 10,
    });
  });

  // Collect Suggested Vendors
  const vendorRows = document.querySelectorAll('#vendors-container .grid');
  const collectedVendors = [];

  vendorRows.forEach((row) => {
    const comp = row.querySelector('[data-vendor="company_name"]')?.value.trim();
    if (comp) {
      collectedVendors.push({
        company_name: comp,
        contact_person: row.querySelector('[data-vendor="contact_person"]')?.value.trim() || 'Representative',
        phone: row.querySelector('[data-vendor="phone"]')?.value.trim() || 'N/A',
        email: row.querySelector('[data-vendor="email"]')?.value.trim() || 'N/A',
      });
    }
  });

  const payload = {
    company_name: document.getElementById('company_name')?.value.trim(),
    gstin: document.getElementById('gstin')?.value.trim(),
    contact_person: document.getElementById('contact_person')?.value.trim(),
    email: document.getElementById('email')?.value.trim(),
    phone: document.getElementById('phone')?.value.trim(),
    delivery_location: document.getElementById('delivery_location')?.value.trim(),
    title: document.getElementById('title')?.value.trim(),
    category: document.getElementById('category')?.value,
    target_date: document.getElementById('target_date')?.value || null,
    duration_minutes: parseInt(document.getElementById('duration_minutes')?.value, 10) || 45,
    special_terms: document.getElementById('special_terms')?.value.trim(),
    lots: collectedLots,
    suggested_vendors: collectedVendors,
  };

  try {
    const res = await fetch('/api/customer/tender-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit tender request.');
    }

    // Show Confirmation Modal
    document.getElementById('modal-req-number').innerText = data.requestNumber;
    document.getElementById('modal-company').innerText = payload.company_name;
    document.getElementById('modal-lots-count').innerText = `${collectedLots.length} Lot Item(s)`;
    document.getElementById('success-modal')?.classList.remove('hidden');

    showToast('Tender request submitted successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>🚀</span> Submit Tender Request to NexTrade Desk';
    }
  }
}

