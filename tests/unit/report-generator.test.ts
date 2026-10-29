import fs from 'fs';
import path from 'path';
import { describe, it, expect, afterAll } from 'vitest';
import { generateAuctionReportPdf, type ReportAuctionMetadata } from '../../src/report-generator.js';
import { computeEventOutcome, type LotSettlementInput } from '../../src/auction-outcome.js';

describe('PDF Settlement Report Generator', () => {
  const testOutputDir = path.resolve('tests/output');
  const testPdfPath = path.join(testOutputDir, 'Test-Auction-Report-PTA-07.pdf');

  const metadata: ReportAuctionMetadata = {
    auctionId: 'PTA-EPACKPetro-07',
    companyName: 'Epack Petrochem Solutions Pvt Ltd',
    gstin: '03AAPCP3056IZE',
    scheduledStart: '28 October 2026 at 03:37 pm IST',
    actualEnd: '28 October 2026 at 04:22 pm IST',
    auctionType: 'Reverse Auction',
    currency: 'INR',
    platformUrl: 'www.primetradeauctions.com',
  };

  const sampleLots: LotSettlementInput[] = [
    {
      lotId: 'lot_coal',
      productName: 'Imported Coal _Epackpetro-07',
      quantity: 500,
      uom: 'MT',
      reservePrice: 13500,
      bids: [
        { vendorId: 'v1', vendorName: 'RS Bridge', amount: 10730, timestamp: new Date() },
        { vendorId: 'v2', vendorName: 'Gold Global Fuels', amount: 10720, timestamp: new Date() },
      ],
    },
    {
      lotId: 'lot_pallets',
      productName: 'Pallets Epackpetro-07',
      quantity: 5000,
      uom: 'Nos',
      reservePrice: 1500,
      bids: [
        { vendorId: 'v1', vendorName: 'RS Bridge', amount: 1135, timestamp: new Date() },
        { vendorId: 'v3', vendorName: 'Vision India', amount: 1140, timestamp: new Date() },
      ],
    },
  ];

  afterAll(() => {
    // Clean up generated test output
    if (fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }
  });

  // ==========================================
  // POSITIVE TESTS (Happy Paths)
  // ==========================================
  describe('Positive Test Cases', () => {
    it('generates a valid, readable PDF file on disk', async () => {
      const outcome = computeEventOutcome('PTA-EPACKPetro-07', sampleLots);
      const generatedPath = await generateAuctionReportPdf(metadata, outcome, testPdfPath);

      expect(fs.existsSync(generatedPath)).toBe(true);

      // Verify file is not empty and has a valid size
      const stats = fs.statSync(generatedPath);
      expect(stats.size).toBeGreaterThan(1000); // Greater than 1 KB

      // Verify valid PDF magic bytes header: %PDF-
      const buffer = fs.readFileSync(generatedPath);
      const header = buffer.toString('utf-8', 0, 5);
      expect(header).toBe('%PDF-');
    });
  });

  // ==========================================
  // NEGATIVE TESTS (Boundaries & Failures)
  // ==========================================
  describe('Negative Test Cases', () => {
    it('rejects writing to an invalid or forbidden path', async () => {
      const outcome = computeEventOutcome('PTA-EPACKPetro-07', sampleLots);
      // Null byte or invalid path in Windows/Linux
      const invalidPath = '\0invalid/path/report.pdf';

      await expect(generateAuctionReportPdf(metadata, outcome, invalidPath)).rejects.toThrow();
    });
  });
});