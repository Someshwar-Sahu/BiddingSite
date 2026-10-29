import { renderAdminNav } from './nav.js';
import { showToast } from '../toast.js';

let allVendors = [];

document.addEventListener('DOMContentLoaded', () => {
  renderAdminNav('vendors');
  loadVendors();

  document.getElementById('vendor-search')?.addEventListener('input', applyFilters);
  document.getElementById('vendor-status-filter')?.addEventListener('change', applyFilters);
});

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
      (v.pan && v.pan.toLowerCase().includes(query));

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
        <td colspan="6" class="p-8 text-center text-slate-400">
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

      <td class="p-4 text-center">
        ${
          v.status !== 'approved'
            ? `<button onclick="window.approveVendor('${v.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm text-xs transition-colors">
                ✓ Approve KYC
              </button>`
            : '<span class="text-slate-400 font-semibold text-xs">Verified & Active</span>'
        }
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
