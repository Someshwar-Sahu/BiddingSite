import { randomBytes } from 'crypto';

export type UserRole = 'vendor' | 'customer_observer' | 'super_admin';
export type VendorStatus = 'unregistered' | 'pending_approval' | 'approved' | 'blacklisted';

export interface InviteRecord {
  token: string;
  auctionId: string;
  role: UserRole;
  vendorId?: string;
  vendorCompanyName?: string;
  vendorStatus?: VendorStatus;
  expiresAt: Date;
  isRevoked: boolean;
}

export interface VerificationResult {
  isAuthorized: boolean;
  role?: UserRole;
  auctionId?: string;
  vendorId?: string;
  companyName?: string;
  requiresOnboarding?: boolean;
  errorCode?: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'REVOKED_TOKEN' | 'VENDOR_BLACKLISTED' | 'VENDOR_PENDING_APPROVAL';
  errorMessage?: string;
}

/**
 * Generates a URL-safe, 32-character cryptographic random token.
 */
export function generateMagicToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Constructs the full access URL for a vendor or customer observer.
 */
export function buildAccessUrl(baseUrl: string, auctionId: string, token: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/live-auction/${auctionId}?key=${token}`;
}

/**
 * Constructs a pre-formatted WhatsApp Web click-to-chat share URL for the Admin.
 */
export function buildWhatsAppShareUrl(
  phone: string,
  companyName: string,
  auctionId: string,
  accessUrl: string
): string {
  // Strip non-digits and ensure country code 91 for India
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = `91${cleanPhone}`;
  }

  const message = `Hello ${companyName},\nHere is your official secure access link for E-Auction ${auctionId}:\n${accessUrl}\n\nPlease click to confirm your participation.`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Validates an access token and determines the user's role and onboarding state.
 */
export function verifyInviteToken(
  invite: InviteRecord | null | undefined,
  now: Date = new Date()
): VerificationResult {
  if (!invite) {
    return {
      isAuthorized: false,
      errorCode: 'INVALID_TOKEN',
      errorMessage: 'Invalid or unrecognized access link.',
    };
  }

  if (invite.isRevoked) {
    return {
      isAuthorized: false,
      errorCode: 'REVOKED_TOKEN',
      errorMessage: 'This access link has been revoked by the administrator.',
    };
  }

  if (now > invite.expiresAt) {
    return {
      isAuthorized: false,
      errorCode: 'EXPIRED_TOKEN',
      errorMessage: 'This access link has expired.',
    };
  }

  // Handle Customer Observer Role (Epack Spectator Mode)
  if (invite.role === 'customer_observer') {
    return {
      isAuthorized: true,
      role: 'customer_observer',
      auctionId: invite.auctionId,
      companyName: invite.vendorCompanyName || 'Customer Observer',
    };
  }

  // Handle Vendor Role
  if (invite.role === 'vendor') {
    if (invite.vendorStatus === 'blacklisted') {
      return {
        isAuthorized: false,
        errorCode: 'VENDOR_BLACKLISTED',
        errorMessage: 'Your vendor account is suspended from participating in this auction.',
      };
    }

    if (invite.vendorStatus === 'pending_approval') {
      return {
        isAuthorized: false,
        errorCode: 'VENDOR_PENDING_APPROVAL',
        errorMessage: 'Your profile has been submitted and is awaiting administrator verification.',
      };
    }

    if (invite.vendorStatus === 'unregistered') {
      return {
        isAuthorized: true,
        role: 'vendor',
        auctionId: invite.auctionId,
        vendorId: invite.vendorId,
        companyName: invite.vendorCompanyName,
        requiresOnboarding: true,
      };
    }

    // Approved vendor -> Instant access to live bidding room
    return {
      isAuthorized: true,
      role: 'vendor',
      auctionId: invite.auctionId,
      vendorId: invite.vendorId,
      companyName: invite.vendorCompanyName,
      requiresOnboarding: false,
    };
  }

  return {
    isAuthorized: false,
    errorCode: 'INVALID_TOKEN',
    errorMessage: 'Unauthorized access role.',
  };
}