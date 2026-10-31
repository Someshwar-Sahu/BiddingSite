import { Server as SocketIOServer } from 'socket.io';
import Database from 'better-sqlite3';
import { getAuctionTimerState, type AuctionTimerConfig } from '../auction-timer.js';

export function startAuctionTicker(io: SocketIOServer, db: Database.Database): NodeJS.Timeout {
  const ticker = setInterval(() => {
    const activeAuctions = db
      .prepare("SELECT * FROM auctions WHERE status IN ('live', 'extended', 'scheduled')")
      .all() as any[];

    for (const auction of activeAuctions) {
      const config: AuctionTimerConfig = {
        scheduledStartTime: new Date(auction.scheduled_start),
        scheduledEndTime: new Date(auction.scheduled_end),
        antiSnipingTriggerMinutes: auction.anti_sniping_minutes,
        extensionStepMinutes: auction.extension_step_minutes,
        maxBufferMinutes: auction.max_buffer_minutes,
      };
      const state = getAuctionTimerState(config, new Date(auction.current_end));

      const hours = Math.floor(state.remainingSeconds / 3600);
      const minutes = Math.floor((state.remainingSeconds % 3600) / 60);
      const seconds = state.remainingSeconds % 60;
      const formattedTime = `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;

      io.to(`auction:${auction.id}`).emit('clock_tick', {
        remainingSeconds: state.remainingSeconds,
        formattedTime,
        status: state.status,
        isHardStopReached: state.isHardStopReached,
      });

      // 1. Transition SCHEDULED -> LIVE when start time is reached
      if (state.status === 'live' && auction.status === 'scheduled') {
        db.prepare("UPDATE auctions SET status = 'live' WHERE id = ?").run(auction.id);
        io.to(`auction:${auction.id}`).emit('auction_started', { auctionId: auction.id });
        io.emit('auction_status_changed', { auctionId: auction.id, status: 'live' });
        io.emit('auctions_updated');
      }

      // 2. Transition LIVE -> ENDED when timer expires (Atomically closes lots)
      if (state.status === 'ended' && auction.status !== 'ended') {
        const endTx = db.transaction(() => {
          db.prepare("UPDATE auctions SET status = 'ended' WHERE id = ?").run(auction.id);
          db.prepare("UPDATE lots SET status = 'closed' WHERE auction_id = ?").run(auction.id);
        });
        endTx();
        io.to(`auction:${auction.id}`).emit('auction_ended', { auctionId: auction.id });
        io.emit('auction_status_changed', { auctionId: auction.id, status: 'ended' });
        io.emit('auctions_updated');
      }
    }
  }, 1000);

  return ticker;
}
