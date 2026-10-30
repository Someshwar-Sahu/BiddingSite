import React, { useState } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationItem } from '../types/procurement';

interface Props {
  realm: 'admin' | 'customer';
  onNavigate?: (url: string) => void;
}

export const NotificationBell: React.FC<Props> = ({ realm, onNavigate }) => {
  const { notifications, unreadCount, markAllRead } = useNotifications(realm);
  const [isOpen, setIsOpen] = useState(false);

  const handleNotificationClick = async (notif: NotificationItem) => {
    try {
      await fetch(`/api/notifications/${notif.id}/read?realm=${realm}`, { method: 'POST' });
    } catch (_) {}
    setIsOpen(false);
    if (notif.target_url) {
      if (onNavigate) {
        onNavigate(notif.target_url);
      } else {
        window.location.href = notif.target_url;
      }
    }
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors focus:outline-none flex items-center justify-center cursor-pointer"
        title="Notifications"
      >
        <span className="text-base select-none">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full ring-2 ring-slate-900 leading-tight animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden text-xs text-slate-800">
          <div className="p-3 bg-[#1e2238] text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2 font-bold text-xs">
              <span>🔔</span> {realm === 'admin' ? 'Desk Operations Feed' : 'Official Notifications'}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] text-blue-300 hover:text-white font-semibold hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <span className="text-xl block mb-1">📭</span>
                No notifications right now.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 ${
                    n.is_read ? 'opacity-70 bg-white' : 'bg-blue-50/60'
                  }`}
                >
                  <span className="text-lg flex-shrink-0 mt-0.5">⚡</span>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <strong className="font-bold text-slate-900 leading-snug">{n.title}</strong>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{n.message}</p>
                  </div>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 flex-shrink-0"></span>}
                </div>
              ))
            )}
          </div>

          <div className="p-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 px-3">
            <span>NexTrade Real-Time Ledger</span>
            <span className="text-emerald-600 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Connected
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

