import { renderAdminNav } from './nav.js';
import { showToast } from '../toast.js';

let allVendors = [];
let allCompanies = [];
let selectedVendorForAssignment = null;

document.addEventListener('DOMContentLoaded', () => {
  renderAdminNav('vendors');
  loadVendors();
  loadCompanies();

  document.getElementById('vendor-search')?.addEventListener('input', applyFilters);
  document.getElementById('vendor-status-filter')?.addEventListener('change', applyFilters);

  // Assign modal handlers
  document.getElementById('close-assign-modal')?.addEventListener('click', closeAssignModal);
  document.getElementById('cancel-assign-btn')?.addEventListener('click', closeAssignModal);
  document.getElementById('confirm-assign-btn')?.addEventListener('click', handleConfirmAssign);
});

async function loadCompanies() {
  try {
    const res = await fetch('/api/admin/companies');
    allCompanies = await res.json();
    const select = document.getElementById('assign-client-select');
    if (select) {
      select.innerHTML = allCompanies
        .map((c) => `<option value="${c.id}">${c.name}</option>`)
        .join('');
    }
  } catch (err) {}
}

async function loadVendors() {
  try {
    const res = await fetch('/api/admin/overview');
    if (!res.ok) throw new Error('Failed to load vendors');
    const data = await res.json();
    allVendors = data.vendors || [];
    renderVendors(allVendors);
  } catch (err) {
    showToast('Failed to load vendors: ' + err.message, 'error');
  }
}

function applyFilters() {
  const query = document.getElementById('vendor-search')?.value.toLowerCase().trim() || '';
  const status = document.getElementById('vendor-status-filter')?.value || 'all';

  const filtered = allVendors.filter((v) => {
    const matchesQuery =
      (v.company_name && v.company_name.toLowerCase().includes(query)) ||
      (v.contact_person && v.contact_person.toLowerCase().includes(query)) ||
      (v.email && v.email.toLowerCase().includes(query)) ||
      (v.gstin && v.gstin.toLowerCase().includes(query)) ||
      (v.pan && v.pan.toLowerCase().includes(query)) ||
      (v.assigned_companies && v.assigned_companies.toLowerCase().includes(query));

    const matchesStatus = status === 'all' || v.status === status;
    return matchesQuery && matchesStatus;
  });

  renderVendors(filtered);
}

function renderVendors(vendors) {
  const tbody = document.getElementById('vendors-tbody');
  if (!tbody) return;

  if (vendors.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="p-8 text-center text-slate-400">
          No vendors found matching your filter criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = vendors
    .map(
      (v) => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="p-4">
        <strong class="text-slate-900 font-semibold block">${v.company_name}</strong>
        <span class="text-[10px] text-slate-400 font-mono">${v.id}</span>
      </td>

      <td class="p-4 text-slate-700">
        ${v.contact_person || 'Representative'}
      </td>

      <td class="p-4">
        <div class="text-slate-800 font-medium">${v.email}</div>
        <div class="text-slate-400 font-mono text-[11px]">${v.phone || 'No phone'}</div>
      </td>

      <td class="p-4 font-mono text-[11px]">
        <div>GSTIN: <strong class="text-slate-700">${v.gstin || 'None Provided'}</strong></div>
        <div>PAN: <strong class="text-slate-700">${v.pan || 'N/A'}</strong></div>
      </td>

      <td class="p-4">
        <span class="px-2.5 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider ${
          v.status === 'approved'
            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            : 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
        }">
          ${v.status}
        </span>
      </td>

      <td class="p-4">
        ${
          v.assigned_companies
            ? `<span class="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 rounded text-[11px] font-semibold inline-block">${v.assigned_companies}</span>`
            : '<span class="text-slate-400 text-[11px] italic">Not assigned to any client</span>'
        }
      </td>

      <td class="p-4 text-center">
        <div class="flex items-center justify-center gap-2">
          ${
            v.status !== 'approved'
              ? `<button onclick="window.approveVendor('${v.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm text-xs transition-colors">
                  ✓ Approve KYC
                </button>`
              : `<button onclick="window.openAssignModal('${v.id}', '${escapeQuotes(v.company_name)}')" class="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-lg border border-blue-200 text-xs transition-colors whitespace-nowrap">
                  + Assign to Buyer
                </button>`
          }
        </div>
      </td>
    </tr>
  `
    )
    .join('');
}

window.approveVendor = async function (vendorId) {
  try {
    const res = await fetch(`/api/admin/vendors/${vendorId}/approve`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to approve vendor');
    showToast('Vendor KYC approved successfully!', 'success');
    loadVendors();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.openAssignModal = function (vendorId, companyName) {
  selectedVendorForAssignment = vendorId;
  const modal = document.getElementById('assign-modal');
  document.getElementById('assign-vendor-title').innerText = `Assign "${companyName}"`;
  modal.classList.remove('hidden');
};

function closeAssignModal() {
  document.getElementById('assign-modal')?.classList.add('hidden');
  selectedVendorForAssignment = null;
}

async function handleConfirmAssign() {
  if (!selectedVendorForAssignment) return;
  const select = document.getElementById('assign-client-select');
  const companyId = select.value;
  const companyName = select.options[select.selectedIndex]?.text || 'Corporate Buyer';

  try {
    const res = await fetch(`/api/admin/companies/${companyId}/vendors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: selectedVendorForAssignment }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(`Supplier assigned to ${companyName}!`, 'success');
    closeAssignModal();
    loadVendors();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
