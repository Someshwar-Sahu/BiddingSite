import React, { useState } from 'react';

export const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('admin@nextradeauctions.com');
  const [password, setPassword] = useState('NTA_Admin_2026!');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid credentials');

      window.location.href = data.redirect || '/admin/auctions';
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 min-h-screen text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800/90 rounded-2xl border border-slate-700 shadow-2xl p-8 space-y-6 backdrop-blur-md">
        {/* BRAND LOGO & TITLE */}
        <div className="text-center space-y-2">
          <a href="/" className="inline-flex items-center gap-2 bg-blue-600 text-white font-black px-3.5 py-1.5 rounded-lg text-sm tracking-wider shadow">
            <span>NTA</span>
          </a>
          <h1 className="text-2xl font-black text-white tracking-tight">
            NexTrade <span className="text-blue-400 font-medium">Auctions</span>
          </h1>
          <p className="text-xs text-slate-400">Restricted Operations Desk & Superadmin Control Portal</p>
        </div>

        {/* ERROR ALERT */}
        {error && (
          <div className="p-3 rounded-lg bg-red-900/50 border border-red-700 text-xs text-red-200">
            ⚠️ {error}
          </div>
        )}

        {/* LOGIN FORM */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-300 block mb-1">Administrative Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@nextradeauctions.com"
              className="w-full bg-slate-900/80 border border-slate-700 p-3 rounded-lg text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="font-bold text-slate-300 block mb-1">Security Passkey / Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-slate-900/80 border border-slate-700 p-3 rounded-lg text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>🔒</span> {isLoading ? 'Authenticating...' : 'Authenticate & Enter Operations Desk'}
          </button>
        </form>

        {/* DEMO QUICK ACCESS */}
        <div className="pt-4 border-t border-slate-700/80 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Evaluation Passkey:</span>
            <code className="text-blue-300 bg-slate-900 px-2 py-0.5 rounded font-mono">NTA_Admin_2026!</code>
          </div>

          <button
            type="button"
            onClick={() => {
              setEmail('admin@nextradeauctions.com');
              setPassword('NTA_Admin_2026!');
            }}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>⚡</span> Reset Default Credentials
          </button>
        </div>

        {/* RETURN TO PORTAL */}
        <div className="text-center pt-2">
          <a href="/" className="text-xs text-slate-400 hover:text-white underline">
            &larr; Return to NexTrade Home Gateway
          </a>
        </div>
      </div>
    </div>
  );
};

