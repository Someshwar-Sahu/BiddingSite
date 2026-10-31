export interface AuctionTimerConfig {
  scheduledStartTime: Date;
  scheduledEndTime: Date;
  antiSnipingTriggerMinutes: number; // e.g. 2 minutes
  extensionStepMinutes: number;      // e.g. 3 minutes
  maxBufferMinutes: number;          // e.g. 30 minutes (Hard Stop Cap)
}

export type AuctionStatus = 'scheduled' | 'live' | 'ended';

export interface TimerState {
  status: AuctionStatus;
  remainingSeconds: number;
  currentEndTime: Date;
  hardStopEndTime: Date;
  isHardStopReached: boolean;
  totalExtendedMinutes: number;
}

export interface ExtensionResult {
  extended: boolean;
  newEndTime: Date;
  isHardStopReached: boolean;
  reason?: string;
}

/**
 * Computes the absolute deadline beyond which no extensions are permitted.
 */
export function calculateHardStopEndTime(config: AuctionTimerConfig): Date {
  return new Date(
    config.scheduledEndTime.getTime() + config.maxBufferMinutes * 60 * 1000
  );
}

/**
 * Gets the current runtime state of the auction clock.
 */
export function getAuctionTimerState(
  config: AuctionTimerConfig,
  currentEndTime: Date,
  currentTime: Date = new Date()
): TimerState {
  const hardStopEndTime = calculateHardStopEndTime(config);
  let remainingMs = currentEndTime.getTime() - currentTime.getTime();

  let status: AuctionStatus = 'live';
  if (currentTime < config.scheduledStartTime) {
    status = 'scheduled';
    remainingMs = config.scheduledStartTime.getTime() - currentTime.getTime();
  } else if (remainingMs <= 0) {
    status = 'ended';
    remainingMs = 0;
  }

  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const totalExtendedMs = currentEndTime.getTime() - config.scheduledEndTime.getTime();
  const totalExtendedMinutes = Math.max(0, Math.round(totalExtendedMs / (60 * 1000)));
  const isHardStopReached = currentEndTime.getTime() >= hardStopEndTime.getTime();

  return {
    status,
    remainingSeconds,
    currentEndTime,
    hardStopEndTime,
    isHardStopReached,
    totalExtendedMinutes,
  };
}

/**
 * Evaluates whether an incoming bid triggers an anti-sniping extension.
 */
export function evaluateAntiSniping(
  config: AuctionTimerConfig,
  currentEndTime: Date,
  bidTime: Date = new Date()
): ExtensionResult {
  const hardStopEndTime = calculateHardStopEndTime(config);
  const remainingMs = currentEndTime.getTime() - bidTime.getTime();
  const triggerMs = config.antiSnipingTriggerMinutes * 60 * 1000;
  const stepMs = config.extensionStepMinutes * 60 * 1000;

  // Rule 1: Auction has already expired
  if (remainingMs <= 0) {
    return {
      extended: false,
      newEndTime: currentEndTime,
      isHardStopReached: true,
      reason: 'Auction has already ended.',
    };
  }

  // Rule 2: Bid arrived outside the trigger window (e.g. more than 2 mins remaining)
  if (remainingMs > triggerMs) {
    return {
      extended: false,
      newEndTime: currentEndTime,
      isHardStopReached: currentEndTime.getTime() >= hardStopEndTime.getTime(),
      reason: 'Bid placed outside anti-sniping threshold window.',
    };
  }

  // Rule 3: Already at or beyond the Hard Stop deadline
  if (currentEndTime.getTime() >= hardStopEndTime.getTime()) {
    return {
      extended: false,
      newEndTime: hardStopEndTime,
      isHardStopReached: true,
      reason: 'Maximum extension buffer reached. Hard Stop enforced.',
    };
  }

  // Rule 4: Apply extension step, capping at the Hard Stop deadline
  const proposedEndTimeMs = currentEndTime.getTime() + stepMs;
  const finalEndTimeMs = Math.min(proposedEndTimeMs, hardStopEndTime.getTime());
  const newEndTime = new Date(finalEndTimeMs);
  const isHardStopReached = newEndTime.getTime() >= hardStopEndTime.getTime();

  return {
    extended: true,
    newEndTime,
    isHardStopReached,
  };
}
