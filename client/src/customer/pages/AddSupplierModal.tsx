import React, { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddSupplierModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Company name and email address are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: name.trim(),
          contact_person: contact.trim() || undefined,
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          gstin: gstin.trim().toUpperCase() || undefined,
          pan: pan.trim().toUpperCase() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add supplier');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900">Authorize & Add Supplier to Corporate Pool</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-bold p-1 text-base rounded hover:bg-slate-100 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg font-medium">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Company / Vendor Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Apex Industrial Polymers Ltd"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 p-2 rounded-lg font-medium text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Contact Person</label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="w-full border border-slate-300 p-2 rounded-lg"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Business Phone / WhatsApp</label>
              <input
                type="text"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-slate-300 p-2 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Corporate Email Address *</label>
            <input
              type="email"
              required
              placeholder="e.g. tenders@apexpolymers.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 p-2 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-700 block mb-1">GSTIN (Optional)</label>
              <input
                type="text"
                placeholder="15-digit GSTIN"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="w-full border border-slate-300 p-2 rounded-lg uppercase font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">PAN (Optional)</label>
              <input
                type="text"
                placeholder="10-digit PAN"
                value={pan}
                onChange={(e) => setPan(e.target.value)}
                className="w-full border border-slate-300 p-2 rounded-lg uppercase font-mono"
              />
            </div>
          </div>

          {/* Dual-Track Enterprise Guidance */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <span>💡</span> Dual-Track Supplier Onboarding:
            </div>
            <p>
              • <strong>GSTIN & PAN Provided:</strong> Supplier is pre-approved and receives an email invitation to set their confidential 6-digit access PIN.
            </p>
            <p>
              • <strong>Tax Details Left Blank:</strong> Supplier receives an email invitation to complete their legal business registration and submit tax credentials for NexTrade Operations Desk review.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>✉️</span> {saving ? 'Dispatching...' : 'Authorize & Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

