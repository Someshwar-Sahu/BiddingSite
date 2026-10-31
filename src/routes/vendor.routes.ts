import path from 'path';
import { Router } from 'express';
import Database from 'better-sqlite3';
import { requireVendorAuth, parseCookies, validateSession, hashPassword, createSession } from '../auth.js';
import { generateVendorCertificatePdf, type VendorCertificateData } from '../vendor-report-generator.js';

export function createVendorPortalRouter(db: Database.Database, getPresenceCheck?: (auctionId: string, vendorId: string) => boolean): Router {
  const router = Router();

  // Helper to extract authenticated vendorId from session
  const getAuthenticatedVendor = (req: any): any => {
    const cookies = parseCookies(req.headers.cookie);
    const session = validateSession(db, cookies['nta_vendor_session'], 'vendor');
    if (!session || session.role !== 'vendor') return null;

    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(session.organizationId || session.userId) as any;
    return vendor || { id: session.organizationId, company_name: session.fullName, email: session.email };
  };

  // 0a. Check Vendor Onboarding Info by Token
  router.get('/onboard-info', (req, res) => {
    try {
      const token = ((req.query.token as string) || (req.query.key as string) || '').trim();
      if (!token) {
        return res.status(400).json({ error: 'Onboarding invitation token is required.' });
      }

      // Check vendors table by onboarding_token
      let vendor = db.prepare('SELECT * FROM vendors WHERE onboarding_token = ?').get(token) as any;

      // Fallback: check auction_invites table
      if (!vendor) {
        const invite = db
          .prepare('SELECT vendor_id, expires_at FROM auction_invites WHERE token = ? AND is_revoked = 0')
          .get(token) as any;
        if (invite && invite.vendor_id) {
          vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(invite.vendor_id) as any;
        }
      }

      if (!vendor) {
        return res.status(404).json({
          error: 'Invalid or expired onboarding invitation link. Please request a new invite from the operations desk.',
        });
      }

      // Determine onboarding type: if all details (gstin, pan) are present, it is pin_only; else full KYC
      const hasFullDetails = Boolean(
        vendor.gstin && vendor.pan && vendor.contact_person && vendor.contact_person !== 'Representative'
      );
      const onboardingType = vendor.onboarding_type || (hasFullDetails ? 'pin_only' : 'full');

      res.json({
        valid: true,
        onboardingType,
        vendor: {
          id: vendor.id,
          companyName: vendor.company_name || '',
          email: vendor.email,
          contactPerson: vendor.contact_person === 'Representative' ? '' : vendor.contact_person || '',
          phone: vendor.phone === 'N/A' || vendor.phone === '9999999999' ? '' : vendor.phone || '',
          gstin: vendor.gstin || '',
          pan: vendor.pan || '',
          address: vendor.address || '',
          status: vendor.status,
          hasPassword: Boolean(vendor.password_hash),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error checking onboarding info' });
    }
  });

  // 0b. Complete Onboarding / PIN Setup
  router.post('/complete-onboarding', (req, res) => {
    try {
      const { token, company_name, contact_person, phone, gstin, pan, address, pin } = req.body;
      if (!token || !pin) {
        return res.status(400).json({ error: 'Token and 6-digit access PIN are required.' });
      }

      if (String(pin).trim().length < 6) {
        return res.status(400).json({ error: 'Access PIN must be at least 6 characters / digits.' });
      }

      // Find vendor
      let vendor = db.prepare('SELECT * FROM vendors WHERE onboarding_token = ?').get(String(token).trim()) as any;
      if (!vendor) {
        const invite = db
          .prepare('SELECT vendor_id FROM auction_invites WHERE token = ? AND is_revoked = 0')
          .get(String(token).trim()) as any;
        if (invite && invite.vendor_id) {
          vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(invite.vendor_id) as any;
        }
      }

      if (!vendor) {
        return res.status(404).json({ error: 'Invalid or expired onboarding token.' });
      }

      const hasFullDetails = Boolean(
        vendor.gstin && vendor.pan && vendor.contact_person && vendor.contact_person !== 'Representative'
      );
      const onboardingType = vendor.onboarding_type || (hasFullDetails ? 'pin_only' : 'full');
      const pinHash = hashPassword(String(pin).trim());

      if (onboardingType === 'full') {
        const compName = (company_name || vendor.company_name || '').trim();
        const contact = (contact_person || vendor.contact_person || '').trim();
        const ph = (phone || vendor.phone || '').trim();
        const gst = (gstin || vendor.gstin || '').trim().toUpperCase();
        const pn = (pan || vendor.pan || '').trim().toUpperCase();
        const addr = (address || vendor.address || '').trim();

        if (!compName || !contact || !ph || !gst || !pn) {
          return res.status(400).json({
            error: 'All fields (Legal Company Name, Contact Person, Phone, GSTIN, PAN) are required for KYC onboarding.',
          });
        }

        if (gst.length !== 15) {
          return res.status(400).json({ error: 'GSTIN must be exactly 15 characters (e.g., 27AAPFU0939F1ZV).' });
        }

        if (pn.length !== 10) {
          return res.status(400).json({ error: 'PAN must be exactly 10 characters (e.g., AAPFU0939F).' });
        }

        // Update vendor details and set to pending_approval for admin verification
        db.prepare(`
          UPDATE vendors 
          SET company_name = ?, contact_person = ?, phone = ?, gstin = ?, pan = ?, address = ?, password_hash = ?, status = 'pending_approval', onboarding_token = NULL
          WHERE id = ?
        `).run(compName, contact, ph, gst, pn, addr, pinHash, vendor.id);

        // Ensure user in platform_users
        const uId = `usr_${vendor.id}`;
        try {
          db.prepare(`
            INSERT INTO platform_users (id, email, password_hash, role, organization_id, full_name)
            VALUES (?, ?, ?, 'vendor', NULL, ?)
            ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, full_name = excluded.full_name
          `).run(uId, vendor.email.toLowerCase().trim(), pinHash, compName);
        } catch (_) {}

        return res.json({
          success: true,
          status: 'pending_approval',
          message:
            'Your supplier profile & KYC has been submitted successfully! NexTrade Operations Desk will review and approve your application. You will be able to log in once approved.',
        });
      } else {
        // PIN Setup Only -> Direct Activation
        db.prepare(`
          UPDATE vendors 
          SET password_hash = ?, status = 'approved', onboarding_token = NULL
          WHERE id = ?
        `).run(pinHash, vendor.id);

        const uId = `usr_${vendor.id}`;
        try {
          db.prepare(`
            INSERT INTO platform_users (id, email, password_hash, role, organization_id, full_name)
            VALUES (?, ?, ?, 'vendor', NULL, ?)
            ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash
          `).run(uId, vendor.email.toLowerCase().trim(), pinHash, vendor.company_name);
        } catch (_) {}

        // Auto-login session
        const sessionId = createSession(db, uId, 'vendor', vendor.id, 30);
        res.setHeader(
          'Set-Cookie',
          `nta_vendor_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`
        );

        return res.json({
          success: true,
          status: 'approved',
          redirect: '/vendor/dashboard',
          message: 'Security PIN set successfully! Your account is activated.',
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error completing supplier onboarding' });
    }
  });

  // 1. Get all tenders for the authenticated supplier
  router.get('/tenders', requireVendorAuth(db), (req, res) => {
    try {
      const vendorId = (req as any).vendorId;

      // Find all auctions invited to this vendor
      const invites = db.prepare(`
        SELECT 
          i.token, i.expires_at,
          a.id as auction_id, a.title, a.category, a.status,
          a.scheduled_start, a.current_end, a.duration_minutes, a.delivery_location,
          o.name as customer_name
        FROM auction_invites i
        JOIN auctions a ON i.auction_id = a.id
        LEFT JOIN organizations o ON a.customer_org_id = o.id
        WHERE i.vendor_id = ? AND i.is_revoked = 0
        ORDER BY a.scheduled_start DESC
      `).all(vendorId) as any[];

      // Enhance with lot statistics per auction
      const tendersWithStats = invites.map((inv) => {
        const lots = db.prepare(`
          SELECT id, lot_number, product_name, quantity, uom, start_price, 
                 current_lowest_bid, current_l1_vendor_id, status
          FROM lots
          WHERE auction_id = ?
        `).all(inv.auction_id) as any[];

        const myL1Wins = lots.filter((l) => l.current_l1_vendor_id === vendorId).length;
        const totalLots = lots.length;

        // Check if anyone from this company is currently inside the room
        const isManned = getPresenceCheck ? getPresenceCheck(inv.auction_id, vendorId) : false;

        return {
          auctionId: inv.auction_id,
          title: inv.title,
          category: inv.category || 'General Procurement',
          status: inv.status,
          customerName: inv.customer_name || 'Enterprise Buyer',
          deliveryLocation: inv.delivery_location || 'Plant Site',
          scheduledStart: inv.scheduled_start,
          currentEnd: inv.current_end,
          durationMinutes: inv.duration_minutes,
          token: inv.token,
          totalLots,
          myL1Wins,
          isManned,
        };
      });

      const live = tendersWithStats.filter((t) => t.status === 'live' || t.status === 'extended');
      const upcoming = tendersWithStats.filter((t) => t.status === 'scheduled');
      const concluded = tendersWithStats.filter((t) => t.status === 'ended' || t.status === 'cancelled');

      res.json({
        live,
        upcoming,
        concluded,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error fetching vendor tenders' });
    }
  });

  // 2. Download Confidential Supplier Outcome Certificate PDF
  router.get('/reports/:auctionId', async (req, res) => {
    try {
      const auctionId = req.params.auctionId;

      // Allow either vendor session OR token in query
      let vendorId: string | null = null;
      let vendor: any = null;

      const token = req.query.key as string;
      if (token) {
        const invite = db.prepare('SELECT vendor_id FROM auction_invites WHERE token = ? AND auction_id = ?').get(token, auctionId) as any;
        if (invite) vendorId = invite.vendor_id;
      }

      if (!vendorId) {
        const vendorAuth = getAuthenticatedVendor(req);
        if (vendorAuth) {
          vendorId = vendorAuth.id;
          vendor = vendorAuth;
        }
      }

      if (!vendorId) {
        return res.status(401).json({ error: 'Unauthorized: Vendor authentication or access token required.' });
      }

      if (!vendor) {
        vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendorId) as any;
      }

      const auction = db.prepare(`
        SELECT a.*, o.name as customer_org_name 
        FROM auctions a 
        LEFT JOIN organizations o ON a.customer_org_id = o.id 
        WHERE a.id = ?
      `).get(auctionId) as any;

      if (!auction) {
        return res.status(404).json({ error: 'Tender record not found.' });
      }

      // Fetch lots and determine my wins and last bids
      const lots = db.prepare(`
        SELECT * FROM lots WHERE auction_id = ? ORDER BY lot_number ASC
      `).all(auctionId) as any[];

      const lotSummaries = lots.map((l) => {
        const myLastBidRow = db.prepare(`
          SELECT amount FROM bids WHERE lot_id = ? AND vendor_id = ? ORDER BY amount ASC LIMIT 1
        `).get(l.id, vendorId) as any;

        return {
          lotNumber: l.lot_number,
          productName: l.product_name,
          quantity: l.quantity,
          uom: l.uom,
          winningL1Bid: l.current_lowest_bid || null,
          isMyWin: l.current_l1_vendor_id === vendorId,
          myLastBid: myLastBidRow?.amount || null,
          status: l.status,
        };
      });

      // Fetch all bids placed by this vendor in this auction
      const myBidsHistory = db.prepare(`
        SELECT b.amount, b.created_at as timestamp, l.lot_number, l.product_name
        FROM bids b
        JOIN lots l ON b.lot_id = l.id
        WHERE l.auction_id = ? AND b.vendor_id = ?
        ORDER BY b.created_at DESC
      `).all(auctionId, vendorId) as any[];

      const certificateData: VendorCertificateData = {
        auctionId: auction.id,
        auctionTitle: auction.title,
        customerOrgName: auction.customer_org_name || 'Enterprise Client',
        vendorId: vendor.id,
        vendorCompanyName: vendor.company_name,
        vendorContactPerson: vendor.contact_person,
        vendorEmail: vendor.email,
        vendorGstin: vendor.gstin,
        vendorPan: vendor.pan,
        concludedAt: auction.current_end,
        lots: lotSummaries,
        myBidsHistory,
      };

      const filename = `Supplier_Certificate_${auction.id}_${vendor.id}.pdf`;
      const outputPath = path.resolve('data/reports', filename);

      await generateVendorCertificatePdf(certificateData, outputPath);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.sendFile(outputPath);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error generating vendor certificate' });
    }
  });

  // 3. Vendor Team Members API
  router.get('/team', requireVendorAuth(db), (req, res) => {
    try {
      const vendorId = (req as any).vendorId;
      const team = db
        .prepare('SELECT * FROM vendor_team_members WHERE vendor_id = ? ORDER BY created_at ASC')
        .all(vendorId);
      res.json({ team });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error fetching vendor team members' });
    }
  });

  router.post('/team', requireVendorAuth(db), (req, res) => {
    try {
      const vendorId = (req as any).vendorId;
      const { full_name, email, phone, role } = req.body;
      if (!full_name || !email) {
        return res.status(400).json({ error: 'Full name and email are required.' });
      }

      const id = `vtm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      db.prepare(`
        INSERT INTO vendor_team_members (id, vendor_id, full_name, email, phone, role, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run(id, vendorId, full_name.trim(), email.trim().toLowerCase(), (phone || '').trim(), role || 'primary_bidder');

      res.json({
        success: true,
        member: { id, full_name: full_name.trim(), email: email.trim().toLowerCase(), role: role || 'primary_bidder' },
        message: 'Team member added successfully.',
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Error adding team member' });
    }
  });

  router.delete('/team/:id', requireVendorAuth(db), (req, res) => {
    try {
      const vendorId = (req as any).vendorId;
      db.prepare('DELETE FROM vendor_team_members WHERE id = ? AND vendor_id = ?').run(req.params.id, vendorId);
      res.json({ success: true, message: 'Team member removed.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Error deleting team member' });
    }
  });

  return router;
}

