import { showToast } from './toast.js';
import { playChime, initMuteButton } from './audio.js';

const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('key');
const pathParts = window.location.pathname.split('/').filter(Boolean);
const auctionId = pathParts[pathParts.length - 1] || 'NTA-EPACKPetro-07';

let currentRole = 'vendor';
let myCompanyName = '';
let myVendorId = '';
let lotsData = {};

const socket = io();

// Initialize Mute Button
initMuteButton('mute-btn');

// --- 1. CONNECTION & AUTH ---
socket.on('connect', () => {
  if (!token) {
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) timerDisplay.innerText = 'Key Missing';
    const tbody = document.getElementById('lots-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="9" class="py-12 text-center text-red-500 font-semibold">⚠️ Missing access key in URL. Please use your official invitation link.</td></tr>';
    }
    showToast('Missing access key in URL. Please use your valid Magic Link.', 'error');
    return;
  }
  socket.emit('join_room', { auctionId, token });
});

socket.on('connect_error', (err) => {
  console.warn('Socket connection error:', err);
  const timerDisplay = document.getElementById('timer-display');
  if (timerDisplay && timerDisplay.innerText === 'Connecting...') {
    timerDisplay.innerText = 'Reconnecting...';
  }
});

socket.on('room_joined', (data) => {
  currentRole = data.role;
  myCompanyName = data.companyName;
  myVendorId = data.vendorId || '';

  // Update Auction ID display in header
  const aucDisplay = document.getElementById('auction-id-display');
  if (aucDisplay) aucDisplay.innerText = data.auctionId || auctionId;

  // Seamlessly auto-redirect corporate customer observers to their dedicated executive spectator dashboard
  if (data.role === 'customer_observer') {
    window.location.replace(`/observer/${auctionId}?key=${encodeURIComponent(token)}`);
    return;
  }

  const compDisplay = document.getElementById('company-name-display');
  if (compDisplay) compDisplay.innerText = data.companyName;
  const roleBadge = document.getElementById('role-badge');
  if (roleBadge) roleBadge.innerText = 'Approved Bidder';

  renderLots(data.lots);
});

// --- 2. LIVE 1-SECOND TICKER ---
socket.on('clock_tick', (data) => {
  const el = document.getElementById('timer-display');
  if (el) el.innerText = data.formattedTime;
});

socket.on('auction_ended', () => {
  const el = document.getElementById('timer-display');
  if (el) {
    el.innerText = 'Auction Ended';
    el.parentElement?.classList.replace('bg-red-600', 'bg-slate-700');
  }
  showToast('This auction event has concluded.', 'warning');
});

// --- 3. RENDERING & STEPPER CONSTRAINTS ---
function calculateNextMaxBid(lot) {
  return lot.current_lowest_bid ? lot.current_lowest_bid - lot.bid_decrement : lot.start_price;
}

function renderLots(lots) {
  const tbody = document.getElementById('lots-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!lots || lots.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="py-12 text-center text-gray-400">No active tender items in this auction.</td></tr>';
    return;
  }

  lots.forEach((lot) => {
    lotsData[lot.id] = lot;
    lot.nextMaxBid = calculateNextMaxBid(lot);

    const lowestText = lot.current_lowest_bid ? `INR ${lot.current_lowest_bid.toLocaleString('en-IN')}` : 'INR —';

    const row = document.createElement('tr');
    row.id = `row-${lot.id}`;
    row.className = 'hover:bg-gray-50 transition-colors';
    row.innerHTML = `
      <td class="py-5 px-4 font-bold text-gray-900">${lot.product_name}</td>
      <td class="py-5 px-3"><span class="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded font-medium">${lot.category || 'Standard'}</span></td>
      <td class="py-5 px-3 font-semibold">${lot.quantity} - ${lot.uom}</td>
      <td class="py-5 px-3 text-gray-600">INR ${lot.reserve_price.toLocaleString('en-IN')}</td>
      <td class="py-5 px-3 text-gray-600">INR ${lot.bid_decrement}</td>
      <td class="py-5 px-4 text-center">
        <span id="lowest-${lot.id}" class="bg-[#1e2238] text-white font-bold px-4 py-2 rounded-full text-xs inline-block">
          ${lowestText}
        </span>
      </td>
      <td class="py-5 px-4 text-center">
        <span id="your-bid-${lot.id}" class="bg-red-600 text-white font-bold px-4 py-2 rounded-full text-xs inline-block">
          INR 0.00
        </span>
      </td>
      <td class="py-5 px-6 text-center">
        <span id="max-label-${lot.id}" class="text-[11px] font-bold text-blue-600 block mb-1">
          ↓ Max: INR ${lot.nextMaxBid.toLocaleString('en-IN')}
        </span>
        <div class="inline-flex items-center border border-gray-300 rounded overflow-hidden">
          <button data-action="decrement" data-lot="${lot.id}" class="px-3 py-1 bg-gray-100 hover:bg-gray-200 font-bold text-gray-700 select-none">-</button>
          <input id="input-${lot.id}" type="number" value="${lot.nextMaxBid}" class="w-24 text-center py-1 text-sm font-bold text-gray-800 outline-none" />
          <button id="plus-btn-${lot.id}" data-action="increment" data-lot="${lot.id}" class="px-3 py-1 bg-gray-100 hover:bg-gray-200 font-bold text-gray-700 select-none">+</button>
        </div>
      </td>
      <td class="py-5 px-4 text-center">
        <button id="submit-btn-${lot.id}" data-action="submit" data-lot="${lot.id}" class="bg-[#1e2238] hover:bg-slate-800 text-white font-bold text-xs px-6 py-2.5 rounded shadow active:scale-95 transition-transform">
          Submit
        </button>
      </td>
    `;
    tbody.appendChild(row);
    updateStepperState(lot.id);
  });
}

// --- EVENT DELEGATION FOR STEPPER & SUBMIT ---
document.addEventListener('click', (e) => {
  const target = e.target;
  const action = target.getAttribute('data-action');
  const lotId = target.getAttribute('data-lot');
  if (!action || !lotId) return;

  const lot = lotsData[lotId];
  if (!lot) return;
  const input = document.getElementById(`input-${lotId}`);

  if (action === 'decrement') {
    let nextVal = (parseFloat(input.value) || 0) - lot.bid_decrement;
    if (nextVal > 0) input.value = nextVal;
    updateStepperState(lotId);
  } else if (action === 'increment') {
    let nextVal = (parseFloat(input.value) || 0) + lot.bid_decrement;
    if (nextVal > lot.nextMaxBid) {
      showToast(`Cannot increase bid above maximum allowed of ₹${lot.nextMaxBid.toLocaleString('en-IN')}`, 'warning');
      return;
    }
    input.value = nextVal;
    updateStepperState(lotId);
  } else if (action === 'submit') {
    const amount = parseFloat(input.value);
    if (!amount || amount <= 0) {
      showToast('Please enter a valid bid amount greater than zero.', 'error');
      return;
    }
    if (amount > lot.nextMaxBid) {
      showToast(`Bid exceeds maximum allowed bid of ₹${lot.nextMaxBid.toLocaleString('en-IN')}.`, 'error');
      return;
    }
    socket.emit('submit_bid', { lotId, amount });
  }
});

function updateStepperState(lotId) {
  const lot = lotsData[lotId];
  if (!lot) return;
  const input = document.getElementById(`input-${lotId}`);
  const plusBtn = document.getElementById(`plus-btn-${lotId}`);
  const submitBtn = document.getElementById(`submit-btn-${lotId}`);
  if (!input || !plusBtn || !submitBtn) return;

  const val = parseFloat(input.value) || 0;

  // Strict clamp on '+' button
  if (val >= lot.nextMaxBid) {
    plusBtn.disabled = true;
    plusBtn.className = 'px-3 py-1 bg-gray-50 text-gray-300 cursor-not-allowed font-bold';
  } else {
    plusBtn.disabled = false;
    plusBtn.className = 'px-3 py-1 bg-gray-100 hover:bg-gray-200 font-bold text-gray-700 select-none';
  }

  // Strict clamp on Submit button
  if (val > lot.nextMaxBid || val <= 0) {
    submitBtn.disabled = true;
    submitBtn.className = 'bg-gray-300 text-gray-500 font-bold text-xs px-6 py-2.5 rounded cursor-not-allowed';
  } else {
    submitBtn.disabled = false;
    submitBtn.className = 'bg-[#1e2238] hover:bg-slate-800 text-white font-bold text-xs px-6 py-2.5 rounded shadow active:scale-95 transition-transform';
  }
}

// --- 4. WEBSOCKET BROADCAST EVENTS ---
socket.on('bid_placed', (data) => {
  playChime(850, 0.12);

  const lot = lotsData[data.lotId];
  if (lot) {
    lot.current_lowest_bid = data.amount;
    lot.nextMaxBid = data.newMaxAllowedBid;
  }

  const lowestPill = document.getElementById(`lowest-${data.lotId}`);
  if (lowestPill) {
    lowestPill.innerText = `INR ${data.amount.toLocaleString('en-IN')}`;
    lowestPill.classList.add('ring-4', 'ring-emerald-400');
    setTimeout(() => lowestPill.classList.remove('ring-4', 'ring-emerald-400'), 1500);
  }

  const maxLabel = document.getElementById(`max-label-${data.lotId}`);
  if (maxLabel) {
    maxLabel.innerText = `↓ Max: INR ${data.newMaxAllowedBid.toLocaleString('en-IN')}`;
  }

  const input = document.getElementById(`input-${data.lotId}`);
  if (input) {
    input.value = data.newMaxAllowedBid;
    updateStepperState(data.lotId);
  }

  if (data.vendorCompanyName === myCompanyName) {
    showToast(`You are now the lowest bidder (L1) at ₹${data.amount.toLocaleString('en-IN')}!`, 'success');
    const yourBidPill = document.getElementById(`your-bid-${data.lotId}`);
    if (yourBidPill) {
      yourBidPill.innerText = `INR ${data.amount.toLocaleString('en-IN')} (L1)`;
      yourBidPill.className = 'bg-emerald-600 text-white font-bold px-4 py-2 rounded-full text-xs inline-block ring-2 ring-emerald-300';
    }
  }
});

socket.on('outbid_alert', (data) => {
  // Only display outbid alert if this vendor was the one who got outbid
  if (myVendorId && data.outbidVendorId && data.outbidVendorId !== myVendorId) {
    return;
  }

  playChime(320, 0.35);
  showToast(`Warning: You have been outbid on ${data.lotId}! New lowest price is ₹${data.newLowestBid.toLocaleString('en-IN')}`, 'warning');

  const yourBidPill = document.getElementById(`your-bid-${data.lotId}`);
  if (yourBidPill) {
    yourBidPill.innerText = 'OUTBID!';
    yourBidPill.className = 'bg-amber-500 text-white font-black px-4 py-2 rounded-full text-xs inline-block animate-pulse';
  }
});

socket.on('error_message', (err) => {
  const timerDisplay = document.getElementById('timer-display');
  if (timerDisplay) timerDisplay.innerText = 'Access Denied';
  const compDisplay = document.getElementById('company-name-display');
  if (compDisplay) compDisplay.innerText = 'Unauthorized';
  const tbody = document.getElementById('lots-table-body');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="9" class="py-12 text-center text-red-500 font-semibold">⚠️ ${err.message || 'Access Denied'}</td></tr>`;
  }
  showToast(err.message, 'error');
});
