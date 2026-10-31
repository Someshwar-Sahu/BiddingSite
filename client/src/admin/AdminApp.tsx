import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { AuctionsManager } from './pages/AuctionsManager';
import { ClientsManager } from './pages/ClientsManager';
import { VendorsManager } from './pages/VendorsManager';
import { AuctionBuilder } from './pages/AuctionBuilder';
import { NotificationBell } from '../components/NotificationBell';
import { AdminLogin } from './AdminLogin';

const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch (_) {}
    window.location.href = '/admin/login';
  };

  const isNavActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      {/* TOP ENTERPRISE DESK NAV */}
      <header className="bg-[#1e2238] border-b border-slate-800 text-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin/auctions" className="flex items-center gap-2.5 hover:opacity-90">
              <span className="bg-blue-600 text-white font-black text-xs px-2.5 py-1 rounded tracking-wider shadow-xs">NTA</span>
              <div>
                <span className="text-sm font-bold text-white tracking-tight block">NexTrade Auctions</span>
                <span className="text-[10px] text-blue-400 block -mt-0.5 font-mono font-medium">Enterprise Operations Desk</span>
              </div>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-xl text-xs font-semibold border border-slate-700/60">
            <Link
              to="/admin/auctions"
              className={`px-3.5 py-1.5 rounded-lg transition-all font-bold flex items-center gap-1.5 ${
                isNavActive('/admin/auctions')
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <span>📋</span> Auctions Desk
            </Link>
            <Link
              to="/admin/auction-editor"
              className={`px-3.5 py-1.5 rounded-lg transition-all font-bold flex items-center gap-1.5 ${
                isNavActive('/admin/auction-editor')
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <span>➕</span> Builder
            </Link>
            <Link
              to="/admin/clients"
              className={`px-3.5 py-1.5 rounded-lg transition-all font-bold flex items-center gap-1.5 ${
                isNavActive('/admin/clients')
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <span>🏢</span> Clients
            </Link>
            <Link
              to="/admin/vendors"
              className={`px-3.5 py-1.5 rounded-lg transition-all font-bold flex items-center gap-1.5 ${
                isNavActive('/admin/vendors')
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <span>👥</span> Vendor KYC
            </Link>
          </nav>

          <div className="flex items-center gap-3 text-xs">
            <NotificationBell realm="admin" onNavigate={(url) => navigate(url)} />
            <button
              type="button"
              onClick={handleLogout}
              className="bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white font-bold px-3 py-1.5 rounded-lg border border-slate-700 transition-colors cursor-pointer"
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
          <Route path="/admin/auction-editor" element={<AuctionBuilder />} />
          <Route path="/admin/clients" element={<ClientsManager />} />
          <Route path="/admin/vendors" element={<VendorsManager />} />
          <Route path="/admin/*" element={<Navigate to="/admin/auctions" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export const AdminApp: React.FC = () => {
  const isLoginPage = window.location.pathname === '/admin/login';
  if (isLoginPage) {
    return <AdminLogin />;
  }

  return (
    <BrowserRouter>
      <AdminLayout />
    </BrowserRouter>
  );
};
