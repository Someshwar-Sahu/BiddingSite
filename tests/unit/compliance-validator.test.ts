import { describe, it, expect } from 'vitest';
import {
  validatePAN,
  validateGSTIN,
  validateVendorProfile,
  type VendorProfileInput,
} from '../../src/compliance-validator.js';

describe('Compliance & Vendor Verification Engine', () => {
  // Valid test credentials (standard Indian company formats)
  const validCompanyPAN = 'AAPCP3056I'; // Epack / Corporate PAN (4th char 'C' = Company)
  const validGSTIN = '27AAPFU0939F1ZV'; // Valid Luhn mod-36 checksum GSTIN
  const validPanForGstin = 'AAPFU0939F';

  const validProfile: VendorProfileInput = {
    companyName: 'Gold Global Fuels Pvt Ltd',
    contactPerson: 'Harsh Vardhan',
    mobile: '9876543210',
    email: 'goldglobalfuels@gmail.com',
    gstin: '27AAPFU0939F1ZV',
    pan: 'AAPFU0939F',
  };

  // ==========================================
  // POSITIVE TESTS (Happy Paths)
  // ==========================================
  describe('Positive Test Cases', () => {
    it('validates a correct company PAN and detects entity type', () => {
      const result = validatePAN(validCompanyPAN);
      expect(result.isValid).toBe(true);
      expect(result.entityType).toBe('Company');
    });

    it('identifies partnership firm or LLP from PAN 4th letter', () => {
      const result = validatePAN('AAAFP1234A');
      expect(result.isValid).toBe(true);
      expect(result.entityType).toBe('Partnership Firm / LLP');
    });

    it('passes a mathematically correct GSTIN with valid Luhn checksum', () => {
      const result = validateGSTIN(validGSTIN);
      expect(result.isValid).toBe(true);
    });

    it('validates a complete, compliant vendor profile', () => {
      const result = validateVendorProfile(validProfile);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.entityType).toBe('Partnership Firm / LLP');
    });
  });

  // ==========================================
  // NEGATIVE TESTS (Boundaries & Edge Cases)
  // ==========================================
  describe('Negative Test Cases', () => {
    it('rejects PAN with invalid format or character count', () => {
      const tooShort = validatePAN('ABC123');
      expect(tooShort.isValid).toBe(false);

      const invalidChars = validatePAN('12345ABCDE');
      expect(invalidChars.isValid).toBe(false);
    });

    it('rejects a fake GSTIN that fails the Luhn Mod-36 checksum', () => {
      // Swapped last checksum character 'V' with 'X'
      const corruptGstin = '27AAPFU0939F1ZX';
      const result = validateGSTIN(corruptGstin);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid GSTIN checksum');
    });

    it('rejects profile when submitted PAN does not match PAN inside GSTIN', () => {
      const mismatchedProfile: VendorProfileInput = {
        ...validProfile,
        pan: 'BBBBB1234C', // Different from AAPFU0939F in GSTIN
      };

      const result = validateVendorProfile(mismatchedProfile);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('PAN mismatch'))).toBe(true);
    });

    it('rejects invalid Indian mobile numbers', () => {
      const badPhoneProfile: VendorProfileInput = {
        ...validProfile,
        mobile: '1234567890', // Starts with 1 (invalid in India)
      };

      const result = validateVendorProfile(badPhoneProfile);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid Indian mobile'))).toBe(true);
    });
  });
});