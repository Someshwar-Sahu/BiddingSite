import React, { useEffect } from 'react';

interface Invite {
  auction_id: string;
  role: string;
  company_name?: string;
  phone?: string;
  accessUrl: string;
  waUrl?: string;
}

interface Props {
  auctionId: string;
  auctionTitle: string;
  invites: Invite[];
  onClose: () => void;
}

export const InvitesModal: React.FC<Props> = ({ auctionId, auctionTitle, invites, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    alert('Magic Link copied to clipboard!');
  };

  const currentInvites = invites.filter((i) => i.auction_id === auctionId);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">🔑 Magic Access Links</h2>
            <p className="text-[11px] text-slate-500 font-mono">{auctionId} • {auctionTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-bold p-1 text-base rounded-md hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-2.5">
          {currentInvites.length === 0 ? (
            <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-lg">
              No vendor invites registered for this auction event yet.
            </div>
          ) : (
            currentInvites.map((inv, idx) => (
              <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <strong className="text-slate-800">{inv.company_name || 'Invited Supplier'}</strong>
                  <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded uppercase">
                    {inv.role}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inv.accessUrl}
                    className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1 text-[11px] font-mono text-slate-600 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(inv.accessUrl)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-3 py-1 rounded text-[11px]"
                  >
                    Copy
                  </button>
                  {inv.waUrl && (
                    <a
                      href={inv.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded text-[11px]"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

