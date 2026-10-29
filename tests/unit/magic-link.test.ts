import { describe, it, expect } from 'vitest';
import {
  generateMagicToken,
  buildAccessUrl,
  buildWhatsAppShareUrl,
  verifyInviteToken,
  type InviteRecord,
} from '../../src/magic-link.js';

describe('Magic Link Generator & Access Engine', () => {
  const baseUrl = 'https://yourauctions.com';
  const auctionId = 'PTA-EPACKPetro-07';
  const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours in future

  // ==========================================
  // POSITIVE TESTS (Happy Paths)
  // ==========================================
  describe('Positive Test Cases', () => {
    it('generates a URL-safe 32-character cryptographic random token', () => {
      const token1 = generateMagicToken();
      const token2 = generateMagicToken();

      expect(token1).toHaveLength(32);
      expect(token2).toHaveLength(32);
      expect(token1).not.toBe(token2); // Uniqueness check
      expect(token1).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe characters only
    });

    it('builds a clean, normalized access URL', () => {
      const token = 'test_token_abc_123';
      const url = buildAccessUrl('https://yourauctions.com/', auctionId, token);
      expect(url).toBe('https://yourauctions.com/live-auction/PTA-EPACKPetro-07?key=test_token_abc_123');
    });

    it('generates a properly encoded WhatsApp share URL with Indian country code', () => {
      const shareUrl = buildWhatsAppShareUrl(
        '9876543210',
        'Gold Global Fuels',
        auctionId,
        'https://yourauctions.com/live-auction/PTA-07?key=abc'
      );

      expect(shareUrl).toContain('https://wa.me/919876543210?text=');
      expect(shareUrl).toContain(encodeURIComponent('Gold Global Fuels'));
      expect(shareUrl).toContain(encodeURIComponent(auctionId));
    });

    it('authorizes an approved vendor directly into the live bidding room', () => {
      const approvedInvite: InviteRecord = {
        token: 'token_gold_01',
        auctionId,
        role: 'vendor',
        vendorId: 'vnd_01',
        vendorCompanyName: 'Gold Global Fuels',
        vendorStatus: 'approved',
        expiresAt: futureExpiry,
        isRevoked: false,
      };

      const result = verifyInviteToken(approvedInvite);
      expect(result.isAuthorized).toBe(true);
      expect(result.role).toBe('vendor');
      expect(result.requiresOnboarding).toBe(false);
      expect(result.companyName).toBe('Gold Global Fuels');
    });

    it('flags an unregistered vendor for quick profile onboarding', () => {
      const newInvite: InviteRecord = {
        token: 'token_new_02',
        auctionId,
        role: 'vendor',
        vendorId: 'vnd_02',
        vendorCompanyName: 'New Supplier Corp',
        vendorStatus: 'unregistered',
        expiresAt: futureExpiry,
        isRevoked: false,
      };

      const result = verifyInviteToken(newInvite);
      expect(result.isAuthorized).toBe(true);
      expect(result.requiresOnboarding).toBe(true);
    });

    it('authorizes a customer observer (Epack) in Spectator mode', () => {
      const observerInvite: InviteRecord = {
        token: 'token_epack_obs',
        auctionId,
        role: 'customer_observer',
        vendorCompanyName: 'Epack Petrochem Observer',
        expiresAt: futureExpiry,
        isRevoked: false,
      };

      const result = verifyInviteToken(observerInvite);
      expect(result.isAuthorized).toBe(true);
      expect(result.role).toBe('customer_observer');
    });
  });

  // ==========================================
  // NEGATIVE TESTS (Boundaries & Rejections)
  // ==========================================
  describe('Negative Test Cases', () => {
    it('rejects null or non-existent token records', () => {
      const result = verifyInviteToken(null);
      expect(result.isAuthorized).toBe(false);
      expect(result.errorCode).toBe('INVALID_TOKEN');
    });

    it('rejects an expired access token', () => {
      const expiredInvite: InviteRecord = {
        token: 'token_expired',
        auctionId,
        role: 'vendor',
        expiresAt: new Date(Date.now() - 60 * 1000), // Expired 1 min ago
        isRevoked: false,
      };

      const result = verifyInviteToken(expiredInvite);
      expect(result.isAuthorized).toBe(false);
      expect(result.errorCode).toBe('EXPIRED_TOKEN');
    });

    it('rejects a revoked access token', () => {
      const revokedInvite: InviteRecord = {
        token: 'token_revoked',
        auctionId,
        role: 'vendor',
        expiresAt: futureExpiry,
        isRevoked: true, // Revoked by Admin
      };

      const result = verifyInviteToken(revokedInvite);
      expect(result.isAuthorized).toBe(false);
      expect(result.errorCode).toBe('REVOKED_TOKEN');
    });

    it('blocks a blacklisted vendor from entering the room', () => {
      const blacklistedInvite: InviteRecord = {
        token: 'token_bad',
        auctionId,
        role: 'vendor',
        vendorStatus: 'blacklisted',
        expiresAt: futureExpiry,
        isRevoked: false,
      };

      const result = verifyInviteToken(blacklistedInvite);
      expect(result.isAuthorized).toBe(false);
      expect(result.errorCode).toBe('VENDOR_BLACKLISTED');
    });

    it('blocks a vendor whose profile is still pending admin approval', () => {
      const pendingInvite: InviteRecord = {
        token: 'token_pending',
        auctionId,
        role: 'vendor',
        vendorStatus: 'pending_approval',
        expiresAt: futureExpiry,
        isRevoked: false,
      };

      const result = verifyInviteToken(pendingInvite);
      expect(result.isAuthorized).toBe(false);
      expect(result.errorCode).toBe('VENDOR_PENDING_APPROVAL');
    });
  });
});