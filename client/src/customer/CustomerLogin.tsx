import React, { useState } from 'react';

export const CustomerLogin: React.FC = () => {
  const [email, setEmail] = useState('procurement@epack.in');
  const [password, setPassword] = useState('Epack_Buyer_2026!');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid credentials');

      window.location.href = data.redirect || '/customer/dashboard';
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-100 min-h-screen text-slate-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 space-y-6">
        {/* BRAND LOGO & TITLE */}
        <div className="text-center space-y-2">
          <a href="/" className="inline-flex items-center gap-2 bg-[#1e2238] text-white font-black px-3.5 py-1.5 rounded-lg text-sm tracking-wider shadow">
            <span className="text-blue-400">NTA</span>
          </a>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Corporate Buyer Workspace</h1>
          <p className="text-xs text-slate-500">
            Sign in to your enterprise procurement account to configure tenders, manage delivery plants, and review live outcomes.
          </p>
        </div>

        {/* ERROR ALERT */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* LOGIN FORM */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Official Corporate Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="procurement@yourcompany.com"
              className="w-full border border-slate-300 p-3 rounded-lg text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50 focus:bg-white"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Enterprise Password / Access Key</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full border border-slate-300 p-3 rounded-lg text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50 focus:bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#1e2238] hover:bg-slate-800 text-white font-bold py-3 rounded-lg text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>🏢</span> {isLoading ? 'Authenticating...' : 'Sign In to Corporate Procurement Desk'}
          </button>
        </form>

        {/* DEMO QUICK ACCESS */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Demo Organization:</span>
            <strong className="text-slate-700 font-semibold">Epack Petrochem Solutions</strong>
          </div>

          <button
            type="button"
            onClick={() => {
              setEmail('procurement@epack.in');
              setPassword('Epack_Buyer_2026!');
            }}
            className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-2.5 rounded-lg text-xs border border-blue-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>⚡</span> 1-Click Demo Corporate Buyer Sign In
          </button>
        </div>

        {/* TENANT ISOLATION GUARANTEE */}
        <div className="text-center text-[11px] text-slate-400 bg-slate-50 p-3 rounded-lg border border-slate-100">
          🔒 <strong>Enterprise Multi-Tenant Security:</strong> All plant facilities, specifications, and vendor allocations remain strictly confidential to your corporate organization.
        </div>

        {/* RETURN TO PORTAL */}
        <div className="text-center pt-1">
          <a href="/" className="text-xs text-slate-500 hover:text-slate-800 underline">
            &larr; Return to NexTrade Home Gateway
          </a>
        </div>
      </div>
    </div>
  );
};

