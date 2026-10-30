import React, { useEffect } from 'react';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'success' | 'danger' | 'warning';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<Props> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onCancel();
      if (e.key === 'Enter' && !isLoading && !e.shiftKey) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onConfirm, onCancel]);

  if (!isOpen) return null;

  let btnColor = 'bg-blue-600 hover:bg-blue-700 text-white';
  let icon = 'ℹ️';
  let iconBg = 'bg-blue-50 text-blue-600 border-blue-200';

  if (variant === 'success') {
    btnColor = 'bg-emerald-600 hover:bg-emerald-700 text-white';
    icon = '✅';
    iconBg = 'bg-emerald-50 text-emerald-600 border-emerald-200';
  } else if (variant === 'danger') {
    btnColor = 'bg-red-600 hover:bg-red-700 text-white';
    icon = '⚠️';
    iconBg = 'bg-red-50 text-red-600 border-red-200';
  } else if (variant === 'warning') {
    btnColor = 'bg-amber-600 hover:bg-amber-700 text-white';
    icon = '⚡';
    iconBg = 'bg-amber-50 text-amber-600 border-amber-200';
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 text-xs">
        <div className="flex items-start gap-3.5">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-lg flex-shrink-0 select-none ${iconBg}`}>
            {icon}
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight leading-snug">{title}</h3>
            <p className="text-slate-600 text-xs leading-relaxed whitespace-pre-line">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`px-5 py-2 ${btnColor} font-bold rounded-xl transition-colors shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50`}
          >
            {isLoading && (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            )}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

