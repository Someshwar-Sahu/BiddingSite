import React from 'react';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* TOP INSTITUTIONAL BAR */}
      <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 text-white font-black text-sm tracking-wider shadow-lg shadow-blue-600/30">
              NTA
            </div>
            <div>
              <span className="text-base font-black tracking-tight text-white block">NexTrade Auctions</span>
              <span className="text-[10px] text-blue-400 font-mono tracking-wider block -mt-0.5">
                INSTITUTIONAL REVERSE E-PROCUREMENT
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-2 sm:gap-3 text-xs font-semibold">
            <a
              href="/customer/login"
              className="text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Corporate Buyer
            </a>
            <a
              href="/vendor/login"
              className="text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Supplier Hub
            </a>
            <a
              href="/admin/login"
              className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg font-bold shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5"
            >
              <span>⚙️</span> Operations Desk
            </a>
          </nav>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28 border-b border-slate-800">
        {/* Ambient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/15 blur-[120px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Column: Mission & Value Proposition */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/70 border border-blue-800/60 text-blue-300 text-xs font-bold tracking-wide">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Reverse E-Auction Platform &middot; Decremental Bidding Engine
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight sm:leading-none">
                Transforming Enterprise <br />
                <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">
                  Reverse Procurement
                </span>
              </h1>

              <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto lg:mx-0">
                NexTrade Auctions is an enterprise reverse auction infrastructure connecting Fortune 500 corporate buyers 
                with pre-vetted suppliers for transparent, decremental, and audit-compliant contract awards.
              </p>

              {/* KPI Quick Badges */}
              <div className="grid grid-cols-3 gap-3 pt-2 max-w-lg mx-auto lg:mx-0">
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl text-center">
                  <span className="text-lg sm:text-2xl font-black text-white font-mono block">100%</span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Tax Verified KYC</span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl text-center">
                  <span className="text-lg sm:text-2xl font-black text-emerald-400 font-mono block">&lt; 100ms</span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Real-Time Tick</span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl text-center">
                  <span className="text-lg sm:text-2xl font-black text-blue-400 font-mono block">Auto PDF</span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Settlement Audit</span>
                </div>
              </div>
            </div>

            {/* Right Column: Hero Graphic / Live Auction Screen Simulation */}
            <div className="lg:col-span-5 relative">
              <div className="relative rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl shadow-blue-900/20 bg-slate-900 group">
                <img
                  src="https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=1000&q=80"
                  alt="NexTrade Trading Floor & Live Decremental Bidding"
                  className="w-full h-80 sm:h-96 object-cover object-center opacity-85 group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                
                {/* Floating Glass Pill */}
                <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-blue-400">NTA-EPACKPetro-07</span>
                    <span className="bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-500/30">
                      LIVE DECREMENTAL BIDDING
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Industrial HDPE Drums (200L)</span>
                    <strong className="text-emerald-400 font-mono font-bold">₹1,180 / Unit (L1)</strong>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 3-DOOR WORKSPACE GATEWAY */}
      <section className="py-16 sm:py-24 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-3 mb-14">
            <span className="text-blue-400 font-mono text-xs font-bold uppercase tracking-widest">
              Access Gateways
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Select Your Procurement Realm
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm max-w-xl mx-auto">
              Choose your authorized gateway to access corporate workspaces, live supplier rooms, or compliance desk controls.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* GATEWAY 1: Corporate Buyer */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-900/10 transition-all group">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/30 text-blue-400 flex items-center justify-center text-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  🏢
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                    Corporate Buyer Workspace
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">Enterprise Tenant Isolation</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Configure procurement tenders, set reserve ceilings, manage regional delivery plants, and observe real-time decremental pricing.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                  <li className="flex items-center gap-2">
                    <span className="text-blue-400">✓</span> Multi-lot specification wizard
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-blue-400">✓</span> Private vetted supplier allocation
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-blue-400">✓</span> Executive live observer room
                  </li>
                </ul>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-800">
                <a
                  href="/customer/login"
                  className="w-full bg-slate-800 hover:bg-blue-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <span>Sign In as Corporate Buyer</span>
                  <span>&rarr;</span>
                </a>
              </div>
            </div>

            {/* GATEWAY 2: Supplier / Bidder */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-900/10 transition-all group">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-600/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-2xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  🤝
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                    Supplier Procurement Hub
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">Vetted Bidding Portal</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Complete legal KYC onboarding, set your confidential 6-digit access PIN, participate in decremental e-auctions, and download win certificates.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> GSTIN & PAN tax compliance
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Sub-second live bidding rooms
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Multi-employee team access
                  </li>
                </ul>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-800">
                <a
                  href="/vendor/login"
                  className="w-full bg-slate-800 hover:bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <span>Enter Supplier Hub</span>
                  <span>&rarr;</span>
                </a>
              </div>
            </div>

            {/* GATEWAY 3: Operations & Compliance Desk */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between hover:border-sky-500/50 hover:shadow-xl hover:shadow-sky-900/10 transition-all group">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-sky-600/10 border border-sky-500/30 text-sky-400 flex items-center justify-center text-2xl group-hover:bg-sky-600 group-hover:text-white transition-colors">
                  ⚙️
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-sky-400 transition-colors">
                    Operations & Compliance Desk
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">Administrative Governance</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Review incoming vendor KYC applications, govern schedule amendments, manage enterprise buyer pools, and download chartered audit PDFs.
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
                  <li className="flex items-center gap-2">
                    <span className="text-sky-400">✓</span> 1-Click KYC approval & revocation
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-sky-400">✓</span> Audit-safe deletion & compliance checks
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-sky-400">✓</span> Transactional email & magic links
                  </li>
                </ul>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-800">
                <a
                  href="/admin/login"
                  className="w-full bg-slate-800 hover:bg-sky-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <span>Access Operations Desk</span>
                  <span>&rarr;</span>
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ENTERPRISE TRUST & COMPLIANCE FEATURES */}
      <section className="py-16 border-t border-slate-800 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center sm:text-left">
            <div className="space-y-2">
              <span className="text-2xl">🛡️</span>
              <h4 className="font-bold text-white text-sm">Strict Dual-Track KYC</h4>
              <p className="text-xs text-slate-400">
                Suppliers cannot participate in live auctions without verified GSTIN, PAN, and Admin approval.
              </p>
            </div>
            <div className="space-y-2">
              <span className="text-2xl">⚡</span>
              <h4 className="font-bold text-white text-sm">Anti-Sniping Engine</h4>
              <p className="text-xs text-slate-400">
                Auctions automatically extend by buffer increments if bids arrive in the final minutes.
              </p>
            </div>
            <div className="space-y-2">
              <span className="text-2xl">🔒</span>
              <h4 className="font-bold text-white text-sm">Tenant Isolation</h4>
              <p className="text-xs text-slate-400">
                Corporate plant directories and private supplier rosters remain completely segregated.
              </p>
            </div>
            <div className="space-y-2">
              <span className="text-2xl">📄</span>
              <h4 className="font-bold text-white text-sm">Audit-Certified PDFs</h4>
              <p className="text-xs text-slate-400">
                Permanent cryptographic settlement certificates auto-generated upon tender completion.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-8 text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="bg-blue-600 text-white font-black text-[10px] px-2 py-0.5 rounded">NTA</span>
            <span>&copy; {new Date().getFullYear()} NexTrade Auctions &middot; Digital Reverse E-Procurement Engine</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>100% Tax Compliant</span>
            <span>&middot;</span>
            <span>Socket.IO Real-Time Core</span>
            <span>&middot;</span>
            <span>End-to-End Audit Logs</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

