import React, { useEffect, useState } from 'react';
import { TenderRequest } from '../../types/procurement';
import { ConfirmModal } from '../../components/ConfirmModal';

interface Props {
  requestId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const InspectRequestModal: React.FC<Props> = ({ requestId, onClose, onSuccess }) => {
  const [request, setRequest] = useState<TenderRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    fetch(`/api/customer/tender-requests/${requestId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.request) {
          setRequest(data.request);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [requestId]);

  // Esc key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showConfirmModal) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showConfirmModal]);

  const executeSignOff = async () => {
    setApproving(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/customer/tender-requests/${requestId}/approve-specs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve tender specifications');
      setShowConfirmModal(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error approving tender specifications.');
      setShowConfirmModal(false);
    } finally {
      setApproving(false);
    }
  };

  const totalBudgetCeiling = (request?.lots || []).reduce(
    (acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.reserve_price) || 0),
    0
  );

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-40 animate-fadeIn">
        <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 text-xs overflow-hidden">
          {/* Header */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <span className="font-mono font-bold text-blue-600">{request?.request_number || requestId}</span>
              <h2 className="text-sm font-bold text-slate-800">Inspect & Sign Off Tender Specifications</h2>
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
              <div className="p-8 text-center text-slate-400">Loading tender specifications...</div>
            ) : (
              <>
                {/* Status Alert Banner */}
                <div
                  className={`p-3.5 rounded-xl border flex items-center gap-3 ${
                    request?.admin_revised === 1
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : request?.customer_approved === 1
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-slate-100 border-slate-200 text-slate-800'
                  }`}
                >
                  <span className="text-xl">
                    {request?.customer_approved === 1 ? '✅' : request?.admin_revised === 1 ? '⚡' : '📋'}
                  </span>
                  <div>
                    <strong className="block text-xs">
                      {request?.customer_approved === 1
                        ? 'Specifications Signed Off by Corporate Buyer'
                        : request?.admin_revised === 1
                        ? 'Updated Specifications Proposed by NexTrade Operations Desk'
                        : 'Original Buyer Intake Specifications'}
                    </strong>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {request?.customer_approved === 1
                        ? 'Tender is approved and ready for live desk launch.'
                        : request?.admin_revised === 1
                        ? 'The auction desk has reviewed and adjusted the lots, reserve ceilings, or schedule. Review below and sign off to authorize the auction event.'
                        : 'Initial specifications submitted to desk.'}
                    </p>
                  </div>
                </div>

                {/* Spec Overview Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-[11px]">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Tender Title</span>
                    <strong className="text-slate-800">{request?.title}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Category</span>
                    <strong className="text-slate-800">{request?.category}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Duration</span>
                    <strong className="text-slate-800">{request?.duration_minutes} Mins</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Delivery Site</span>
                    <strong className="text-slate-800">{request?.delivery_location}</strong>
                  </div>
                </div>

                {/* Commercial Terms */}
                {request?.special_terms && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Commercial Terms & Instructions</span>
                    <p className="text-slate-700 italic mt-0.5 font-medium">{request.special_terms}</p>
                  </div>
                )}

                {/* Lots Table */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800">Procurement Lots & Reserve Ceilings</h3>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Combined Budget Ceiling</span>
                      <span className="font-mono font-black text-slate-900 text-xs">
                        ₹{totalBudgetCeiling.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2">#</th>
                          <th className="p-2">Product Description / Lot</th>
                          <th className="p-2">Quantity</th>
                          <th className="p-2">Reserve Ceiling (₹)</th>
                          <th className="p-2">Min Decrement (₹)</th>
                          <th className="p-2 text-right">Extended Value (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {(request?.lots || []).map((l, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 font-mono text-slate-400">{idx + 1}</td>
                            <td className="p-2 font-semibold text-slate-900">{l.product_name}</td>
                            <td className="p-2">
                              {l.quantity} {l.uom}
                            </td>
                            <td className="p-2 font-mono text-slate-800">
                              ₹{Number(l.reserve_price).toLocaleString('en-IN')}
                            </td>
                            <td className="p-2 font-mono text-slate-500">
                              ₹{Number(l.bid_decrement || 10).toLocaleString('en-IN')}
                            </td>
                            <td className="p-2 font-mono font-bold text-slate-900 text-right">
                              ₹{((Number(l.quantity) || 0) * (Number(l.reserve_price) || 0)).toLocaleString('en-IN')}
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
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Recorded in NexTrade Ingestion Ledger.</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
              {request?.customer_approved !== 1 && (
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <span>✅</span> Sign Off & Approve Specifications
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sleek In-App Enterprise Confirmation Modal (Never native browser dialog) */}
      <ConfirmModal
        isOpen={showConfirmModal}
        variant="success"
        title="Sign Off Tender Specifications"
        message="Are you sure you want to sign off and approve these tender specifications?&#10;&#10;Once approved, NexTrade Operations Desk will be authorized to launch the live reverse auction room."
        confirmText="Sign Off & Approve Specifications"
        cancelText="Cancel"
        isLoading={approving}
        onConfirm={executeSignOff}
        onCancel={() => setShowConfirmModal(false)}
      />
    </>
  );
};
