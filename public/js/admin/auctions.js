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
      <div class="p-12 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
        No auctions match your search criteria.
      </div>
    `;
    return;
  }

  container.innerHTML = auctions
    .map((a) => {
      const statusColors = {
        live: 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse',
        extended: 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse',
        scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
        ended: 'bg-slate-100 text-slate-700 border-slate-300',
      };

      const startDate = new Date(a.scheduled_start).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      return `
      <div class="border border-slate-200 rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div class="space-y-1.5 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-mono font-bold text-sm text-slate-900">${a.id}</span>
            <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
              statusColors[a.status] || statusColors.scheduled
            }">
              ${a.status}
            </span>
            <span class="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              Buyer: <strong class="text-slate-800">${a.customer_name || 'Direct Client'}</strong>
            </span>
          </div>

          <h2 class="text-sm font-semibold text-slate-800">${a.title}</h2>

          <div class="flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
            <span>📅 Starts: <strong class="text-slate-700">${startDate}</strong></span>
            <span>⏳ Duration: <strong class="text-slate-700">${a.duration_minutes}m</strong></span>
            <span>🛡️ Anti-Sniping: <strong class="text-slate-700">${a.anti_sniping_minutes}m (+${a.extension_step_minutes}m)</strong></span>
            <span>📦 Lots: <strong class="text-slate-700">${a.lot_count || 1}</strong></span>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap self-end md:self-center">
          <button onclick="window.viewInvites('${a.id}', '${escapeQuotes(a.title)}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5">
            <span>🔗</span> Vendor Links
          </button>

          <a href="/admin/auction-editor?id=${a.id}" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5">
            <span>✏️</span> Edit
          </a>

          <a href="/api/admin/auctions/${a.id}/pdf" target="_blank" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5">
            <span>📄</span> Report
          </a>

          <a href="/live-auction/${a.id}" target="_blank" class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow transition-colors flex items-center gap-1.5">
            <span>⚡</span> Bidding Console
          </a>
        </div>
      </div>
    `;
    })
    .join('');
}

window.viewInvites = function (auctionId, title) {
  const modal = document.getElementById('invites-modal');
  const titleEl = document.getElementById('modal-auction-title');
  const subEl = document.getElementById('modal-auction-sub');
  const listEl = document.getElementById('modal-invites-list');

  titleEl.innerText = `Vendor Magic Links: ${auctionId}`;
  subEl.innerText = title;

  const auctionInvites = allInvites.filter((inv) => inv.auction_id === auctionId);

  if (auctionInvites.length === 0) {
    listEl.innerHTML = `
      <div class="p-6 text-center text-slate-400 bg-slate-50 rounded-lg">
        No vendors have been invited to this tender yet. Edit this auction to assign vendors.
      </div>
    `;
  } else {
    listEl.innerHTML = auctionInvites
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
