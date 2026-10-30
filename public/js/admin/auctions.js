import { renderAdminNav } from './nav.js';
import { showToast } from '../toast.js';

let allAuctions = [];
let allInvites = [];

document.addEventListener('DOMContentLoaded', () => {
  renderAdminNav('auctions');
  loadAuctionsData();

  // Search & Filter listeners
  document.getElementById('auction-search')?.addEventListener('input', applyFilters);
  document.getElementById('status-filter')?.addEventListener('change', applyFilters);

  // Modal close handlers
  document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
  document.getElementById('close-modal-footer-btn')?.addEventListener('click', closeModal);
});

async function loadAuctionsData() {
  try {
    loadTenderRequests();

    const res = await fetch('/api/admin/overview');
    if (!res.ok) throw new Error('Failed to load auctions overview');
    const data = await res.json();
    allAuctions = data.auctions || [];
    allInvites = data.invites || [];
    renderAuctions(allAuctions);
  } catch (err) {
    showToast(err.message, 'error');
    document.getElementById('auctions-container').innerHTML = `
      <div class="p-8 text-center text-xs text-red-500 bg-white rounded-xl border border-red-200">
        Error loading auctions. Please refresh.
      </div>
    `;
  }
}

async function loadTenderRequests() {
  try {
    const res = await fetch('/api/admin/tender-requests?status=pending_review');
    if (!res.ok) return;
    const data = await res.json();
    const container = document.getElementById('tender-requests-container');
    if (!container) return;

    const requests = data.requests || [];
    if (requests.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="bg-amber-50 border border-amber-300 rounded-xl p-4 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-base">📋</span>
            <h3 class="text-sm font-bold text-amber-950">Pending Client Tender Requests (${requests.length})</h3>
            <span class="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">Requires Review</span>
          </div>
          <a href="/customer/request-tender" target="_blank" class="text-xs text-blue-700 hover:underline font-semibold">
            + Client Intake Portal
          </a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${requests
            .map(
              (r) => `
            <div class="bg-white p-3.5 rounded-lg border border-amber-200 shadow-xs space-y-2 text-xs">
              <div class="flex items-center justify-between">
                <span class="font-mono font-bold text-blue-600">${r.request_number}</span>
                <span class="text-slate-400 text-[10px]">${new Date(r.created_at).toLocaleDateString('en-IN')}</span>
              </div>
              <div>
                <strong class="text-slate-900 font-semibold block">${r.title}</strong>
                <span class="text-slate-500 text-[11px]">${r.company_name} • ${r.contact_person} (${r.phone})</span>
              </div>
              <div class="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded text-slate-600">
                <span><strong>${r.lots.length}</strong> Lot(s) specified</span>
                <span>Duration: <strong>${r.duration_minutes}m</strong></span>
              </div>
              <div class="pt-1 flex items-center justify-end gap-2">
                <button onclick="window.convertTenderRequest('${r.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded shadow-xs flex items-center gap-1 transition-colors">
                  <span>⚡</span> Approve & Create Auction
                </button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  } catch (err) {
    console.warn('Failed to load tender requests:', err);
  }
}

window.convertTenderRequest = async function (requestId) {
  if (!confirm('Convert this customer request into an active/scheduled NexTrade auction?')) return;
  try {
    const res = await fetch(`/api/admin/tender-requests/${requestId}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to convert request');
    showToast(`Auction ${data.auctionId} created successfully!`, 'success');
    loadAuctionsData();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function applyFilters() {
  const query = document.getElementById('auction-search')?.value.toLowerCase().trim() || '';
  const status = document.getElementById('status-filter')?.value || 'all';

  const filtered = allAuctions.filter((a) => {
    const matchesQuery =
      a.id.toLowerCase().includes(query) ||
      (a.title && a.title.toLowerCase().includes(query)) ||
      (a.customer_name && a.customer_name.toLowerCase().includes(query));

    const matchesStatus = status === 'all' || a.status === status;
    return matchesQuery && matchesStatus;
  });

  renderAuctions(filtered);
}

function renderAuctions(auctions) {
  const container = document.getElementById('auctions-container');
  if (!container) return;

  if (auctions.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
        No auctions match your search criteria.
      </div>
    `;
    return;
  }

  container.innerHTML = auctions
    .map((a) => {
      const statusColors = {
        live: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        extended: 'bg-amber-100 text-amber-800 border-amber-300',
        scheduled: 'bg-blue-100 text-blue-800 border-blue-300',
        ended: 'bg-slate-100 text-slate-800 border-slate-300',
      };

      const start = new Date(a.scheduled_start).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      return `
      <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 hover:border-slate-300 transition-colors">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-sm text-slate-900">${a.id}</span>
              <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                statusColors[a.status] || statusColors.scheduled
              }">
                ${a.status}
              </span>
            </div>
            <h3 class="text-sm font-bold text-slate-800 mt-1">${a.title}</h3>
            <p class="text-xs text-slate-500">Corporate Client: <strong class="text-slate-700">${
              a.customer_name || 'Direct Client'
            }</strong></p>
          </div>

          <div class="flex items-center gap-2">
            <!-- 1-Click Invites Modal -->
            <button onclick="window.openInvitesModal('${a.id}', '${escapeQuotes(a.title)}')" class="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs px-3.5 py-1.5 rounded-lg border border-blue-200 transition-colors flex items-center gap-1.5">
              <span>🔑</span> Magic Links
            </button>

            <!-- 6-Page PDF Audit Report -->
            <a href="/api/admin/auctions/${a.id}/pdf" target="_blank" class="bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-200 transition-colors flex items-center gap-1">
              <span>📄</span> Audit PDF
            </a>

            <!-- Observer Screen -->
            <a href="/observer/${a.id}" target="_blank" class="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm transition-colors flex items-center gap-1">
              <span>👁️</span> Spectator
            </a>
          </div>
        </div>

        <!-- Schedule & Anti-sniping parameters -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            <span class="text-[10px] text-slate-400 block font-semibold uppercase">Scheduled Start</span>
            <strong class="text-slate-700">${start}</strong>
          </div>
          <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            <span class="text-[10px] text-slate-400 block font-semibold uppercase">Duration</span>
            <strong class="text-slate-700">${a.duration_minutes} Mins</strong>
          </div>
          <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            <span class="text-[10px] text-slate-400 block font-semibold uppercase">Anti-Sniping</span>
            <strong class="text-slate-700">Last ${a.anti_sniping_minutes}m (+${a.extension_step_minutes}m)</strong>
          </div>
          <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            <span class="text-[10px] text-slate-400 block font-semibold uppercase">Max Buffer</span>
            <strong class="text-slate-700">${a.max_buffer_minutes} Mins</strong>
          </div>
        </div>
      </div>
    `;
    })
    .join('');
}

window.openInvitesModal = function (auctionId, title) {
  const modal = document.getElementById('invites-modal');
  const modalTitle = document.getElementById('modal-auction-title');
  const modalList = document.getElementById('invites-list');
  if (!modal || !modalTitle || !modalList) return;

  modalTitle.innerText = `${auctionId}: Magic Access Links`;
  const invites = allInvites.filter((i) => i.auction_id === auctionId);

  if (invites.length === 0) {
    modalList.innerHTML = `
      <div class="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-lg">
        No vendor invites registered for this auction event yet.
      </div>
    `;
  } else {
    modalList.innerHTML = invites
      .map(
        (inv) => `
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
        <div class="flex items-center justify-between">
          <div>
            <strong class="text-slate-900">${inv.company_name || 'Invited Vendor'}</strong>
            <span class="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded ml-2 uppercase">${inv.role}</span>
          </div>
          <span class="text-slate-400 text-[11px]">${inv.phone || 'No phone'}</span>
        </div>

        <div class="flex items-center gap-2">
          <input type="text" readonly value="${inv.accessUrl}" class="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1 text-[11px] font-mono select-all text-slate-700" />
          <button onclick="navigator.clipboard.writeText('${inv.accessUrl}').then(() => window.copiedToast())" class="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-3 py-1 rounded text-[11px]">
            Copy Link
          </button>
          ${
            inv.waUrl
              ? `<a href="${inv.waUrl}" target="_blank" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded text-[11px] flex items-center gap-1">
                  <span>📱</span> WhatsApp
                </a>`
              : ''
          }
        </div>
      </div>
    `
      )
      .join('');
  }

  modal.classList.remove('hidden');
};

window.copiedToast = function () {
  showToast('Magic Link copied to clipboard!', 'success');
};

function closeModal() {
  document.getElementById('invites-modal')?.classList.add('hidden');
}

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
