import { showToast } from './toast.js';
import { playChime, initMuteButton } from './audio.js';

const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('key');
const pathParts = window.location.pathname.split('/').filter(Boolean);
const auctionId = pathParts[pathParts.length - 1] || 'NTA-EPACKPetro-07';

let lotsData = {};
let totalBidsCount = 0;
let currentAuctionStatus = 'scheduled';

const socket = io();

// Initialize sound button
initMuteButton('mute-btn');

document.addEventListener('DOMContentLoaded', async () => {
  await loadInitialRoomState();
  connectWebSocket();
});

// --- 1. INITIAL REST HYDRATION ---
async function loadInitialRoomState() {
  try {
    const res = await fetch(`/api/auctions/${auctionId}/room-state`);
    if (!res.ok) throw new Error('Auction room not found');
    const data = await res.json();

    const { auction, lots, bids } = data;
    currentAuctionStatus = auction.status;

    // Buyer name & status
    const buyerDisplay = document.getElementById('buyer-company-name');
    if (buyerDisplay) {
      buyerDisplay.innerText = `Corporate Buyer: ${auction.customer_name || 'Direct Enterprise'}`;
    }

    updateStatusBadge(auction.status);

    // Setup PDF report link if concluded
    if (auction.status === 'ended') {
      showSettlementBanner();
    }

    // Populate lots
    renderLots(lots || []);

    // Populate past bid history into the audit feed
    if (Array.isArray(bids) && bids.length > 0) {
      totalBidsCount = bids.length;
      renderInitialBids(bids);
    }

    recalculateKPIs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- 2. WEBSOCKET REAL-TIME CONNECTION ---
function connectWebSocket() {
  socket.on('connect', () => {
    if (!token) {
      showToast('Missing access key in URL. Please open this link with your valid Observer Magic Link.', 'error');
      return;
    }
    socket.emit('join_room', { auctionId, token });
  });

  socket.on('connect_error', (err) => {
    console.warn('Observer socket connection error:', err);
  });

  socket.on('room_joined', (data) => {
    // Preserve true auction status from server payload or REST
    const status = data.status || currentAuctionStatus || 'scheduled';
    currentAuctionStatus = status;
    updateStatusBadge(status);

    if (data.lots && data.lots.length > 0) {
      renderLots(data.lots);
      recalculateKPIs();
    }
  });

  // 1-second Clock Ticker
  socket.on('clock_tick', (data) => {
    currentAuctionStatus = data.status;
    const clockEl = document.getElementById('clock-display');
    if (clockEl && data.status !== 'ended') {
      clockEl.innerText = data.formattedTime;
    }
    updateStatusBadge(data.status);

    if (data.status === 'ended') {
      showSettlementBanner();
    }
  });

  // Live Bid Broadcast
  socket.on('bid_placed', (data) => {
    playChime(750, 0.15);
    totalBidsCount++;

    const lot = lotsData[data.lotId];
    if (lot) {
      const prevBid = lot.current_lowest_bid || lot.start_price;
      const deltaDrop = prevBid - data.amount;

      lot.current_lowest_bid = data.amount;
      lot.current_l1_vendor_name = data.vendorCompanyName || 'Confidential Bidder';

      // Update table row
      updateLotRow(lot);

      // Append to live audit feed
      appendAuditCard({
        product_name: lot.product_name,
        vendor_name: data.vendorCompanyName || 'Supplier',
        amount: data.amount,
        deltaDrop,
        uom: lot.uom,
        timestamp: data.timestamp || new Date().toISOString(),
      });
    }

    recalculateKPIs();
  });

  // Anti-Sniping Soft-Close Extension Alert
  socket.on('auction_extended', () => {
    playChime(440, 0.4);
    showToast('⚡ Dynamic Anti-Sniping triggered: Tender clock extended by 3 minutes!', 'warning');
    currentAuctionStatus = 'extended';
    updateStatusBadge('extended');
  });

  // Auction Concluded
  socket.on('auction_ended', () => {
    currentAuctionStatus = 'ended';
    updateStatusBadge('ended');
    showSettlementBanner();
    showToast('Tender concluded. Final L1 prices locked for settlement.', 'success');
  });

  socket.on('error_message', (err) => {
    showToast(err.message, 'error');
  });
}

// --- 3. RENDERING LOTS & AUDIT FEED ---
function renderLots(lots) {
  const tbody = document.getElementById('observer-lots-tbody');
  const countBadge = document.getElementById('lots-count-badge');
  if (!tbody) return;

  if (countBadge) countBadge.innerText = `${lots.length} Lot(s)`;
  tbody.innerHTML = '';

  if (!lots || lots.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-slate-400 font-medium">
          No procurement tender items loaded for this event.
        </td>
      </tr>
    `;
    return;
  }

  lots.forEach((lot) => {
    lotsData[lot.id] = lot;

    const row = document.createElement('tr');
    row.id = `observer-row-${lot.id}`;
    row.className = 'hover:bg-slate-50 transition-colors border-b border-slate-100';
    tbody.appendChild(row);

    updateLotRow(lot);
  });
}

function updateLotRow(lot) {
  const row = document.getElementById(`observer-row-${lot.id}`);
  if (!row) return;

  const lowestText = lot.current_lowest_bid
    ? `₹${lot.current_lowest_bid.toLocaleString('en-IN')}`
    : '<span class="text-slate-400">Awaiting Bid</span>';

  const supplierText = lot.current_l1_vendor_name
    ? `<span class="font-bold text-slate-800">${lot.current_l1_vendor_name}</span>`
    : '<span class="text-slate-400 italic">None</span>';

  let lotSavings = 0;
  if (lot.current_lowest_bid && lot.current_lowest_bid < lot.reserve_price) {
    lotSavings = (lot.reserve_price - lot.current_lowest_bid) * lot.quantity;
  }

  row.innerHTML = `
    <td class="p-3.5">
      <strong class="text-slate-900 font-semibold block">${lot.product_name}</strong>
      <span class="text-[10px] text-slate-400 font-mono">${lot.id}</span>
    </td>

    <td class="p-3.5 font-semibold text-slate-700">
      ${lot.quantity} ${lot.uom}
    </td>

    <td class="p-3.5 font-mono text-slate-600">
      ₹${lot.reserve_price.toLocaleString('en-IN')}
    </td>

    <td class="p-3.5 text-center">
      <span id="lowest-pill-${lot.id}" class="bg-[#1e2238] text-white font-mono font-bold px-3.5 py-1.5 rounded-full text-xs inline-block transition-all duration-300">
        ${lowestText}
      </span>
    </td>

    <td class="p-3.5">
      ${supplierText}
    </td>

    <td class="p-3.5 text-right font-mono font-bold ${lotSavings > 0 ? 'text-emerald-600' : 'text-slate-400'}">
      ${lotSavings > 0 ? `+ ₹${lotSavings.toLocaleString('en-IN')}` : '₹0'}
    </td>
  `;

  // Flash ring animation
  const pill = document.getElementById(`lowest-pill-${lot.id}`);
  if (pill && lot.current_lowest_bid) {
    pill.classList.add('ring-4', 'ring-emerald-400');
    setTimeout(() => pill.classList.remove('ring-4', 'ring-emerald-400'), 1200);
  }
}

// --- 4. AUDIT FEED RENDERER ---
function renderInitialBids(bids) {
  const container = document.getElementById('audit-feed');
  if (!container) return;

  container.innerHTML = bids
    .map((b) => {
      const time = new Date(b.created_at).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return `
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
        <div class="flex items-center justify-between">
          <strong class="text-slate-800 font-bold">${b.vendor_name || 'Approved Supplier'}</strong>
          <span class="text-[10px] font-mono text-slate-400">${time}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500">${b.product_name}</span>
          <span class="font-mono font-bold text-slate-900">₹${b.amount.toLocaleString('en-IN')} / ${b.uom}</span>
        </div>
      </div>
    `;
    })
    .join('');
}

function appendAuditCard(data) {
  const container = document.getElementById('audit-feed');
  if (!container) return;

  const time = new Date(data.timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const card = document.createElement('div');
  card.className = 'p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1 animate-fadeIn transition-all';
  card.innerHTML = `
    <div class="flex items-center justify-between">
      <strong class="text-slate-900 font-bold">${data.vendor_name}</strong>
      <span class="text-[10px] font-mono text-slate-500">${time}</span>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-slate-600">${data.product_name}</span>
      <span class="font-mono font-bold text-emerald-700">₹${data.amount.toLocaleString('en-IN')} / ${data.uom}</span>
    </div>
    ${
      data.deltaDrop > 0
        ? `<div class="text-[10px] text-emerald-800 font-semibold text-right">↓ Decrement drop: ₹${data.deltaDrop.toLocaleString('en-IN')}</div>`
        : ''
    }
  `;

  container.prepend(card);
}

// --- 5. KPI CALCULATIONS ---
function recalculateKPIs() {
  let totalReserveBudget = 0;
  let totalCommittedSpend = 0;
  let totalSavings = 0;

  Object.values(lotsData).forEach((lot) => {
    const baseline = lot.reserve_price * lot.quantity;
    totalReserveBudget += baseline;

    if (lot.current_lowest_bid) {
      const currentSpend = lot.current_lowest_bid * lot.quantity;
      totalCommittedSpend += currentSpend;
      if (lot.current_lowest_bid < lot.reserve_price) {
        totalSavings += baseline - currentSpend;
      }
    } else {
      totalCommittedSpend += baseline;
    }
  });

  const savingsPct = totalReserveBudget > 0 ? ((totalSavings / totalReserveBudget) * 100).toFixed(1) : '0.0';

  const savingsEl = document.getElementById('kpi-total-savings');
  const savingsPctEl = document.getElementById('kpi-savings-pct');
  const spendEl = document.getElementById('kpi-current-spend');
  const budgetEl = document.getElementById('kpi-baseline-budget');
  const bidsCountEl = document.getElementById('kpi-total-bids');

  if (savingsEl) savingsEl.innerText = `₹${totalSavings.toLocaleString('en-IN')}`;
  if (savingsPctEl) savingsPctEl.innerText = `${savingsPct}% Savings`;
  if (spendEl) spendEl.innerText = `₹${totalCommittedSpend.toLocaleString('en-IN')}`;
  if (budgetEl) budgetEl.innerText = `₹${totalReserveBudget.toLocaleString('en-IN')}`;
  if (bidsCountEl) bidsCountEl.innerText = totalBidsCount;
}

function updateStatusBadge(status) {
  const badge = document.getElementById('auction-status-badge');
  const clockContainer = document.getElementById('clock-container');
  const clockEl = document.getElementById('clock-display');
  if (!badge) return;

  const isEnded = status === 'ended';

  const statusStyles = {
    live: 'bg-emerald-950 text-emerald-300 border-emerald-700 animate-pulse',
    extended: 'bg-amber-950 text-amber-300 border-amber-700 animate-pulse',
    scheduled: 'bg-blue-950 text-blue-300 border-blue-700',
    ended: 'bg-slate-800 text-slate-300 border-slate-700',
  };

  badge.className = `text-xs font-bold px-3 py-1.5 rounded-lg border uppercase ${
    statusStyles[status] || statusStyles.scheduled
  }`;
  badge.innerText = isEnded ? 'CONCLUDED' : (status || 'SCHEDULED');

  if (isEnded) {
    if (clockEl) clockEl.innerText = 'Concluded';
    if (clockContainer) {
      clockContainer.className = 'bg-slate-800 text-slate-300 font-mono font-bold px-4 py-1.5 rounded-lg text-sm border border-slate-700 flex items-center gap-1.5';
    }
    showSettlementBanner();
  } else {
    if (clockContainer) {
      clockContainer.className = 'bg-red-600/90 text-white font-mono font-bold px-4 py-1.5 rounded-lg text-sm shadow flex items-center gap-1.5';
    }
  }
}

function showSettlementBanner() {
  const banner = document.getElementById('settlement-banner');
  const btn = document.getElementById('btn-download-pdf');
  if (banner) banner.classList.remove('hidden');
  if (btn) btn.href = `/api/admin/auctions/${auctionId}/pdf`;
}
