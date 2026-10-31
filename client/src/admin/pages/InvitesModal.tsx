import React, { useEffect, useState, useMemo } from 'react';
import { SearchBar } from '../../components/SearchBar';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => {
      setCopiedUrl((cur) => (cur === url ? null : cur));
    }, 2000);
  };

  const currentInvites = useMemo(() => {
    return invites.filter((i) => i.auction_id === auctionId);
  }, [invites, auctionId]);

  const filteredInvites = useMemo(() => {
    if (!searchQuery.trim()) return currentInvites;
    const q = searchQuery.toLowerCase().trim();
    return currentInvites.filter((inv) => {
      return (
        (inv.company_name && inv.company_name.toLowerCase().includes(q)) ||
        (inv.role && inv.role.toLowerCase().includes(q)) ||
        (inv.phone && inv.phone.includes(q)) ||
        (inv.accessUrl && inv.accessUrl.toLowerCase().includes(q))
      );
    });
  }, [currentInvites, searchQuery]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <span>🔑</span> Magic Access Links
            </h2>
            <p className="text-[11px] text-slate-500 font-mono">
              {auctionId} • {auctionTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-bold p-1 text-base rounded-md hover:bg-slate-100 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Search Bar & Stats */}
        <div className="flex items-center justify-between gap-3">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search link by company, role (vendor/observer)..."
            className="flex-1"
          />
          <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 whitespace-nowrap">
            {filteredInvites.length} of {currentInvites.length}
          </span>
        </div>

        {/* Invites Cards List */}
        <div className="max-h-80 overflow-y-auto space-y-2.5 pr-0.5">
          {currentInvites.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No vendor invites registered for this auction event yet.
            </div>
          ) : filteredInvites.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              No access links match "<strong>{searchQuery}</strong>"
            </div>
          ) : (
            filteredInvites.map((inv, idx) => {
              const isCopied = copiedUrl === inv.accessUrl;
              return (
                <div key={idx} className="p-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl space-y-2 transition-colors">
                  <div className="flex items-center justify-between">
                    <strong className="text-slate-800 font-bold text-xs">{inv.company_name || 'Invited Supplier'}</strong>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono uppercase ${
                        inv.role === 'customer_observer'
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {inv.role}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inv.accessUrl}
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-slate-600 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(inv.accessUrl)}
                      className={`font-bold px-3 py-1.5 rounded-lg text-[11px] transition-colors whitespace-nowrap cursor-pointer shadow-2xs ${
                        isCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                      }`}
                    >
                      {isCopied ? '✓ Copied' : 'Copy'}
                    </button>
                    {inv.waUrl && (
                      <a
                        href={inv.waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] whitespace-nowrap shadow-2xs btn-white"
                        style={{ color: '#ffffff' }}
                      >
                        <span className="btn-white" style={{ color: '#ffffff' }}>WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
