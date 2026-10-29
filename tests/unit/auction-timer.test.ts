import { describe, it, expect } from 'vitest';
import {
  calculateHardStopEndTime,
  getAuctionTimerState,
  evaluateAntiSniping,
  type AuctionTimerConfig,
} from '../../src/auction-timer.js';

describe('Auction Timer & Anti-Sniping Engine', () => {
  // Auction scheduled for 1 hour: 03:00 PM to 04:00 PM
  // Anti-sniping: last 2 mins triggers +3 mins extension
  // Hard stop buffer: max 15 mins (Hard stop at 04:15 PM)
  const baseConfig: AuctionTimerConfig = {
    scheduledStartTime: new Date('2026-10-28T15:00:00Z'),
    scheduledEndTime: new Date('2026-10-28T16:00:00Z'),
    antiSnipingTriggerMinutes: 2,
    extensionStepMinutes: 3,
    maxBufferMinutes: 15,
  };

  // ==========================================
  // POSITIVE TESTS (Happy Paths)
  // ==========================================
  describe('Positive Test Cases', () => {
    it('correctly calculates the hard stop deadline', () => {
      const hardStop = calculateHardStopEndTime(baseConfig);
      // 16:00 + 15 mins = 16:15
      expect(hardStop.toISOString()).toBe('2026-10-28T16:15:00.000Z');
    });

    it('identifies scheduled status before auction starts', () => {
      const earlyTime = new Date('2026-10-28T14:45:00Z');
      const state = getAuctionTimerState(baseConfig, baseConfig.scheduledEndTime, earlyTime);
      expect(state.status).toBe('scheduled');
      expect(state.remainingSeconds).toBe(4500); // 75 mins until scheduled end
    });

    it('identifies live status during the active window', () => {
      const midTime = new Date('2026-10-28T15:30:00Z');
      const state = getAuctionTimerState(baseConfig, baseConfig.scheduledEndTime, midTime);
      expect(state.status).toBe('live');
      expect(state.remainingSeconds).toBe(1800); // 30 mins remaining
    });

    it('triggers a +3 min extension when a bid arrives within the last 2 minutes', () => {
      // Bid at 15:58:30 (1m 30s remaining -> inside 2m window)
      const bidTime = new Date('2026-10-28T15:58:30Z');
      const result = evaluateAntiSniping(baseConfig, baseConfig.scheduledEndTime, bidTime);

      expect(result.extended).toBe(true);
      // 16:00 + 3 mins = 16:03
      expect(result.newEndTime.toISOString()).toBe('2026-10-28T16:03:00.000Z');
      expect(result.isHardStopReached).toBe(false);
    });

    it('allows sequential extensions while below the buffer limit', () => {
      // Clock was already extended to 16:03
      const currentEnd = new Date('2026-10-28T16:03:00Z');
      // Second bid at 16:01:45 (1m 15s remaining)
      const secondBidTime = new Date('2026-10-28T16:01:45Z');

      const result = evaluateAntiSniping(baseConfig, currentEnd, secondBidTime);
      expect(result.extended).toBe(true);
      // 16:03 + 3 mins = 16:06
      expect(result.newEndTime.toISOString()).toBe('2026-10-28T16:06:00.000Z');
    });
  });

  // ==========================================
  // NEGATIVE TESTS (Boundaries & Hard Stop)
  // ==========================================
  describe('Negative Test Cases', () => {
    it('does NOT extend if a bid arrives outside the trigger window', () => {
      // Bid at 15:50:00 (10 mins remaining -> outside 2 min trigger)
      const bidTime = new Date('2026-10-28T15:50:00Z');
      const result = evaluateAntiSniping(baseConfig, baseConfig.scheduledEndTime, bidTime);

      expect(result.extended).toBe(false);
      expect(result.newEndTime.toISOString()).toBe(baseConfig.scheduledEndTime.toISOString());
      expect(result.reason).toContain('outside anti-sniping threshold');
    });

    it('does NOT extend if the auction has already closed', () => {
      const lateTime = new Date('2026-10-28T16:00:05Z'); // 5 seconds past closing
      const result = evaluateAntiSniping(baseConfig, baseConfig.scheduledEndTime, lateTime);

      expect(result.extended).toBe(false);
      expect(result.reason).toContain('already ended');
    });

    it('caps extension exactly at the Hard Stop limit when a step would overshoot', () => {
      // Clock is currently at 16:14 (only 1 min before Hard Stop of 16:15)
      const currentEnd = new Date('2026-10-28T16:14:00Z');
      // Bid at 16:13:00 (1 min remaining)
      const bidTime = new Date('2026-10-28T16:13:00Z');

      const result = evaluateAntiSniping(baseConfig, currentEnd, bidTime);
      expect(result.extended).toBe(true);
      // Capped at 16:15:00 instead of 16:17:00!
      expect(result.newEndTime.toISOString()).toBe('2026-10-28T16:15:00.000Z');
      expect(result.isHardStopReached).toBe(true);
    });

    it('strictly denies any further extensions once the Hard Stop is reached', () => {
      // Clock is already at Hard Stop limit (16:15)
      const hardStopEnd = new Date('2026-10-28T16:15:00Z');
      // Bid at 16:14:30 (30 seconds remaining)
      const bidTime = new Date('2026-10-28T16:14:30Z');

      const result = evaluateAntiSniping(baseConfig, hardStopEnd, bidTime);
      expect(result.extended).toBe(false);
      expect(result.isHardStopReached).toBe(true);
      expect(result.reason).toContain('Hard Stop enforced');
    });
  });
});