import React, { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddFacilityModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !city.trim() || !state.trim()) {
      setError('Facility name, city, and state are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/facilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facility_name: name.trim(),
          city: city.trim(),
          state: state.trim(),
          address: address.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add plant facility');
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900">Add Corporate Plant / Delivery Site</h3>
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
            <label className="font-bold text-slate-700 block mb-1">Facility / Plant Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Bhiwadi Packaging Hub"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 p-2 rounded-lg font-medium text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-700 block mb-1">City *</label>
              <input
                type="text"
                required
                placeholder="e.g. Bhiwadi"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full border border-slate-300 p-2 rounded-lg"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">State *</label>
              <input
                type="text"
                required
                placeholder="e.g. Rajasthan"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full border border-slate-300 p-2 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Full Postal / Plant Address</label>
            <textarea
              rows={2}
              placeholder="e.g. Plot 42-45, Phase III, Industrial Area"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full border border-slate-300 p-2 rounded-lg text-xs"
            ></textarea>
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
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Add Plant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

