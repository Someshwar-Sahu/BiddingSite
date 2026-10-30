import React, { useState } from 'react';
import { Auction, Facility } from '../../types/procurement';

interface Props {
  auction: Auction;
  facilities: Facility[];
  onClose: () => void;
  onSuccess: () => void;
}

export const CustomerAmendmentModal: React.FC<Props> = ({ auction, facilities, onClose, onSuccess }) => {
  const [amendmentType, setAmendmentType] = useState<'reschedule' | 'quantity_ceiling' | 'delivery_terms' | 'comprehensive'>('reschedule');
  const [reason, setReason] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newDuration, setNewDuration] = useState(auction.duration_minutes || 60);
  const [facilitySelect, setFacilitySelect] = useState('current');
  const [customLocation, setCustomLocation] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [lotUpdates, setLotUpdates] = useState<{ [id: string]: { quantity?: number; reserve_price?: number } }>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLotChange = (lotId: string, field: 'quantity' | 'reserve_price', val: number) => {
    setLotUpdates((prev) => ({
      ...prev,
      [lotId]: {
        ...(prev[lotId] || {}),
        [field]: val,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a business justification for this amendment request.');
      return;
    }

    const details: any = {};
    const includeReschedule = amendmentType === 'reschedule' || amendmentType === 'comprehensive';
    const includeQuantity = amendmentType === 'quantity_ceiling' || amendmentType === 'comprehensive';
    const includeDelivery = amendmentType === 'delivery_terms' || amendmentType === 'comprehensive';

    if (includeReschedule) {
      if (newStart) {
        details.new_scheduled_start = new Date(newStart).toISOString();
      }
      details.duration_minutes = Number(newDuration) || 60;
    }

    if (includeQuantity) {
      const lotsPayload: any[] = [];
      (auction.lots || []).forEach((lot) => {
        const u = lotUpdates[lot.id];
        if (u && (u.quantity != null || u.reserve_price != null)) {
          lotsPayload.push({
            id: lot.id,
            quantity: u.quantity != null ? u.quantity : lot.quantity,
            reserve_price: u.reserve_price != null ? u.reserve_price : lot.reserve_price,
          });
        }
      });
      if (lotsPayload.length > 0) details.lots = lotsPayload;
    }

    if (includeDelivery) {
      if (facilitySelect === 'custom' && customLocation.trim()) {
        details.delivery_location = customLocation.trim();
      } else if (facilitySelect && facilitySelect !== 'current') {
        details.delivery_location = facilitySelect;
      }
      if (specialInstructions.trim()) {
        details.special_instructions = specialInstructions.trim();
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/customer/auctions/${auction.id}/amendments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amendment_type: amendmentType,
          details,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit amendment request');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isReschedule = amendmentType === 'reschedule' || amendmentType === 'comprehensive';
  const isQuantity = amendmentType === 'quantity_ceiling' || amendmentType === 'comprehensive';
  const isDelivery = amendmentType === 'delivery_terms' || amendmentType === 'comprehensive';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 text-xs overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <span className="font-mono font-bold text-blue-600">{auction.id}</span>
            <h3 className="text-sm font-bold text-slate-900">Request Tender Parameter Amendment</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-bold p-1 text-base rounded hover:bg-slate-200 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl font-medium">
              ⚠️ {error}
            </div>
          )}

          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl">
            <strong className="block text-xs font-bold">Governed Amendment Protocol</strong>
            <p className="text-[11px] opacity-80 mt-0.5">
              Changes requested here are submitted directly to the NexTrade Operations Desk. Once approved, updated terms and magic link reminders are dispatched to authorized vendors.
            </p>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Amendment Category *</label>
            <select
              value={amendmentType}
              onChange={(e) => setAmendmentType(e.target.value as any)}
              className="w-full border border-slate-300 p-2 rounded-lg bg-white font-medium"
            >
              <option value="reschedule">Reschedule Date & Auction Duration</option>
              <option value="quantity_ceiling">Quantity & Reserve Price Ceilings</option>
              <option value="delivery_terms">Delivery Site & Special Commercial Terms</option>
              <option value="comprehensive">Comprehensive Revision (All Parameters)</option>
            </select>
          </div>

          {/* Section: Reschedule */}
          {isReschedule && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="font-bold text-slate-800">1. Reschedule Event</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Proposed Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    className="w-full border border-slate-300 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Duration (Minutes)</label>
                  <input
                    type="number"
                    min="15"
                    max="240"
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    className="w-full border border-slate-300 p-2 rounded-lg font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section: Quantities & Ceilings */}
          {isQuantity && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="font-bold text-slate-800">2. Adjust Lots & Reserve Ceilings</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 font-bold text-slate-700 border-b">
                    <tr>
                      <th className="p-2">Item</th>
                      <th className="p-2">Current Qty</th>
                      <th className="p-2">New Qty</th>
                      <th className="p-2">Current Reserve</th>
                      <th className="p-2">New Reserve (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(auction.lots || []).map((l) => (
                      <tr key={l.id}>
                        <td className="p-2 font-medium">{l.product_name}</td>
                        <td className="p-2 text-slate-500">{l.quantity} {l.uom}</td>
                        <td className="p-2">
                          <input
                            type="number"
                            placeholder={String(l.quantity)}
                            onChange={(e) => handleLotChange(l.id, 'quantity', Number(e.target.value))}
                            className="w-20 border border-slate-300 p-1 rounded font-mono"
                          />
                        </td>
                        <td className="p-2 text-slate-500 font-mono">₹{l.reserve_price}</td>
                        <td className="p-2">
                          <input
                            type="number"
                            placeholder={String(l.reserve_price)}
                            onChange={(e) => handleLotChange(l.id, 'reserve_price', Number(e.target.value))}
                            className="w-24 border border-slate-300 p-1 rounded font-mono font-bold"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section: Delivery Terms */}
          {isDelivery && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="font-bold text-slate-800">3. Delivery Destination & Terms</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Select Delivery Facility</label>
                  <select
                    value={facilitySelect}
                    onChange={(e) => setFacilitySelect(e.target.value)}
                    className="w-full border border-slate-300 p-2 rounded-lg bg-white"
                  >
                    <option value="current">Keep Current ({auction.delivery_location || 'Corporate Site'})</option>
                    {facilities.map((f) => (
                      <option key={f.id} value={`${f.facility_name}, ${f.city} (${f.state})`}>
                        {f.facility_name} — {f.city}
                      </option>
                    ))}
                    <option value="custom">Enter Custom Delivery Site...</option>
                  </select>
                </div>
                {facilitySelect === 'custom' && (
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">Custom Delivery Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Warehouse 4, Manesar"
                      value={customLocation}
                      onChange={(e) => setCustomLocation(e.target.value)}
                      className="w-full border border-slate-300 p-2 rounded-lg"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Updated Instructions / Commercial Terms</label>
                <input
                  type="text"
                  placeholder="e.g. 100% within 15 days of dispatch"
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  className="w-full border border-slate-300 p-2 rounded-lg"
                />
              </div>
            </div>
          )}

          {/* Business Justification */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">Business Justification / Reason *</label>
            <textarea
              required
              rows={3}
              placeholder="Provide context for NexTrade Desk (e.g. Supplier request for delayed delivery, demand surge requiring higher quantity)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-slate-300 p-2.5 rounded-lg text-xs"
            ></textarea>
          </div>

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
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Amendment Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
