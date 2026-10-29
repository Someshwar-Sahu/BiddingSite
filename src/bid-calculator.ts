export interface BidCalculationInput {
    startPrice: number;
    currentLowestBid: number | null;
    bidDecrement: number;
}

export interface BidValidationResult {
    isValid: boolean;
    maxAllowedBid: number;
    reason?: string;
}

/**
 * Calculates the maximum bid amount a vendor is allowed to submit.
 * In a reverse auction: Next Bid <= (Current Lowest - Decrement)
 */
export function calculateMaxAllowedBid(input: BidCalculationInput): number {
    if (input.currentLowestBid === null) {
        return input.startPrice;
    }
    return input.currentLowestBid - input.bidDecrement;
}

/**
 * Validates whether a proposed bid amount is legal.
 */
export function validateBid(
    proposedBid: number,
    input: BidCalculationInput
): BidValidationResult {
    const maxAllowed = calculateMaxAllowedBid(input);

    if (proposedBid <= 0) {
        return {
            isValid: false,
            maxAllowedBid: maxAllowed,
            reason: 'Bid amount must be greater than zero.',
        };
    }

    if (proposedBid > maxAllowed) {
        return {
            isValid: false,
            maxAllowedBid: maxAllowed,
            reason: `Bid exceeds maximum allowed bid of ₹${maxAllowed.toLocaleString('en-IN')}.`,
        };
    }

    return {
        isValid: true,
        maxAllowedBid: maxAllowed,
    };
}