let currentLots = [];
let vendorRowCount = 0;

// --- TAB SWITCHING ---
window.switchTab = function (tabId) {
  ['auctions-tab', 'builder-tab', 'clients-tab', 'vendors-tab'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
    const btn = document.getElementById(`tab-btn-${id.replace('-tab', '')}`);
    if (btn) btn.className = 'px-4 py-1.5 rounded-md text-slate-300 hover:text-white transition-colors';
  });

  document.getElementById(tabId).classList.remove('hidden');
  const activeBtn = document.getElementById(`tab-btn-${tabId.replace('-tab', '')}`);
  if (activeBtn) activeBtn.className = 'px-4 py-1.5 rounded-md bg-blue-600 text-white transition-colors';

  if (tabId === 'auctions-tab') loadAuctions();
  if (tabId === 'clients-tab') loadCompanies();
  if (tabId === 'vendors-tab') loadMasterVendors();
};

// --- AUTO-FETCH NEXT AUCTION ID ---
window.autoFetchNextAuctionId = async function () {
  const orgId = document.getElementById('builder-client').value;
  try {
    const res = await fetch(`/api/admin/next-auction-id?orgId=${encodeURIComponent(orgId)}`);
    const data = await res.json();
    if (data.nextId) {
      document.getElementById('builder-id').value = data.nextId;
    }
  } catch (e) {}
};

// --- DYNAMIC LOTS CONTROLLER ---
function renderBuilderLots() {
  const container = document.getElementById('builder-lots-container');
  container.innerHTML = currentLots
    .map(
      (lot, index) => `
    <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 relative text-xs">
      <div class="flex items-center justify-between">
        <span class="font-bold text-slate-800 text-[11px] uppercase tracking-wider">Lot #${index + 1}</span>
        ${
          currentLots.length > 1
            ? `<button type="button" onclick="removeLot(${index})" class="text-red-500 hover:text-red-700 font-bold text-xs">✕ Remove</button>`
            : ''
        }
      </div>
      <input type="text" placeholder="Product Name (e.g. Steam Coal)" value="${lot.product_name || ''}" onchange="currentLots[${index}].product_name = this.value" required class="w-full border p-1.5 rounded bg-white" />
      <div class="grid grid-cols-2 gap-2">
        <input type="number" placeholder="Quantity" value="${lot.quantity || ''}" onchange="currentLots[${index}].quantity = parseFloat(this.value)" required class="w-full border p-1.5 rounded bg-white" />
        <input type="text" placeholder="UOM (e.g. MT, Nos)" value="${lot.uom || 'MT'}" onchange="currentLots[${index}].uom = this.value" required class="w-full border p-1.5 rounded bg-white" />
      </div>
      <div class="grid grid-cols-3 gap-2">
        <div>
          <label class="text-[10px] text-slate-500 block">Start (₹)</label>
          <input type="number" placeholder="Start" value="${lot.start_price || ''}" onchange="currentLots[${index}].start_price = parseFloat(this.value)" required class="w-full border p-1.5 rounded bg-white" />
        </div>
        <div>
          <label class="text-[10px] text-slate-500 block">Reserve (₹)</label>
          <input type="number" placeholder="Reserve" value="${lot.reserve_price || ''}" onchange="currentLots[${index}].reserve_price = parseFloat(this.value)" required class="w-full border p-1.5 rounded bg-white" />
        </div>
        <div>
          <label class="text-[10px] text-slate-500 block">Step (₹)</label>
          <input type="number" placeholder="Step" value="${lot.bid_decrement || 10}" onchange="currentLots[${index}].bid_decrement = parseFloat(this.value)" required class="w-full border p-1.5 rounded bg-white" />
        </div>
      </div>
    </div>
  `
    )
    .join('');
}

document.getElementById('add-lot-btn').addEventListener('click', () => {
  currentLots.push({ product_name: '', quantity: 100, uom: 'MT', start_price: 1000, reserve_price: 1000, bid_decrement: 10 });
  renderBuilderLots();
});

window.removeLot = function (index) {
  if (currentLots.length <= 1) return alert('Auction must have at least one lot!');
  currentLots.splice(index, 1);
  renderBuilderLots();
};

// --- CUSTOMER-PROVIDED VENDORS CONTROLLER ---
window.addVendorRow = function (defaults = {}) {
  vendorRowCount++;
  const id = vendorRowCount;
  const container = document.getElementById('builder-vendors-container');

  const row = document.createElement('div');
  row.id = `vendor-row-${id}`;
  row.className = 'grid grid-cols-1 md:grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-xs items-center';
  row.innerHTML = `
    <input type="text" placeholder="Company Name" value="${defaults.company_name || ''}" class="border p-1.5 rounded bg-white vendor-company" required />
    <input type="email" placeholder="Vendor Email" value="${defaults.email || ''}" class="border p-1.5 rounded bg-white vendor-email" required />
    <input type="text" placeholder="Phone (e.g. 9876543210)" value="${defaults.phone || ''}" class="border p-1.5 rounded bg-white vendor-phone" />
    <div class="flex items-center justify-between">
      <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Access Token</span>
      <button type="button" onclick="document.getElementById('vendor-row-${id}').remove()" class="text-red-500 hover:text-red-700 font-bold ml-2">✕</button>
    </div>
  `;
  container.appendChild(row);
};

// --- TAB 1: LOAD AUCTIONS ---
async function loadAuctions() {
  const res = await fetch('/api/admin/overview');
  const data = await res.json();
  const container = document.getElementById('auctions-list-container');

  if (!data.auctions || data.auctions.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400">No auctions found.</p>';
    return;
  }

  container.innerHTML = data.auctions
    .map(
      (a) => `
    <div class="border border-slate-200 rounded-xl p-5 bg-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="font-bold text-sm text-slate-900">${a.id}</h3>
          <span class="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded ${
            a.status === 'live' ? 'bg-emerald-100 text-emerald-800 animate-pulse' : 'bg-slate-100 text-slate-700'
          }">${a.status}</span>
        </div>
        <p class="text-xs text-slate-600 mt-1 font-medium">${a.title}</p>
        <div class="text-[11px] text-slate-500 mt-1">
          Client: <strong class="text-slate-700">${a.customer_name || 'Epack'}</strong> | 
          Lots: <strong class="text-slate-700">${a.lot_count}</strong> | 
          Duration: <strong class="text-slate-700">${a.duration_minutes}m</strong> |
          Starts: <strong class="text-slate-700">${new Date(a.scheduled_start).toLocaleString('en-IN')}</strong>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <button onclick="openEditAuction('${a.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3 py-1.5 rounded transition-colors">
          ✏️ Edit Auction
        </button>
        <a href="/api/admin/auctions/${a.id}/pdf" class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 rounded shadow transition-colors flex items-center gap-1">
          <span>📄</span> Download Report
        </a>
      </div>
    </div>
  `
    )
    .join('');
}

// --- OPEN EDIT AUCTION MODE ---
window.openEditAuction = async function (auctionId) {
  const res = await fetch(`/api/admin/auctions/${auctionId}`);
  const data = await res.json();
  if (!res.ok) return alert(data.error);

  switchTab('builder-tab');

  document.getElementById('builder-title').innerText = `Edit Auction: ${data.auction.id}`;
  document.getElementById('builder-mode-badge').innerText = 'Editing Mode';
  document.getElementById('builder-mode-badge').className = 'bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded';
  document.getElementById('edit-mode-id').value = data.auction.id;

  document.getElementById('builder-id').value = data.auction.id;
  document.getElementById('builder-id').readOnly = true;
  document.getElementById('builder-event-title').value = data.auction.title;
  document.getElementById('builder-duration').value = data.auction.duration_minutes;
  document.getElementById('builder-buffer').value = data.auction.max_buffer_minutes;

  // Format start time for input
  const d = new Date(data.auction.scheduled_start);
  const tzOffset = d.getTimezoneOffset() * 60000;
  document.getElementById('builder-start-time').value = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);

  // Load lots
  currentLots = data.lots.map((l) => ({
    product_name: l.product_name,
    quantity: l.quantity,
    uom: l.uom,
    start_price: l.start_price,
    reserve_price: l.reserve_price,
    bid_decrement: l.bid_decrement,
  }));
  renderBuilderLots();

  // Load assigned vendors
  const vContainer = document.getElementById('builder-vendors-container');
  vContainer.innerHTML = '';
  if (data.assignedVendors && data.assignedVendors.length > 0) {
    data.assignedVendors.forEach((v) => {
      addVendorRow({ company_name: v.company_name, email: v.email, phone: v.phone });
    });
  }
};

window.openCreateAuction = function () {
  switchTab('builder-tab');
  document.getElementById('builder-title').innerText = 'Create Planned Reverse Auction';
  document.getElementById('builder-mode-badge').innerText = 'New Auction';
  document.getElementById('builder-mode-badge').className = 'bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded';
  document.getElementById('edit-mode-id').value = '';
  document.getElementById('builder-id').readOnly = false;
  document.getElementById('auction-builder-form').reset();

  currentLots = [{ product_name: 'Imported Coal', quantity: 500, uom: 'MT', start_price: 13490, reserve_price: 13500, bid_decrement: 10 }];
  renderBuilderLots();

  document.getElementById('builder-vendors-container').innerHTML = '';
  addVendorRow({ company_name: 'Gold Global Fuels', email: 'goldglobalfuels@gmail.com', phone: '9876543211' });
  addVendorRow({ company_name: 'RS Bridge Consultancy', email: 'rsbridgeconsultancy@gmail.com', phone: '9876543212' });

  autoFetchNextAuctionId();
};

// --- SUBMIT AUCTION (CREATE OR EDIT) ---
document.getElementById('auction-builder-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const isEditing = document.getElementById('edit-mode-id').value !== '';
  const auctionId = document.getElementById('builder-id').value.trim();

  // Collect customer vendors
  const vendorRows = document.querySelectorAll('#builder-vendors-container > div');
  const customerVendors = [];
  vendorRows.forEach((row) => {
    customerVendors.push({
      company_name: row.querySelector('.vendor-company').value.trim(),
      email: row.querySelector('.vendor-email').value.trim(),
      phone: row.querySelector('.vendor-phone').value.trim(),
    });
  });

  const payload = {
    id: auctionId,
    title: document.getElementById('builder-event-title').value.trim(),
    customer_org_id: document.getElementById('builder-client').value,
    scheduled_start: document.getElementById('builder-start-time').value,
    duration_minutes: parseInt(document.getElementById('builder-duration').value) || 60,
    max_buffer_minutes: parseInt(document.getElementById('builder-buffer').value) || 30,
    lots: currentLots,
    customerVendors,
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

    alert(`✅ Auction ${auctionId} ${isEditing ? 'updated' : 'published'} successfully!`);
    switchTab('auctions-tab');
  } catch (err) {
    alert(`⚠️ ${err.message}`);
  }
});

// --- LOAD CLIENTS & VENDORS TABS ---
async function loadCompanies() {
  const res = await fetch('/api/admin/companies');
  const companies = await res.json();

  const select = document.getElementById('builder-client');
  select.innerHTML = companies.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');

  const list = document.getElementById('clients-list');
  list.innerHTML = companies
    .map(
      (c) => `
    <div class="border p-3 rounded bg-slate-50 flex items-center justify-between">
      <div>
        <strong class="text-slate-900">${c.name}</strong> (${c.id})
        <div class="text-[11px] text-slate-500">GSTIN: ${c.gstin || 'N/A'} | Email: ${c.email}</div>
      </div>
    </div>
  `
    )
    .join('');
}

document.getElementById('add-client-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById('client-name').value.trim(),
    shortCode: document.getElementById('client-code').value.trim(),
    gstin: document.getElementById('client-gstin').value.trim(),
    email: document.getElementById('client-email').value.trim(),
  };

  const res = await fetch('/api/admin/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error);
  alert('✅ Corporate client added!');
  document.getElementById('add-client-form').reset();
  loadCompanies();
});

async function loadMasterVendors() {
  const res = await fetch('/api/admin/overview');
  const data = await res.json();
  const tbody = document.getElementById('master-vendors-tbody');

  tbody.innerHTML = data.vendors
    .map(
      (v) => `
    <tr class="hover:bg-slate-50">
      <td class="p-3 font-bold text-slate-900">${v.company_name}</td>
      <td class="p-3">${v.contact_person}</td>
      <td class="p-3">${v.email}<br/><span class="text-slate-400">${v.phone}</span></td>
      <td class="p-3 font-mono">${v.gstin || 'None'}<br/><span class="text-slate-400">${v.pan || ''}</span></td>
      <td class="p-3">
        <span class="px-2 py-0.5 rounded font-bold ${
          v.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
        }">${v.status}</span>
      </td>
      <td class="p-3 text-center">
        ${
          v.status !== 'approved'
            ? `<button onclick="approveVendor('${v.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded">Approve</button>`
            : '<span class="text-slate-400 font-semibold">Active</span>'
        }
      </td>
    </tr>
  `
    )
    .join('');
}

window.approveVendor = async function (vendorId) {
  await fetch(`/api/admin/vendors/${vendorId}/approve`, { method: 'POST' });
  loadMasterVendors();
};

// Initial Load
loadCompanies();
loadAuctions();