export interface VendorProfileInput {
  companyName: string;
  contactPerson: string;
  mobile: string;
  email: string;
  gstin: string;
  pan: string;
}

export interface ValidationOutput {
  isValid: boolean;
  errors: string[];
  entityType?: string;
}

const PAN_ENTITY_TYPES: Record<string, string> = {
  C: 'Company',
  P: 'Individual / Proprietorship',
  H: 'Hindu Undivided Family (HUF)',
  F: 'Partnership Firm / LLP',
  A: 'Association of Persons (AOP)',
  T: 'Trust',
  B: 'Body of Individuals (BOI)',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government Entity',
};

/**
 * Validates an Indian PAN (Permanent Account Number).
 * Format: 5 Letters, 4 Digits, 1 Letter. 4th letter identifies entity type.
 */
export function validatePAN(pan: string): { isValid: boolean; entityType?: string; error?: string } {
  if (!pan) return { isValid: false, error: 'PAN is required.' };
  const cleanPan = pan.trim().toUpperCase();

  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(cleanPan)) {
    return { isValid: false, error: 'Invalid PAN format. Must be 5 letters, 4 digits, 1 letter.' };
  }

  const entityChar = cleanPan[3];
  const entityType = PAN_ENTITY_TYPES[entityChar] || 'Unknown Entity';

  return { isValid: true, entityType };
}

/**
 * Validates an Indian GSTIN using official format regex and the Luhn Mod-36 Checksum algorithm.
 */
export function validateGSTIN(gstin: string): { isValid: boolean; error?: string } {
  if (!gstin) return { isValid: false, error: 'GSTIN is required.' };
  const cleanGstin = gstin.trim().toUpperCase();

  // Official 15-character GST structure:
  // Digits 1-2: State Code (01-38, 97, 99)
  // Digits 3-12: PAN (10 chars)
  // Digit 13: Entity Code (1-9, A-Z)
  // Digit 14: Default 'Z'
  // Digit 15: Checksum (0-9, A-Z)
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(cleanGstin)) {
    return { isValid: false, error: 'Invalid GSTIN structure or character format.' };
  }

  // Luhn Modulo 36 Checksum Verification
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const factor = 36;
  let sum = 0;

  for (let i = 0; i < 14; i++) {
    const codePoint = chars.indexOf(cleanGstin[i]);
    if (codePoint === -1) return { isValid: false, error: 'Illegal character in GSTIN.' };

    const multiplier = (i % 2 === 0) ? 1 : 2;
    let product = codePoint * multiplier;
    product = Math.floor(product / factor) + (product % factor);
    sum += product;
  }

  const remainder = sum % factor;
  const checkCodePoint = (factor - remainder) % factor;
  const expectedChar = chars[checkCodePoint];
  const actualChar = cleanGstin[14];

  if (expectedChar !== actualChar) {
    return {
      isValid: false,
      error: `Invalid GSTIN checksum. Calculated '${expectedChar}' but received '${actualChar}'.`,
    };
  }

  return { isValid: true };
}

/**
 * Validates complete vendor profile submission for initial onboarding.
 */
export function validateVendorProfile(profile: VendorProfileInput): ValidationOutput {
  const errors: string[] = [];

  if (!profile.companyName || profile.companyName.trim().length < 3) {
    errors.push('Company legal name must be at least 3 characters long.');
  }

  if (!profile.contactPerson || profile.contactPerson.trim().length < 2) {
    errors.push('Authorized contact person name is required.');
  }

  const mobileRegex = /^[6-9][0-9]{9}$/;
  if (!mobileRegex.test(profile.mobile.trim())) {
    errors.push('Invalid Indian mobile number. Must be 10 digits starting with 6, 7, 8, or 9.');
  }

  const panCheck = validatePAN(profile.pan);
  if (!panCheck.isValid) {
    errors.push(panCheck.error!);
  }

  const gstinCheck = validateGSTIN(profile.gstin);
  if (!gstinCheck.isValid) {
    errors.push(gstinCheck.error!);
  }

  // Cross-verification: PAN inside GSTIN must match submitted PAN
  if (panCheck.isValid && gstinCheck.isValid) {
    const panInGstin = profile.gstin.trim().toUpperCase().substring(2, 12);
    if (panInGstin !== profile.pan.trim().toUpperCase()) {
      errors.push(`PAN mismatch: Submitted PAN (${profile.pan.toUpperCase()}) does not match PAN in GSTIN (${panInGstin}).`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    entityType: panCheck.entityType,
  };
}