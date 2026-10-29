import { describe, it, expect } from 'vitest';
import { calculateMaxAllowedBid, validateBid } from '../../src/bid-calculator.js';

describe('Bid Calculator & Decrement Validation', () => {
    // Test parameters matching your screenshot: Pallets (Start: 1400, Lowest: 1340, Decrement: 5)
    const palletsInput = {
        startPrice: 1400,
        currentLowestBid: 1340,
        bidDecrement: 5,
    };

    // ==========================================
    // POSITIVE TESTS (Happy Paths)
    // ==========================================
    describe('Positive Test Cases', () => {
        it('calculates the correct max allowed bid when a lowest bid exists', () => {
            // 1340 - 5 = 1335
            const maxBid = calculateMaxAllowedBid(palletsInput);
            expect(maxBid).toBe(1335);
        });

        it('allows start price as max bid if no bids have been placed yet', () => {
            const freshLot = {
                startPrice: 13000,
                currentLowestBid: null,
                bidDecrement: 10,
            };
            const maxBid = calculateMaxAllowedBid(freshLot);
            expect(maxBid).toBe(13000);
        });

        it('accepts a bid exactly equal to the max allowed bid', () => {
            const result = validateBid(1335, palletsInput);
            expect(result.isValid).toBe(true);
            expect(result.maxAllowedBid).toBe(1335);
        });

        it('accepts an aggressive bid lower than the max allowed bid', () => {
            // Vendor jumps down to 1320
            const result = validateBid(1320, palletsInput);
            expect(result.isValid).toBe(true);
        });
    });

    // ==========================================
    // NEGATIVE TESTS (Boundaries & Rejections)
    // ==========================================
    describe('Negative Test Cases', () => {
        it('rejects a bid that is higher than the max allowed bid', () => {
            // 1338 is > 1335 (violates decrement)
            const result = validateBid(1338, palletsInput);
            expect(result.isValid).toBe(false);
            expect(result.reason).toContain('exceeds maximum allowed bid');
        });

        it('rejects a bid equal to the current lowest bid (no price drop)', () => {
            // 1340 does not beat the current lowest 1340
            const result = validateBid(1340, palletsInput);
            expect(result.isValid).toBe(false);
        });

        it('rejects negative or zero bid amounts', () => {
            const zeroResult = validateBid(0, palletsInput);
            expect(zeroResult.isValid).toBe(false);
            expect(zeroResult.reason).toContain('greater than zero');

            const negativeResult = validateBid(-500, palletsInput);
            expect(negativeResult.isValid).toBe(false);
        });
    });
});