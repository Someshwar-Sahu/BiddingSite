import React, { useEffect, useState } from 'react';
import { TenderRequest, Lot } from '../../types/procurement';

interface Props {
  requestId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const CustomerEditRequestModal: React.FC<Props> = ({ requestId, onClose, onSuccess }) => {
  const [request, setRequest] = useState<TenderRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [duration, setDuration] = useState(45);
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [terms, setTerms] = useState('');
  const [lots, setLots] = useState<Lot[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/customer/tender-requests/${requestId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.request) {
          const r: TenderRequest = data.request;
          setRequest(r);
          setTitle(r.title || '');
          setCategory(r.category || 'General Procurement');
          setDuration(r.duration_minutes || 45);
          setDeliveryLocation(r.delivery_location || '');
          setTerms(r.special_terms || '');
          setLots(r.lots || []);
          if (r.target_date) {
            const d = new Date(r.target_date);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            setTargetDate(d.toISOString().slice(0, 16));
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [requestId]);

  const handleLotChange = (index: number, field: keyof Lot, value: any) => {
    setLots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddLot = () => {
    setLots((prev) => [
      ...prev,
      {
        product_name: 'Procurement Item',
        quantity: 100,
        uom: 'Nos',
        reserve_price: 1000,
        bid_decrement: 10,
      },
    ]);
  };

  const handleRemoveLot = (idx: number) => {
    setLots((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Tender title is required.');
      return;
    }
    if (lots.length === 0) {
      setError('Please specify at least one procurement lot item.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/customer/tender-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category,
          target_date: targetDate ? new Date(targetDate).toISOString() : undefined,
          duration_minutes: duration,
          delivery_location: deliveryLocation,
          special_terms: terms,
          lots,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update tender specifications');
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col border border-slate-200 text-xs overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <span className="font-mono font-bold text-blue-600">{request?.request_number || requestId}</span>
            <h3 className="text-sm font-bold text-slate-900">Modify Pending Tender Intake Specifications</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-bold p-1 text-base rounded hover:bg-slate-200 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl font-medium">
              ⚠️ {error}
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading tender specifications...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tender Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full border border-slate-300 p-2 rounded-lg font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Procurement Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full border border-slate-300 p-2 rounded-lg bg-white"
                  >
                    <option value="Packaging & Pallets">Packaging & Pallets</option>
                    <option value="Petrochemicals & Solvents">Petrochemicals & Solvents</option>
                    <option value="Raw Materials & Minerals">Raw Materials & Minerals</option>
                    <option value="Metals & Disposal Scrap">Metals & Disposal Scrap</option>
                    <option value="Freight & Logistics">Freight & Logistics</option>
                    <option value="General Enterprise Procurement">General Enterprise Procurement</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Target Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full border border-slate-300 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Auction Duration (Mins)</label>
                  <input
                    type="number"
                    min="15"
                    max="240"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full border border-slate-300 p-2 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Delivery Plant / Site</label>
                  <input
                    type="text"
                    value={deliveryLocation}
                    onChange={(e) => setDeliveryLocation(e.target.value)}
                    className="w-full border border-slate-300 p-2 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Commercial Terms / Special Instructions</label>
                <input
                  type="text"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="w-full border border-slate-300 p-2 rounded-lg"
                />
              </div>

              {/* Lots Table */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800">Procurement Lots & Ceilings</h4>
                  <button
                    type="button"
                    onClick={handleAddLot}
                    className="text-blue-600 hover:text-blue-800 font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <span>+</span> Add Another Lot
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                      <tr>
                        <th className="p-2">#</th>
                        <th className="p-2">Product Description *</th>
                        <th className="p-2">Quantity *</th>
                        <th className="p-2">UOM</th>
                        <th className="p-2 font-mono">Reserve Ceiling (₹) *</th>
                        <th className="p-2 font-mono">Min Decr (₹)</th>
                        <th className="p-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {lots.map((l, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 font-mono text-slate-400">{idx + 1}</td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={l.product_name}
                              onChange={(e) => handleLotChange(idx, 'product_name', e.target.value)}
                              className="w-full border border-slate-300 p-1 rounded font-semibold"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={l.quantity}
                              onChange={(e) => handleLotChange(idx, 'quantity', Number(e.target.value))}
                              className="w-20 border border-slate-300 p-1 rounded font-mono font-bold"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={l.uom || 'Nos'}
                              onChange={(e) => handleLotChange(idx, 'uom', e.target.value)}
                              className="border border-slate-300 p-1 rounded"
                            >
                              <option value="Nos">Nos</option>
                              <option value="MT">MT</option>
                              <option value="KG">KG</option>
                              <option value="Ltr">Ltr</option>
                              <option value="Lots">Lots</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={l.reserve_price}
                              onChange={(e) => handleLotChange(idx, 'reserve_price', Number(e.target.value))}
                              className="w-24 border border-slate-300 p-1 rounded font-mono font-bold"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={l.bid_decrement}
                              onChange={(e) => handleLotChange(idx, 'bid_decrement', Number(e.target.value))}
                              className="w-20 border border-slate-300 p-1 rounded font-mono"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLot(idx)}
                              className="text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5 rounded hover:bg-red-50 cursor-pointer"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
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
              <span>💾</span> Save Updates & Transmit to Desk
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

