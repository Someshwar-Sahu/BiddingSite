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

      if (state.status === 'ended' && auction.status !== 'ended') {
        db.prepare("UPDATE auctions SET status = 'ended' WHERE id = ?").run(auction.id);
        io.to(`auction:${auction.id}`).emit('auction_ended', { auctionId: auction.id });
      }
    }
  }, 1000);

  return ticker;
}
