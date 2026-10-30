import React, { useEffect, useState } from 'react';
import { TenderRequest, Lot } from '../../types/procurement';
import { ConfirmModal } from '../../components/ConfirmModal';

interface Props {
  requestId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReviewRequestModal: React.FC<Props> = ({ requestId, onClose, onSuccess }) => {
  const [request, setRequest] = useState<TenderRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  const [lots, setLots] = useState<Lot[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [duration, setDuration] = useState(60);
  const [terms, setTerms] = useState('');

  useEffect(() => {
    fetch(`/api/customer/tender-requests/${requestId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.request) {
          const r: TenderRequest = data.request;
          setRequest(r);
          setTitle(r.title || '');
          setCategory(r.category || 'General Procurement');
          setDeliveryLocation(r.delivery_location || '');
          setDuration(r.duration_minutes || 60);
          setTerms(r.special_terms || '');
          setLots(r.lots || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [requestId]);

  // Keyboard Esc listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showOverrideModal) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showOverrideModal]);

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
        product_name: 'New Procurement Item',
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

  const handleSaveUpdates = async () => {
    if (lots.length === 0) {
      setErrorMessage('Please define at least one procurement lot.');
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/tender-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category,
          duration_minutes: duration,
          delivery_location: deliveryLocation,
          special_terms: terms,
          lots,
        }),
      });
      if (!res.ok) throw new Error('Failed to save specifications');
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLaunchClick = () => {
    if (request && request.customer_approved !== 1) {
      setShowOverrideModal(true);
      return;
    }
    executeLaunch();
  };

  const executeLaunch = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      // 1. Save latest edits first
      await fetch(`/api/admin/tender-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category,
          duration_minutes: duration,
          delivery_location: deliveryLocation,
          special_terms: terms,
          lots,
        }),
      });

      // 2. Convert to auction
      const res = await fetch(`/api/admin/tender-requests/${requestId}/convert`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to convert to live auction');
      setShowOverrideModal(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message);
      setShowOverrideModal(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-40 animate-fadeIn">
        <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 text-xs overflow-hidden">
          {/* Header */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-blue-600">{request?.request_number || requestId}</span>
                <span className="text-slate-400">•</span>
                <span className="font-semibold text-slate-700">{request?.company_name}</span>
              </div>
              <h2 className="text-sm font-bold text-slate-900">Desk Tender Intake Review & Operational Setup</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 font-bold p-1 text-base rounded-md hover:bg-slate-200 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center gap-2">
                <span>⚠️</span>
                <span className="font-semibold">{errorMessage}</span>
              </div>
            )}

            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading tender intake details...</div>
            ) : (
              <>
                {/* Approval Badge Banner */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    request?.customer_approved === 1
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : request?.admin_revised === 1
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : 'bg-blue-50 border-blue-200 text-blue-950'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">
                      {request?.customer_approved === 1 ? '✅' : request?.admin_revised === 1 ? '⚡' : '📋'}
                    </span>
                    <div>
                      <strong className="block">
                        {request?.customer_approved === 1
                          ? 'Corporate Buyer Approved'
                          : request?.admin_revised === 1
                          ? 'Awaiting Buyer Sign-Off (Admin Revised)'
                          : 'Initial Intake Submission'}
                      </strong>
                      <span className="text-[11px] opacity-80">
                        {request?.customer_approved === 1
                          ? 'Authorized for immediate live auction room launch.'
                          : 'Desk revisions require client sign-off before official launch.'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Tender Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full border border-slate-300 p-2 rounded-lg font-semibold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Procurement Category</label>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full border border-slate-300 p-2 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Duration (Minutes)</label>
                    <input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-full border border-slate-300 p-2 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Target Delivery Facility</label>
                    <input
                      type="text"
                      value={deliveryLocation}
                      onChange={(e) => setDeliveryLocation(e.target.value)}
                      className="w-full border border-slate-300 p-2 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Commercial Instructions / Terms</label>
                  <input
                    type="text"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    className="w-full border border-slate-300 p-2 rounded-lg"
                  />
                </div>

                {/* Lots Editor */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800">Procurement Lots & Ceilings</h3>
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
                      <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-2">#</th>
                          <th className="p-2">Product Description *</th>
                          <th className="p-2">Quantity *</th>
                          <th className="p-2">UOM</th>
                          <th className="p-2 font-mono">Reserve Ceiling (₹) *</th>
                          <th className="p-2 font-mono">Min Decrement (₹)</th>
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
          </div>

          {/* Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveUpdates}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
              >
                💾 Save Updates & Send for Buyer Review
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleLaunchClick}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
              >
                ⚡ Launch Live Auction
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Override Confirmation Modal */}
      <ConfirmModal
        isOpen={showOverrideModal}
        variant="warning"
        title="Override Corporate Buyer Approval?"
        message="⚠️ Corporate Buyer has not yet signed off on these specifications.&#10;&#10;Override and launch this reverse auction room now anyway?"
        confirmText="Launch Reverse Auction Now"
        cancelText="Keep in Review"
        isLoading={saving}
        onConfirm={executeLaunch}
        onCancel={() => setShowOverrideModal(false)}
      />
    </>
  );
};
