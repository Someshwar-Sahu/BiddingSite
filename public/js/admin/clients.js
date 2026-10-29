import { renderAdminNav } from './nav.js';
import { showToast } from '../toast.js';

let currentCompanyId = null;

document.addEventListener('DOMContentLoaded', () => {
  renderAdminNav('clients');
  loadCompanies();

  // Add Client Form Listener
  document.getElementById('add-client-form')?.addEventListener('submit', handleAddClient);

  // Pool Modal Listeners
  document.getElementById('close-pool-modal-btn')?.addEventListener('click', closePoolModal);
  document.getElementById('close-pool-footer-btn')?.addEventListener('click', closePoolModal);
  document.getElementById('add-pool-vendor-form')?.addEventListener('submit', handleAddPoolVendor);
});

async function loadCompanies() {
  const container = document.getElementById('clients-list');
  const countBadge = document.getElementById('clients-count-badge');

  try {
    const res = await fetch('/api/admin/companies');
    const companies = await res.json();

    if (countBadge) countBadge.innerText = `${companies.length} Clients`;

    if (companies.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center text-slate-400 bg-slate-50 rounded-lg">
          No corporate clients registered yet. Use the form on the left to add your first buyer.
        </div>
      `;
      return;
    }

    container.innerHTML = companies
      .map(
        (c) => `
      <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:shadow-sm transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <strong class="text-sm text-slate-900">${c.name}</strong>
            <span class="bg-blue-100 text-blue-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded">${c.id}</span>
          </div>
          <div class="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
            <span>GSTIN: <strong class="font-mono text-slate-700">${c.gstin || 'Unspecified'}</strong></span>
            <span>Email: <strong class="text-slate-700">${c.email}</strong></span>
            <span>Phone: <strong class="text-slate-700">${c.phone || 'N/A'}</strong></span>
          </div>
        </div>

        <button onclick="window.openCompanyPool('${c.id}', '${escapeQuotes(c.name)}')" class="bg-white hover:bg-slate-100 text-slate-800 font-bold px-3.5 py-2 rounded-lg border border-slate-300 shadow-sm text-xs transition-colors flex items-center gap-1.5 self-start sm:self-center whitespace-nowrap">
          <span>👥</span> Vendor Pool
        </button>
      </div>
    `
      )
      .join('');
  } catch (err) {
    showToast('Failed to load corporate clients: ' + err.message, 'error');
  }
}

async function handleAddClient(e) {
  e.preventDefault();
  const name = document.getElementById('client-name').value.trim();
  const shortCode = document.getElementById('client-code').value.trim();
  const gstin = document.getElementById('client-gstin').value.trim();
  const email = document.getElementById('client-email').value.trim();
  const phone = document.getElementById('client-phone').value.trim();

  try {
    const res = await fetch('/api/admin/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, shortCode, gstin, email, phone }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(`Corporate Buyer "${name}" registered successfully!`, 'success');
    document.getElementById('add-client-form').reset();
    loadCompanies();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.openCompanyPool = async function (companyId, companyName) {
  currentCompanyId = companyId;
  const modal = document.getElementById('client-pool-modal');
  document.getElementById('modal-company-name').innerText = `${companyName} - Vendor Pool`;

  await loadCompanyPoolVendors(companyId);
  modal.classList.remove('hidden');
};

async function loadCompanyPoolVendors(companyId) {
  const container = document.getElementById('company-vendors-list');
  try {
    const res = await fetch(`/api/admin/companies/${companyId}/vendors`);
    const vendors = await res.json();

    if (vendors.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-slate-400 bg-slate-50 rounded-lg">
          No vendors currently in this company's pool. Use the form above to add an approved supplier.
        </div>
      `;
      return;
    }

    container.innerHTML = vendors
      .map(
        (v) => `
      <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
        <div>
          <strong class="text-slate-800 text-xs">${v.company_name}</strong>
          <div class="text-[11px] text-slate-500">${v.email} | ${v.phone || 'No phone'}</div>
        </div>
        <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Approved Supplier</span>
      </div>
    `
      )
      .join('');
  } catch (err) {
    container.innerHTML = `<p class="text-red-500">Failed to load vendors: ${err.message}</p>`;
  }
}

async function handleAddPoolVendor(e) {
  e.preventDefault();
  if (!currentCompanyId) return;

  const payload = {
    company_name: document.getElementById('pool-vendor-name').value.trim(),
    email: document.getElementById('pool-vendor-email').value.trim(),
    contact_person: document.getElementById('pool-vendor-contact').value.trim(),
    phone: document.getElementById('pool-vendor-phone').value.trim(),
    gstin: document.getElementById('pool-vendor-gstin').value.trim(),
  };

  try {
    const res = await fetch(`/api/admin/companies/${currentCompanyId}/vendors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(`Vendor added to company pool!`, 'success');
    document.getElementById('add-pool-vendor-form').reset();
    await loadCompanyPoolVendors(currentCompanyId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closePoolModal() {
  document.getElementById('client-pool-modal')?.classList.add('hidden');
  currentCompanyId = null;
}

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
