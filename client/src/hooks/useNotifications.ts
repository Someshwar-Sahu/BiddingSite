import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { NotificationItem } from '../types/procurement';

export function useNotifications(realm: 'admin' | 'customer') {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // 1. Fetch persistent history
    fetch(`/api/notifications?realm=${realm}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      });

    // 2. Connect WebSocket with declared realm auth
    const socket: Socket = io({ auth: { realm }, query: { realm } });
    socket.emit('authenticate_notifications', { realm });

    socket.on('new_notification', (notif: NotificationItem) => {
      // Client-side guard
      if (realm === 'admin' && notif.recipient_role !== 'admin' && notif.recipient_role !== 'all') return;
      if (realm === 'customer' && notif.recipient_role !== 'customer' && notif.recipient_role !== 'all') return;

      setNotifications((prev) => [notif, ...prev]);
      setUnreadCount((c) => c + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, [realm]);

  const markAllRead = async () => {
    await fetch(`/api/notifications/mark-all-read?realm=${realm}`, { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
  };

  return { notifications, unreadCount, markAllRead };
}