import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

export interface VendorCertificateData {
  auctionId: string;
  auctionTitle: string;
  customerOrgName: string;
  vendorId: string;
  vendorCompanyName: string;
  vendorContactPerson?: string;
  vendorEmail: string;
  vendorGstin?: string;
  vendorPan?: string;
  concludedAt: string;
  lots: Array<{
    lotNumber: number;
    productName: string;
    quantity: number;
    uom: string;
    winningL1Bid: number | null;
    isMyWin: boolean;
    myLastBid: number | null;
    status: string;
  }>;
  myBidsHistory: Array<{
    lotNumber: number;
    productName: string;
    amount: number;
    timestamp: string;
  }>;
}

export function generateVendorCertificatePdf(
  data: VendorCertificateData,
  outputFilePath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const dir = path.dirname(outputFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Initialize Document with tight bottom margin to prevent accidental blank page spills
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        autoFirstPage: true,
      });

      const writeStream = fs.createWriteStream(outputFilePath);
      doc.pipe(writeStream);

      const pageWidth = doc.page.width;
      const startX = 40;
      const contentWidth = pageWidth - startX * 2; // 515 pt

      // ==========================================
      // 1. TOP HEADER BANNER
      // ==========================================
      doc.rect(0, 0, pageWidth, 95).fill('#0f172a');

      // Brand Logo & Title
      doc.fillColor('#38bdf8').fontSize(18).font('Helvetica-Bold').text('NEXTRADE AUCTIONS', startX, 22, { lineBreak: false });
      doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica').text('Digital Reverse E-Procurement & Asset Auction Platform', startX, 44, { lineBreak: false });
      doc.fillColor('#f8fafc').fontSize(11).font('Helvetica-Bold').text('SUPPLIER TENDER PARTICIPATION CERTIFICATE', startX, 62, { lineBreak: false });

      // Document Type Tag on Right
      const badgeWidth = 140;
      const badgeX = pageWidth - startX - badgeWidth;
      doc.roundedRect(badgeX, 18, badgeWidth, 58, 6).fill('#1e293b');
      doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text('DOCUMENT TYPE', badgeX + 10, 26, { lineBreak: false });
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('Official Bid Receipt', badgeX + 10, 38, { lineBreak: false });
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(`Issued: ${new Date().toLocaleDateString('en-IN')}`, badgeX + 10, 56, { lineBreak: false });

      let currentY = 110;

      // ==========================================
      // 2. SECTION 1: PARTICIPANT & TENDER DETAILS
      // ==========================================
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('1. Tender & Supplier Details', startX, currentY);
      currentY += 16;

      const cardWidth = (contentWidth - 15) / 2;
      const cardHeight = 82;
      const rightCardX = startX + cardWidth + 15;

      // Left Box: Supplier Profile
      doc.roundedRect(startX, currentY, cardWidth, cardHeight, 6).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica-Bold').text('CERTIFIED SUPPLIER', startX + 10, currentY + 8, { lineBreak: false });
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text(data.vendorCompanyName, startX + 10, currentY + 20, { width: cardWidth - 20, lineBreak: false });
      doc.fillColor('#475569').fontSize(8).font('Helvetica').text(`Officer: ${data.vendorContactPerson || 'Authorized Representative'}`, startX + 10, currentY + 34, { lineBreak: false });
      doc.text(`Email: ${data.vendorEmail}`, startX + 10, currentY + 47, { lineBreak: false });
      doc.text(`GSTIN/PAN: ${data.vendorGstin || 'Registered'} • ${data.vendorPan || 'Verified'}`, startX + 10, currentY + 60, { lineBreak: false });

      // Right Box: Tender Profile
      doc.roundedRect(rightCardX, currentY, cardWidth, cardHeight, 6).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica-Bold').text('TENDER SPECIFICATIONS', rightCardX + 10, currentY + 8, { lineBreak: false });
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text(`Event ID: ${data.auctionId}`, rightCardX + 10, currentY + 20, { lineBreak: false });
      const truncatedTitle = data.auctionTitle.length > 38 ? `${data.auctionTitle.substring(0, 36)}...` : data.auctionTitle;
      doc.fillColor('#475569').fontSize(8).font('Helvetica').text(`Title: ${truncatedTitle}`, rightCardX + 10, currentY + 34, { lineBreak: false });
      doc.text(`Buyer: ${data.customerOrgName}`, rightCardX + 10, currentY + 47, { lineBreak: false });
      doc.text(`Concluded: ${new Date(data.concludedAt).toLocaleString('en-IN')}`, rightCardX + 10, currentY + 60, { lineBreak: false });

      currentY += cardHeight + 16;

      // ==========================================
      // 3. SECTION 2: LOT OUTCOMES TABLE
      // ==========================================
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('2. Procurement Lots & Award Outcome', startX, currentY);
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(
        'Note: Under antitrust & confidential reverse procurement rules, competitor pricing and identities are strictly redacted.',
        startX, currentY + 14, { width: contentWidth, lineBreak: false }
      );
      currentY += 28;

      // Table Header
      const lotColWidths = [40, 185, 75, 75, 75, 65]; // Total = 515 pt
      const lotHeaders = ['Lot #', 'Product Description', 'Volume / UOM', 'Winning L1', 'Your Final', 'Status'];

      doc.rect(startX, currentY, contentWidth, 20).fill('#1e2238');
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');

      let colX = startX;
      lotHeaders.forEach((h, i) => {
        doc.text(h, colX + 6, currentY + 6, { width: lotColWidths[i] - 12, lineBreak: false });
        colX += lotColWidths[i];
      });

      currentY += 20;

      // Table Rows
      data.lots.forEach((lot, index) => {
        const isWin = lot.isMyWin;
        const rowBg = isWin ? '#f0fdf4' : index % 2 === 1 ? '#f8fafc' : '#ffffff';

        doc.rect(startX, currentY, contentWidth, 20).fill(rowBg);
        doc.rect(startX, currentY, contentWidth, 20).strokeColor('#e2e8f0').stroke();

        colX = startX;

        // Lot #
        doc.fillColor('#334155').fontSize(8).font('Helvetica').text(String(lot.lotNumber), colX + 6, currentY + 6, { lineBreak: false });
        colX += lotColWidths[0];

        // Product Description
        const prodName = lot.productName.length > 34 ? `${lot.productName.substring(0, 32)}...` : lot.productName;
        doc.font('Helvetica-Bold').fillColor('#0f172a').text(prodName, colX + 6, currentY + 6, { lineBreak: false });
        colX += lotColWidths[1];

        // Volume / UOM
        doc.font('Helvetica').fillColor('#334155').text(`${lot.quantity.toLocaleString('en-IN')} ${lot.uom}`, colX + 6, currentY + 6, { lineBreak: false });
        colX += lotColWidths[2];

        // Winning L1 (Using clean INR prefix, zero unicode glitches)
        const l1Text = lot.winningL1Bid ? `INR ${lot.winningL1Bid.toLocaleString('en-IN')}` : 'No Bids';
        doc.text(l1Text, colX + 6, currentY + 6, { lineBreak: false });
        colX += lotColWidths[3];

        // Your Final Bid
        const myBidText = lot.myLastBid ? `INR ${lot.myLastBid.toLocaleString('en-IN')}` : 'Did not bid';
        doc.text(myBidText, colX + 6, currentY + 6, { lineBreak: false });
        colX += lotColWidths[4];

        // Status Badge (Shortened to avoid text clipping)
        if (isWin) {
          doc.fillColor('#15803d').font('Helvetica-Bold').text('WON (L1)', colX + 6, currentY + 6, { lineBreak: false });
        } else if (lot.myLastBid) {
          doc.fillColor('#64748b').font('Helvetica-Bold').text('OUTBID', colX + 6, currentY + 6, { lineBreak: false });
        } else {
          doc.fillColor('#94a3b8').font('Helvetica').text('NO PARTICIPATION', colX + 6, currentY + 6, { lineBreak: false });
        }

        currentY += 20;
      });

      currentY += 16;

      // ==========================================
      // 4. SECTION 3: SUPPLIER SUBMISSION AUDIT TRAIL
      // ==========================================
      doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('3. Supplier Bid Audit Log (Your Official Submissions)', startX, currentY);
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(
        'Chronological record of legally binding electronic price drops submitted by your company during the live session.',
        startX, currentY + 14, { width: contentWidth, lineBreak: false }
      );
      currentY += 28;

      const auditColWidths = [165, 220, 130]; // Total = 515 pt
      const auditHeaders = ['Submission Timestamp (IST)', 'Procurement Lot', 'Submitted Price Drop'];

      doc.rect(startX, currentY, contentWidth, 20).fill('#1e2238');
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');

      colX = startX;
      auditHeaders.forEach((h, i) => {
        doc.text(h, colX + 6, currentY + 6, { width: auditColWidths[i] - 12, lineBreak: false });
        colX += auditColWidths[i];
      });

      currentY += 20;

      if (data.myBidsHistory.length === 0) {
        doc.rect(startX, currentY, contentWidth, 24).fill('#ffffff').strokeColor('#e2e8f0').stroke();
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica-Oblique').text(
          'No bids were submitted by your company during this live reverse auction event.',
          startX + 10, currentY + 7, { lineBreak: false }
        );
        currentY += 24;
      } else {
        // Show up to 10 most recent bids to keep certificate single-page if possible
        const displayedBids = data.myBidsHistory.slice(0, 10);
        displayedBids.forEach((b, index) => {
          const rowBg = index % 2 === 1 ? '#f8fafc' : '#ffffff';
          doc.rect(startX, currentY, contentWidth, 18).fill(rowBg);
          doc.rect(startX, currentY, contentWidth, 18).strokeColor('#e2e8f0').stroke();

          colX = startX;

          // Timestamp
          doc.fillColor('#334155').fontSize(8).font('Helvetica').text(
            new Date(b.timestamp).toLocaleString('en-IN'),
            colX + 6, currentY + 5, { lineBreak: false }
          );
          colX += auditColWidths[0];

          // Lot
          const lotDesc = `Lot #${b.lotNumber}: ${b.productName.substring(0, 34)}`;
          doc.font('Helvetica-Bold').fillColor('#0f172a').text(lotDesc, colX + 6, currentY + 5, { lineBreak: false });
          colX += auditColWidths[1];

          // Amount
          doc.font('Helvetica-Bold').fillColor('#0284c7').text(
            `INR ${b.amount.toLocaleString('en-IN')}`,
            colX + 6, currentY + 5, { lineBreak: false }
          );

          currentY += 18;
        });
      }

      // ==========================================
      // 5. FIXED FOOTER (Zero Page Spill Guarantee)
      // ==========================================
      // Disable bottom auto page break for footer positioning
      (doc as any).options.margins.bottom = 0;

      const footerY = doc.page.height - 48;
      doc.moveTo(startX, footerY).lineTo(startX + contentWidth, footerY).strokeColor('#cbd5e1').stroke();

      doc.fillColor('#94a3b8').fontSize(7).font('Helvetica').text(
        'CONFIDENTIAL & PROPRIETARY • Official certificate confirming supplier reverse auction participation under NexTrade Master Procurement Rules.',
        startX, footerY + 6, { lineBreak: false }
      );
      doc.fillColor('#0284c7').fontSize(7.5).font('Helvetica-Bold').text(
        'DIGITALLY VERIFIED BY NEXTRADE PROCUREMENT DESK • Valid without physical signature.',
        startX, footerY + 18, { lineBreak: false }
      );

      doc.end();

      writeStream.on('finish', () => resolve(outputFilePath));
      writeStream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}
