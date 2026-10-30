import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { AuctionsManager } from './pages/AuctionsManager';
import { NotificationBell } from '../components/NotificationBell';

const AdminLayout: React.FC = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch (_) {}
    window.location.href = '/admin/login';
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      {/* TOP ENTERPRISE DESK NAV */}
      <header className="bg-[#1e2238] border-b border-slate-800 text-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin/auctions" className="flex items-center gap-2 hover:opacity-90">
              <span className="bg-blue-600 text-white font-black text-xs px-2.5 py-1 rounded tracking-wider">NTA</span>
              <span className="text-sm font-bold text-white tracking-tight">
                NexTrade <span className="text-blue-400 font-normal">Auctions Desk</span>
              </span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg text-xs font-semibold">
            <Link to="/admin/auctions" className="px-3.5 py-1.5 rounded-md bg-blue-600 text-white shadow-xs">
              📋 Auctions Desk
            </Link>
            <a href="/admin/auction-editor" className="px-3.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-700/50">
              ➕ Builder
            </a>
            <a href="/admin/clients" className="px-3.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-700/50">
              🏢 Clients
            </a>
            <a href="/admin/vendors" className="px-3.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-700/50">
              👥 Vendor KYC
            </a>
          </nav>

          <div className="flex items-center gap-3 text-xs">
            <NotificationBell realm="admin" onNavigate={(url) => navigate(url)} />
            <button
              type="button"
              onClick={handleLogout}
              className="bg-slate-700/80 hover:bg-red-600/80 text-white font-bold px-3 py-1.5 rounded-md transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* MAIN BODY */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        <Routes>
          <Route path="/admin/auctions" element={<AuctionsManager />} />
          <Route path="/admin/*" element={<Navigate to="/admin/auctions" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export const AdminApp: React.FC = () => {
  return (
    <BrowserRouter>
      <AdminLayout />
    </BrowserRouter>
  );
};
