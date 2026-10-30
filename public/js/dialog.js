/**
 * NexTrade Universal Enterprise Dialog System
 * Replaces native browser alert(), confirm(), and prompt() with sleek, accessible modal dialogs.
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ensureStyles() {
  if (document.getElementById('nta-dialog-style')) return;
  const style = document.createElement('style');
  style.id = 'nta-dialog-style';
  style.textContent = `
    @keyframes ntaFadeIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .nta-animate-pop {
      animation: ntaFadeIn 0.16s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Show a sleek confirmation dialog. Returns Promise<boolean>.
 */
export function showConfirmDialog({
  title = 'Confirmation Required',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  icon = '⚠️',
  variant = 'primary', // 'primary' | 'danger' | 'success'
} = {}) {
  ensureStyles();
  return new Promise((resolve) => {
    // Remove any existing active dialog
    document.getElementById('nta-active-dialog')?.remove();

    let btnColor = 'bg-blue-600 hover:bg-blue-700 text-white';
    if (variant === 'danger') {
      btnColor = 'bg-red-600 hover:bg-red-700 text-white';
    } else if (variant === 'success') {
      btnColor = 'bg-emerald-600 hover:bg-emerald-700 text-white';
    }

    const backdrop = document.createElement('div');
    backdrop.id = 'nta-active-dialog';
    backdrop.className =
      'fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-150';
    backdrop.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 transform transition-all text-xs nta-animate-pop">
        <div class="flex items-start gap-3">
          <div class="text-3xl flex-shrink-0 select-none">${icon}</div>
          <div class="flex-1 space-y-1">
            <h3 class="text-base font-bold text-slate-900 tracking-tight leading-snug">${escapeHtml(title)}</h3>
            <p class="text-slate-600 text-xs leading-relaxed whitespace-pre-line">${escapeHtml(message)}</p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button id="nta-dlg-cancel" type="button" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">
            ${escapeHtml(cancelText)}
          </button>
          <button id="nta-dlg-confirm" type="button" class="px-5 py-2 ${btnColor} font-bold rounded-xl transition-colors shadow-sm">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const cleanup = (result) => {
      document.removeEventListener('keydown', onKeyDown);
      backdrop.classList.add('opacity-0');
      setTimeout(() => backdrop.remove(), 150);
      resolve(result);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    };

    document.addEventListener('keydown', onKeyDown);

    backdrop.querySelector('#nta-dlg-confirm')?.addEventListener('click', () => cleanup(true));
    backdrop.querySelector('#nta-dlg-cancel')?.addEventListener('click', () => cleanup(false));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup(false);
    });

    // Auto-focus confirm button
    setTimeout(() => {
      backdrop.querySelector('#nta-dlg-confirm')?.focus();
    }, 50);
  });
}

/**
 * Show a sleek text prompt dialog. Returns Promise<string | null>.
 */
export function showPromptDialog({
  title = 'Input Required',
  message = 'Please provide details below:',
  placeholder = '',
  defaultValue = '',
  confirmText = 'Submit',
  cancelText = 'Cancel',
  icon = '✏️',
  required = true,
} = {}) {
  ensureStyles();
  return new Promise((resolve) => {
    document.getElementById('nta-active-dialog')?.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'nta-active-dialog';
    backdrop.className =
      'fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-150';
    backdrop.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 transform transition-all text-xs nta-animate-pop">
        <div class="flex items-start gap-3">
          <div class="text-3xl flex-shrink-0 select-none">${icon}</div>
          <div class="flex-1 space-y-1">
            <h3 class="text-base font-bold text-slate-900 tracking-tight leading-snug">${escapeHtml(title)}</h3>
            <p class="text-slate-600 text-xs leading-relaxed">${escapeHtml(message)}</p>
          </div>
        </div>

        <div class="space-y-1">
          <textarea 
            id="nta-dlg-input" 
            placeholder="${escapeHtml(placeholder)}" 
            rows="3" 
            class="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >${escapeHtml(defaultValue)}</textarea>
          <span id="nta-dlg-error" class="hidden text-red-500 text-[11px] font-semibold">This field is required.</span>
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button id="nta-dlg-cancel" type="button" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">
            ${escapeHtml(cancelText)}
          </button>
          <button id="nta-dlg-confirm" type="button" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-sm">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const input = backdrop.querySelector('#nta-dlg-input');
    const errorEl = backdrop.querySelector('#nta-dlg-error');

    const cleanup = (val) => {
      document.removeEventListener('keydown', onKeyDown);
      backdrop.classList.add('opacity-0');
      setTimeout(() => backdrop.remove(), 150);
      resolve(val);
    };

    const trySubmit = () => {
      const val = input.value.trim();
      if (required && !val) {
        errorEl?.classList.remove('hidden');
        input.focus();
        return;
      }
      cleanup(val || null);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') cleanup(null);
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) trySubmit();
    };

    document.addEventListener('keydown', onKeyDown);

    backdrop.querySelector('#nta-dlg-confirm')?.addEventListener('click', trySubmit);
    backdrop.querySelector('#nta-dlg-cancel')?.addEventListener('click', () => cleanup(null));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup(null);
    });

    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  });
}
