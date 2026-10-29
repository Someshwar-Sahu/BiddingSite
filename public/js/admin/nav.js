/**
 * Shared Admin Top Navigation Bar
 * Dynamically rendered to ensure consistent UI across all admin pages.
 */
export function renderAdminNav(activeKey) {
  const header = document.getElementById('admin-header');
  if (!header) return;

  const navItems = [
    { key: 'auctions', label: '📋 Auctions Manager', href: '/admin/auctions' },
    { key: 'editor', label: '➕ Auction Builder', href: '/admin/auction-editor' },
    { key: 'clients', label: '🏢 Corporate Clients', href: '/admin/clients' },
    { key: 'vendors', label: '👥 Vendor Pool & KYC', href: '/admin/vendors' },
  ];

  header.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <a href="/admin/auctions" class="flex items-center gap-2 hover:opacity-90 transition-opacity">
          <div class="bg-blue-600 text-white font-black px-2.5 py-1 rounded text-xs tracking-wider">NTA</div>
          <span class="text-base font-bold text-white tracking-tight">NexTrade <span class="text-blue-400 font-normal">Auctions</span></span>
        </a>
      </div>

      <nav class="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg text-xs font-semibold">
        ${navItems
          .map(
            (item) => `
          <a href="${item.href}" class="px-3.5 py-1.5 rounded-md transition-colors ${
              activeKey === item.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }">
            ${item.label}
          </a>
        `
          )
          .join('')}
      </nav>

      <div class="hidden sm:flex items-center gap-2 text-xs text-slate-300">
        <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>Railway Node Active</span>
      </div>
    </div>
  `;
}
