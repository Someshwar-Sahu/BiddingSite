import { Router } from 'express';
import Database from 'better-sqlite3';

export function createAdminCompaniesRouter(db: Database.Database): Router {
  const router = Router();

  // List all corporate client companies
  router.get('/companies', (_req, res) => {
    const companies = db.prepare('SELECT * FROM organizations ORDER BY name ASC').all();
    res.json(companies);
  });

  // Create a new corporate client company
  router.post('/companies', (req, res) => {
    const { name, gstin, email, phone, shortCode } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

    const id = `org_${(shortCode || name).toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8)}`;
    try {
      db.prepare(`
        INSERT INTO organizations (id, name, gstin, email, phone)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, name, gstin || null, email, phone || null);
      res.json({ success: true, company: { id, name } });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Get a specific company's vendor pool
  router.get('/companies/:id/vendors', (req, res) => {
    const vendors = db.prepare(`
      SELECT v.* 
      FROM vendors v
      JOIN company_vendors cv ON v.id = cv.vendor_id
      WHERE cv.company_id = ?
      ORDER BY v.company_name ASC
    `).all(req.params.id);
    res.json(vendors);
  });

  // Add/associate a vendor into a company's specific vendor pool
  router.post('/companies/:id/vendors', (req, res) => {
    const companyId = req.params.id;

    // Direct linking by existing vendor ID
    if (req.body.vendorId) {
      try {
        db.prepare(`
          INSERT OR IGNORE INTO company_vendors (company_id, vendor_id)
          VALUES (?, ?)
        `).run(companyId, req.body.vendorId);
        return res.json({ success: true, vendorId: req.body.vendorId });
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
    }

    const { company_name, contact_person, email, phone, gstin, pan } = req.body;

    if (!email || !company_name) {
      return res.status(400).json({ error: 'Company name and email are required.' });
    }

    const transaction = db.transaction(() => {
      let vendor = db.prepare('SELECT id FROM vendors WHERE email = ?').get(email) as any;
      if (!vendor) {
        const vId = `vnd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        db.prepare(`
          INSERT INTO vendors (id, company_name, contact_person, email, phone, gstin, pan, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
        `).run(vId, company_name, contact_person || 'Representative', email, phone || '9999999999', gstin || null, pan || null);
        vendor = { id: vId };
      }

      db.prepare(`
        INSERT OR IGNORE INTO company_vendors (company_id, vendor_id)
        VALUES (?, ?)
      `).run(companyId, vendor.id);

      return vendor.id;
    });

    try {
      const vendorId = transaction();
      res.json({ success: true, vendorId });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Remove vendor from a company's vendor pool
  router.delete('/companies/:companyId/vendors/:vendorId', (req, res) => {
    try {
      db.prepare(`
        DELETE FROM company_vendors 
        WHERE company_id = ? AND vendor_id = ?
      `).run(req.params.companyId, req.params.vendorId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
