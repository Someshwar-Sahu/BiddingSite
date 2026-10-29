import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { type EventOutcomeReport } from './auction-outcome.js';

export interface ReportAuctionMetadata {
  auctionId: string;
  companyName: string;
  gstin: string;
  scheduledStart: string;
  actualEnd: string;
  auctionType: string;
  currency: string;
  platformUrl: string;
}

export function generateAuctionReportPdf(
  metadata: ReportAuctionMetadata,
  outcome: EventOutcomeReport,
  outputFilePath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const writeStream = fs.createWriteStream(outputFilePath);

    doc.pipe(writeStream);

    // ==========================================
    // PAGE 1: COVER PAGE
    // ==========================================
    doc.rect(0, 0, doc.page.width, 130).fill('#1e2238');
   doc.fillColor('#ffffff').fontSize(26).font('Helvetica-Bold').text('NEXTRADE AUCTIONS', 50, 45);
    doc.fontSize(11).font('Helvetica').text('Digital Procurement & Asset Auction Platform', 50, 80);

    doc.moveDown(7);
    doc.fillColor('#0f172a').fontSize(34).font('Helvetica-Bold').text('AUCTION REPORT');
    doc.moveDown(1.5);
    doc.fillColor('#334155').fontSize(16).font('Helvetica-Bold').text(`Auction ID: ${metadata.auctionId}`);
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').text(`Host Client: ${metadata.companyName}`);
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#64748b').text(`Generated on: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}`);

    // ==========================================
    // PAGE 2: EXECUTIVE SUMMARY & LOT LIST
    // ==========================================
    doc.addPage();
    drawPageHeader(doc, metadata);

    doc.fontSize(15).font('Helvetica-Bold').fillColor('#0f172a').text('Executive Auction Result Summary');
    doc.moveDown(0.6);

    const summaryRows = [
      ['Auction ID', metadata.auctionId],
      ['Company Name', metadata.companyName],
      ['Auction Start', metadata.scheduledStart],
      ['Auction End', metadata.actualEnd],
      ['Auction Type', metadata.auctionType],
      ['Currency', metadata.currency],
      ['Platform', metadata.platformUrl],
    ];

    drawDynamicTable(doc, ['Field', 'Description'], summaryRows, [160, 335]);

    doc.moveDown(1.2);
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#0f172a').text('List of Auction Items');
    doc.moveDown(0.6);

    const lotRows = outcome.lots.map((l, index) => [
      String(index + 1),
      l.productName,
      `${l.quantity} ${l.uom}`,
      `INR ${l.reservePrice.toLocaleString('en-IN')}`,
      l.l1Winner ? `INR ${l.l1Winner.amount.toLocaleString('en-IN')}` : 'No Bids',
    ]);

    drawDynamicTable(doc, ['Lot No', 'Lot Description', 'Quantity', 'Reserve Price', 'Winning Bid (L1)'], lotRows, [45, 175, 90, 95, 90]);

    // ==========================================
    // PAGE 3: OUTCOME, STANDBY & SAVINGS
    // ==========================================
    doc.addPage();
    drawPageHeader(doc, metadata);

    doc.fontSize(15).font('Helvetica-Bold').fillColor('#0f172a').text('Auction Outcome & Procurement Savings');
    doc.moveDown(0.6);

    const outcomeRows = outcome.lots.map((l) => [
      l.productName,
      l.l1Winner ? l.l1Winner.vendorName : 'N/A',
      l.l1Winner ? `INR ${l.l1Winner.amount.toLocaleString('en-IN')}` : 'N/A',
      l.l2Standby ? `${l.l2Standby.vendorName} (+INR ${l.l2PriceDelta})` : 'None',
      `INR ${l.totalSavings.toLocaleString('en-IN')}`,
    ]);

    drawDynamicTable(doc, ['Product', 'Winner (L1)', 'Winning Bid', 'Backup Standby (L2)', 'Total Savings'], outcomeRows, [125, 110, 85, 95, 80]);

    // High-Impact Savings Box (Properly offset without collision)
    const boxY = doc.y + 15;
    doc.rect(50, boxY, 495, 70).fillAndStroke('#ecfdf5', '#10b981');
    doc.fillColor('#065f46').fontSize(11).font('Helvetica-Bold').text('TOTAL PROCUREMENT SAVINGS GENERATED', 70, boxY + 16);
    doc.fontSize(22).font('Helvetica-Bold').text(`INR ${outcome.totalEventSavings.toLocaleString('en-IN')}`, 70, boxY + 36);
    doc.y = boxY + 85;

    // ==========================================
    // PAGE 4: COMMERCIAL TERMS & DISCLAIMER
    // ==========================================
    doc.addPage();
    drawPageHeader(doc, metadata);

    doc.fontSize(15).font('Helvetica-Bold').fillColor('#0f172a').text('Commercial & Tax Terms');
    doc.moveDown(0.6);
    doc.fontSize(10).font('Helvetica').fillColor('#334155');
    doc.text('• Prices quoted are basic and exclusive of applicable taxes and duties (GST extra).', { paragraphGap: 6 });
    doc.text('• Taxes shall be charged as per prevailing government regulations at time of invoicing.', { paragraphGap: 6 });
    doc.text('• Final sale and purchase order issuance is subject to corporate buyer confirmation.', { paragraphGap: 6 });
    doc.text('• Standby Awardee (L2) may be contacted if L1 fails to execute the contract within 48 hours.', { paragraphGap: 6 });

    doc.moveDown(2);
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#0f172a').text('Platform Disclaimer');
    doc.moveDown(0.6);
    doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(
    'This report is system-generated and intended for reference and official audit purposes. ' +
    'NexTrade Auctions acts solely as a digital auction facilitator and does not assume responsibility ' +
    'for post-auction settlement, material delivery, or contractual disputes between buyer and seller.',
      { lineGap: 3 }
    );

    doc.end();

    writeStream.on('finish', () => resolve(outputFilePath));
    writeStream.on('error', (err) => reject(err));
  });
}

function drawPageHeader(doc: PDFKit.PDFDocument, metadata: ReportAuctionMetadata) {
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e2238').text('NexTrade Auctions Pvt Ltd');
  doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`GSTIN: ${metadata.gstin} | ${metadata.platformUrl}`);
  doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).strokeColor('#cbd5e1').stroke();
  doc.y += 15;
}

/**
 * Draws a clean, auto-sizing table that dynamically calculates row heights
 * to prevent text overlapping when cells wrap onto multiple lines.
 */
function drawDynamicTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  colWidths: number[]
) {
  const startX = 50;
  let currentY = doc.y;
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  // Table Header
  doc.rect(startX, currentY, totalWidth, 24).fill('#1e2238');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);

  let currentX = startX;
  headers.forEach((h, i) => {
    doc.text(h, currentX + 6, currentY + 7, { width: colWidths[i] - 12 });
    currentX += colWidths[i];
  });

  currentY += 24;

  // Table Body Rows
  doc.font('Helvetica').fontSize(8.5);

  rows.forEach((row, rowIndex) => {
    // 1. Compute dynamic row height based on largest wrapped cell
    let rowHeight = 22;
    row.forEach((cell, i) => {
      const cellHeight = doc.heightOfString(cell, { width: colWidths[i] - 12 }) + 10;
      if (cellHeight > rowHeight) {
        rowHeight = cellHeight;
      }
    });

    // 2. Alternating row background
    if (rowIndex % 2 === 1) {
      doc.rect(startX, currentY, totalWidth, rowHeight).fill('#f8fafc');
    }

    // 3. Row border
    doc.rect(startX, currentY, totalWidth, rowHeight).strokeColor('#e2e8f0').stroke();

    // 4. Render cell text
    currentX = startX;
    doc.fillColor('#334155');
    row.forEach((cell, i) => {
      doc.text(cell, currentX + 6, currentY + 6, { width: colWidths[i] - 12 });
      currentX += colWidths[i];
    });

    currentY += rowHeight;
  });

  doc.y = currentY + 10;
}