import { showToast } from '../toast.js';

const pathParts = window.location.pathname.split('/').filter(Boolean);
const auctionId = pathParts[pathParts.length - 1];

function formatINR(val) {
  if (val == null || isNaN(val)) return '₹0';
  return '₹' + Number(val).toLocaleString('en-IN');
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!auctionId) {
    showToast('No auction ID specified.', 'error');
    return;
  }
  await loadAuctionDetail();
  initLogoutListener();
});

async function loadAuctionDetail() {
  try {
    const res = await fetch(`/api/customer/auctions/${encodeURIComponent(auctionId)}`);
    if (res.status === 401) {
      window.location.href = '/customer/login';
      return;
    }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Auction not found or unauthorized.');
    }

    const data = await res.json();
    renderAuctionOverview(data.auction);
    renderMetrics(data.auction, data.bids, data.invitedVendors);
    renderLots(data.lots);
    renderBids(data.bids);
    renderInvitedVendors(data.invitedVendors);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 1. RENDER OVERVIEW
function renderAuctionOverview(auction) {
  document.getElementById('detail-auction-id').innerText = auction.id;
  document.getElementById('detail-auction-title').innerText = auction.title;
  document.getElementById('detail-auction-subtitle').innerText = `Corporate Buyer: ${auction.customer_name || 'Enterprise Client'}`;
  document.getElementById('detail-facility').innerText = auction.delivery_location || 'Customer Facility';
  document.getElementById('detail-terms').innerText = auction.special_instructions || 'Standard Settlement';
  document.getElementById('detail-duration').innerText = `${auction.duration_minutes || 60} Minutes`;

  const startFormatted = new Date(auction.scheduled_start).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  document.getElementById('detail-timing').innerText = startFormatted;

  const isLive = auction.status === 'live' || auction.status === 'extended';
  const statusEl = document.getElementById('detail-status-badge');
  const catEl = document.getElementById('detail-category-badge');

  if (catEl) catEl.innerText = auction.category || 'General Procurement';

  if (statusEl) {
    if (isLive) {
      statusEl.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-emerald-50 text-emerald-700 border border-emerald-200';
      statusEl.innerHTML = '<span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1"></span> LIVE BIDDING NOW';
    } else {
      statusEl.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-slate-100 text-slate-700 border border-slate-200';
      statusEl.innerText = auction.status.toUpperCase();
    }
  }

  // Header Actions
  const actionsContainer = document.getElementById('detail-header-actions');
  const pdfBtn = document.getElementById('btn-download-pdf');

  if (pdfBtn) {
    pdfBtn.href = `/api/customer/auctions/${auction.id}/pdf`;
  }

  if (actionsContainer) {
    actionsContainer.innerHTML = `
      <a href="/observer/${auction.id}" target="_blank" class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5">
        <span>👁️</span> Enter Live Spectator Console
      </a>
      <a href="/api/customer/auctions/${auction.id}/pdf" target="_blank" class="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5">
        <span>📄</span> Settlement PDF
      </a>
    `;
  }
}

// 2. RENDER TOP METRICS
function renderMetrics(auction, bids, suppliers) {
  document.getElementById('metric-committed-spend').innerText = formatINR(auction.totalCommittedSpend);
  document.getElementById('metric-baseline-reserve').innerText = formatINR(auction.totalReserve);
  document.getElementById('metric-total-savings').innerText = `+${formatINR(auction.totalSavings)}`;
  document.getElementById('metric-savings-pct').innerText = `${auction.savingsPercent}%`;
  document.getElementById('metric-bids-count').innerText = bids?.length || 0;
  document.getElementById('metric-suppliers-count').innerText = `${suppliers?.length || 0} invited suppliers`;
}

// 3. RENDER LOTS
function renderLots(lots) {
  const tbody = document.getElementById('lots-tbody');
  const badge = document.getElementById('lots-count-badge');
  if (!tbody) return;

  badge.innerText = `${lots?.length || 0} Lot(s)`;

  if (!lots || lots.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400">No lots defined.</td></tr>';
    return;
  }

  tbody.innerHTML = lots
    .map((lot, idx) => {
      const hasBid = lot.current_lowest_bid != null && lot.current_lowest_bid > 0;
      const unitSavings = hasBid ? Math.max(0, lot.reserve_price - lot.current_lowest_bid) : 0;
      const totalLotSavings = unitSavings * (Number(lot.quantity) || 1);

      return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="p-3.5">
          <strong class="text-slate-900 block font-bold">Lot #${lot.lot_number || idx + 1}: ${lot.product_name}</strong>
          <span class="text-[11px] text-slate-400">${lot.category || 'Commodity'}</span>
        </td>
        <td class="p-3.5 text-slate-700 font-mono">
          ${lot.quantity} ${lot.uom}
        </td>
        <td class="p-3.5 text-slate-700 font-mono">
          ${formatINR(lot.reserve_price)}
        </td>
        <td class="p-3.5 font-mono font-bold ${hasBid ? 'text-blue-700' : 'text-slate-400'}">
          ${hasBid ? formatINR(lot.current_lowest_bid) : 'No Bids Logged'}
        </td>
        <td class="p-3.5">
          ${
            hasBid
              ? `
            <span class="font-bold text-slate-900 block">${lot.l1_vendor_name || 'Winning Bidder'}</span>
            <span class="text-[10px] text-slate-400">${lot.l1_phone || lot.l1_email || ''}</span>
          `
              : '<span class="text-slate-400 italic">Unbid / No Award</span>'
          }
        </td>
        <td class="p-3.5 text-right font-mono font-bold ${hasBid ? 'text-emerald-600' : 'text-slate-400'}">
          ${hasBid ? `+${formatINR(totalLotSavings)}` : '₹0'}
        </td>
      </tr>
    `;
    })
    .join('');
}

// 4. RENDER BID AUDIT STREAM
function renderBids(bids) {
  const tbody = document.getElementById('bids-tbody');
  const badge = document.getElementById('bids-badge');
  if (!tbody) return;

  badge.innerText = `${bids?.length || 0} Bids Logged`;

  if (!bids || bids.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400 font-sans">No competitive bids submitted for this tender yet.</td></tr>';
    return;
  }

  tbody.innerHTML = bids
    .map((b, idx) => {
      const timeStr = new Date(b.created_at).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const isL1 = idx === 0;

      return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="p-3.5 text-slate-500">${timeStr}</td>
        <td class="p-3.5 font-sans font-semibold text-slate-800">${b.product_name}</td>
        <td class="p-3.5 font-sans font-bold text-slate-900">${b.vendor_name}</td>
        <td class="p-3.5 text-right font-black text-slate-900">${formatINR(b.amount)} / ${b.uom}</td>
        <td class="p-3.5 text-center">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded ${isL1 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'}">
            ${isL1 ? 'LEAD L1' : 'OUTBID'}
          </span>
        </td>
      </tr>
    `;
    })
    .join('');
}

// 5. RENDER INVITED SUPPLIERS
function renderInvitedVendors(suppliers) {
  const container = document.getElementById('invited-suppliers-list');
  const badge = document.getElementById('suppliers-count-badge');
  if (!container) return;

  badge.innerText = `${suppliers?.length || 0} Vetted`;

  if (!suppliers || suppliers.length === 0) {
    container.innerHTML = '<p class="text-slate-400 text-center py-4">No suppliers invited to this event.</p>';
    return;
  }

  container.innerHTML = suppliers
    .map(
      (s) => `
    <div class="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-1">
      <div class="flex items-center justify-between">
        <strong class="font-bold text-slate-900">${s.company_name}</strong>
        <span class="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-200">
          APPROVED
        </span>
      </div>
      <p class="text-[11px] text-slate-500">${s.contact_person || 'Representative'} • ${s.phone || 'N/A'}</p>
      <p class="text-[10px] text-slate-400 font-mono">${s.email || ''} ${s.gstin ? `• GSTIN: ${s.gstin}` : ''}</p>
    </div>
  `
    )
    .join('');
}

// 6. LOGOUT LISTENER
function initLogoutListener() {
  document.getElementById('btn-customer-logout')?.addEventListener('click', async () => {
    try {
      await fetch('/api/customer/logout', { method: 'POST' });
      window.location.href = '/customer/login';
    } catch (e) {
      window.location.href = '/customer/login';
    }
  });
}

