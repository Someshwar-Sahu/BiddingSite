/**
 * NexTrade Universal Real-Time Notification Widget
 * Provides interactive persistent notifications drawer + live slide-in pop-up cards.
 */

let socket = null;
let notifications = [];
let unreadCount = 0;
let isDropdownOpen = false;
let currentRealm = 'customer';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function getIconForType(type) {
  switch (type) {
    case 'tender_request_new':
      return '📥';
    case 'tender_request_revised':
      return '⚡';
    case 'tender_request_approved':
      return '✅';
    case 'tender_request_rejected':
      return '❌';
    case 'amendment_request':
      return '📝';
    case 'amendment_decision':
      return '⚖️';
    case 'auction_live':
      return '🚀';
    case 'auction_concluded':
      return '🏆';
    default:
      return '🔔';
  }
}

export function initNotificationWidget(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  currentRealm = options.realm || (window.location.pathname.startsWith('/admin') ? 'admin' : 'customer');

  container.innerHTML = `
    <div class="relative inline-block text-left" id="nta-notif-root">
      <button id="nta-notif-btn" type="button" class="relative p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors focus:outline-none flex items-center justify-center" title="Notifications">
        <span class="text-base select-none">🔔</span>
        <span id="nta-notif-badge" class="hidden absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full ring-2 ring-slate-900 leading-tight">
          0
        </span>
      </button>

      <!-- Dropdown Drawer -->
      <div id="nta-notif-drawer" class="hidden absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden text-xs text-slate-800 animate-fadeIn">
        <div class="p-3 bg-[#1e2238] text-white flex items-center justify-between border-b border-slate-800">
          <div class="flex items-center gap-2 font-bold text-xs">
            <span>🔔</span> ${currentRealm === 'admin' ? 'Desk Operations Log' : 'Official Notifications'}
          </div>
          <button id="nta-notif-mark-read" type="button" class="text-[11px] text-blue-300 hover:text-white font-semibold hover:underline">
            Mark all read
          </button>
        </div>

        <div id="nta-notif-list" class="max-h-80 overflow-y-auto divide-y divide-slate-100">
          <div class="p-6 text-center text-slate-400">Loading notifications...</div>
        </div>

        <div class="p-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 px-3">
          <span>NexTrade Real-Time Ledger</span>
          <span class="text-emerald-600 font-semibold flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Connected
          </span>
        </div>
      </div>
    </div>

    <!-- Live Toast Container (Bottom-Right fixed) -->
    <div id="nta-toast-live-container" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none"></div>
  `;

  const btn = document.getElementById('nta-notif-btn');
  const drawer = document.getElementById('nta-notif-drawer');
  const markReadBtn = document.getElementById('nta-notif-mark-read');

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    isDropdownOpen = !isDropdownOpen;
    if (isDropdownOpen) {
      drawer?.classList.remove('hidden');
      renderNotificationList();
    } else {
      drawer?.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#nta-notif-root')) {
      isDropdownOpen = false;
      drawer?.classList.add('hidden');
    }
  });

  markReadBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await markAllAsRead();
  });

  // Load existing notifications
  fetchNotifications();

  // Connect WebSocket listener
  setupSocketListener();
}

async function fetchNotifications() {
  try {
    const res = await fetch(`/api/notifications?realm=${encodeURIComponent(currentRealm)}`, {
      headers: { 'X-NTA-Realm': currentRealm }
    });
    if (res.status === 401) {
      // Unauthenticated or logged out: hide badge and keep drawer inactive
      notifications = [];
      unreadCount = 0;
      updateBadgeUI();
      if (socket) {
        socket.emit('disconnect_notifications');
        socket.disconnect();
      }
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    notifications = data.notifications || [];
    unreadCount = data.unreadCount || 0;
    updateBadgeUI();
  } catch (err) {
    console.warn('Failed to load notifications:', err);
  }
}

function updateBadgeUI() {
  const badge = document.getElementById('nta-notif-badge');
  if (!badge) return;

  if (unreadCount > 0) {
    badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderNotificationList() {
  const listContainer = document.getElementById('nta-notif-list');
  if (!listContainer) return;

  if (notifications.length === 0) {
    listContainer.innerHTML = `
      <div class="p-8 text-center text-slate-400 text-xs">
        <span class="text-2xl block mb-1">📭</span>
        No notifications yet.
      </div>
    `;
    return;
  }

  listContainer.innerHTML = notifications
    .map(
      (n) => `
    <div 
      onclick="window.handleNotificationClick('${n.id}', '${n.target_url || ''}')"
      class="p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 text-xs ${
        n.is_read ? 'opacity-75 bg-white' : 'bg-blue-50/50'
      }"
    >
      <span class="text-lg flex-shrink-0 mt-0.5">${getIconForType(n.type)}</span>
      <div class="flex-1 space-y-1">
        <div class="flex items-center justify-between gap-1">
          <strong class="font-bold text-slate-900 leading-snug">${escapeHtml(n.title)}</strong>
          <span class="text-[10px] text-slate-400 whitespace-nowrap">${timeAgo(n.created_at)}</span>
        </div>
        <p class="text-[11px] text-slate-600 leading-relaxed">${escapeHtml(n.message)}</p>
      </div>
      ${!n.is_read ? '<span class="w-2 h-2 rounded-full bg-blue-600 mt-1.5 flex-shrink-0"></span>' : ''}
    </div>
  `
    )
    .join('');
}

window.handleNotificationClick = async (notifId, targetUrl) => {
  try {
    await fetch(`/api/notifications/${notifId}/read?realm=${encodeURIComponent(currentRealm)}`, {
      method: 'POST',
      headers: { 'X-NTA-Realm': currentRealm }
    });
    const notif = notifications.find((n) => n.id === notifId);
    if (notif && !notif.is_read) {
      notif.is_read = 1;
      unreadCount = Math.max(0, unreadCount - 1);
      updateBadgeUI();
      renderNotificationList();
    }
  } catch (e) {}

  if (targetUrl) {
    // Close dropdown drawer
    isDropdownOpen = false;
    document.getElementById('nta-notif-drawer')?.classList.add('hidden');

    try {
      const parsedTarget = new URL(targetUrl, window.location.origin);
      const isSamePath = parsedTarget.pathname === window.location.pathname;

      if (isSamePath) {
        // Already on the same page: update URL search params and trigger deep linking without full reload
        window.history.pushState({}, '', targetUrl);
        if (typeof window.handleUrlDeepLinks === 'function') {
          window.handleUrlDeepLinks();
          return;
        }
      }
    } catch (_) {}

    window.location.href = targetUrl;
  }
};

async function markAllAsRead() {
  try {
    await fetch(`/api/notifications/mark-all-read?realm=${encodeURIComponent(currentRealm)}`, {
      method: 'POST',
      headers: { 'X-NTA-Realm': currentRealm }
    });
    notifications.forEach((n) => (n.is_read = 1));
    unreadCount = 0;
    updateBadgeUI();
    renderNotificationList();
  } catch (err) {
    console.warn('Failed to mark notifications read:', err);
  }
}

function setupSocketListener() {
  if (typeof io === 'undefined') return;

  if (socket) {
    socket.disconnect();
  }

  socket = io({
    auth: {
      realm: currentRealm,
    },
    query: {
      realm: currentRealm,
    },
  });

  socket.on('connect', () => {
    socket.emit('authenticate_notifications', { realm: currentRealm });
  });

  socket.on('new_notification', (notif) => {
    // Client-side guard: verify this notification is intended for this realm
    if (currentRealm === 'admin' && notif.recipient_role !== 'admin' && notif.recipient_role !== 'all') {
      return;
    }
    if (currentRealm === 'customer' && notif.recipient_role !== 'customer' && notif.recipient_role !== 'all') {
      return;
    }

    notifications.unshift(notif);
    unreadCount++;
    updateBadgeUI();

    if (isDropdownOpen) {
      renderNotificationList();
    }

    // Trigger live slide-in pop-up card
    showLivePopup(notif);
  });
}

function showLivePopup(notif) {
  // Client-side guard: never render toast if not for this realm
  if (currentRealm === 'admin' && notif.recipient_role !== 'admin' && notif.recipient_role !== 'all') {
    return;
  }
  if (currentRealm === 'customer' && notif.recipient_role !== 'customer' && notif.recipient_role !== 'all') {
    return;
  }

  const container = document.getElementById('nta-toast-live-container');
  if (!container) return;

  const card = document.createElement('div');
  card.className =
    'pointer-events-auto bg-[#1e2238] text-white p-4 rounded-xl shadow-2xl border border-slate-700 space-y-2 transform transition-all duration-300 translate-y-4 opacity-0 text-xs w-80 sm:w-88 cursor-pointer hover:border-slate-500';
  card.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="text-base">${getIconForType(notif.type)}</span>
        <strong class="font-bold text-white text-xs leading-tight">${escapeHtml(notif.title)}</strong>
      </div>
      <button type="button" class="text-slate-400 hover:text-white font-bold p-0.5 text-sm" onclick="event.stopPropagation(); this.closest('.pointer-events-auto').remove()">✕</button>
    </div>
    <p class="text-[11px] text-slate-300 leading-snug">${escapeHtml(notif.message)}</p>
    ${
      notif.target_url
        ? `<div class="pt-1 flex justify-end">
            <button type="button" class="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] px-3 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer">
              <span>View</span> &rarr;
            </button>
          </div>`
        : ''
    }
  `;

  // Clicking anywhere on card triggers notification action
  card.addEventListener('click', (e) => {
    if (e.target.closest('button[onclick]')) return;
    window.handleNotificationClick(notif.id, notif.target_url || '');
    card.remove();
  });

  container.appendChild(card);

  requestAnimationFrame(() => {
    card.classList.remove('translate-y-4', 'opacity-0');
  });

  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    card.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => card.remove(), 300);
  }, 8000);
}

export function disconnectNotificationWidget() {
  if (socket) {
    socket.emit('disconnect_notifications');
    socket.disconnect();
    socket = null;
  }
  notifications = [];
  unreadCount = 0;
  updateBadgeUI();
}
window.disconnectNotificationWidget = disconnectNotificationWidget;

