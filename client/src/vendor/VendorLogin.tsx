import React, { useState } from 'react';

export const VendorLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !pin.trim()) {
      setError('Please enter both your registered supplier email and PIN/Password.');
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch('/api/vendor/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), pin: pin.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to authenticate supplier.');
      }

      // Successful login -> Redirect to Supplier Hub
      window.location.href = data.redirect || '/vendor/dashboard';
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0c0e1a] via-[#121526] to-[#1a1d36] text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded-full text-blue-400 text-xs font-mono">
            <span>🏭</span>
            <span>NEXTRADE SUPPLIER NETWORK</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Supplier Procurement Hub</h1>
          <p className="text-xs text-slate-400">
            Sign in with your verified company credentials to access active e-auctions, submit bids, and download outcome certificates.
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-[#171a2b] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                Registered Supplier Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="supplier@yourcompany.com"
                required
                className="w-full bg-[#0d1021] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Permanent PIN / Access Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {showPin ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter 6-digit PIN or password"
                required
                className="w-full bg-[#0d1021] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-blue-500 font-mono transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin text-sm">🔄</span>
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>🔐</span>
                  <span>Access Supplier Hub</span>
                </>
              )}
            </button>
          </form>

          {/* Enterprise Onboarding Help */}
          <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1 text-center">
            <p>
              First time participating? Open the <strong className="text-blue-400 font-semibold">onboarding or PIN setup link</strong> sent to your corporate email.
            </p>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center text-xs text-slate-500">
          Corporate Buyer or Admin?{' '}
          <a href="/customer/login" className="text-slate-400 hover:text-white underline">
            Customer Portal
          </a>{' '}
          •{' '}
          <a href="/admin/login" className="text-slate-400 hover:text-white underline">
            Admin Desk
          </a>
        </div>
      </div>
    </div>
  );
};

