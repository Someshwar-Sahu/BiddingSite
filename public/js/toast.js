/**
 * In-Page Toast Notification System
 * Replaces intrusive browser alert() popups.
 */
export function showToast(message, type = 'error') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none';
    document.body.appendChild(container);
  }

  const bgColors = {
    error: 'bg-red-600 text-white border-red-700',
    warning: 'bg-amber-500 text-white border-amber-600',
    success: 'bg-emerald-600 text-white border-emerald-700',
  };

  const icons = {
    error: '⚠️',
    warning: '⚡',
    success: '✅',
  };

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl text-sm font-semibold border transition-all duration-300 transform translate-y-0 ${bgColors[type] || bgColors.error}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span class="flex-1">${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}