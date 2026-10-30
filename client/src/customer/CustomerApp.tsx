import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { CustomerDashboard } from './pages/CustomerDashboard';
import { NotificationBell } from '../components/NotificationBell';
import { Organization } from '../types/procurement';

const CustomerLayout: React.FC = () => {
  const [org, setOrg] = useState<Organization | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/customer/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d?.organization) setOrg(d.organization);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/customer/logout', { method: 'POST' });
    } catch (_) {}
    window.location.href = '/customer/login';
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      {/* TOP ENTERPRISE BANNER */}
      <header className="bg-[#1e2238] border-b border-slate-800 text-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/customer/dashboard" className="flex items-center gap-2">
              <span className="bg-blue-600 text-white font-black text-xs px-2.5 py-1 rounded tracking-wider">NTA</span>
              <div>
                <span className="text-sm font-bold text-white tracking-tight block">NexTrade Auctions</span>
                <span className="text-[10px] text-slate-400 block -mt-1 font-mono">Corporate Buyer Command Center</span>
              </div>
            </Link>
            {org && (
              <div className="hidden md:flex items-center gap-1.5 pl-4 border-l border-slate-700 text-xs text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-semibold">{org.name}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <NotificationBell realm="customer" onNavigate={(url) => navigate(url)} />
            <a
              href="/customer/request-tender"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <span>➕</span> New Tender Intake
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-red-200 border border-slate-700 font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* MAIN BODY */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        <Routes>
          <Route path="/customer/dashboard" element={<CustomerDashboard />} />
          <Route path="/customer/*" element={<Navigate to="/customer/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export const CustomerApp: React.FC = () => {
  return (
    <BrowserRouter>
      <CustomerLayout />
    </BrowserRouter>
  );
};
