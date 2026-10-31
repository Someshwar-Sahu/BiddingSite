import React from 'react';
import ReactDOM from 'react-dom/client';
import { VendorBiddingApp } from './VendorBiddingApp';
import { VendorDashboardApp } from './VendorDashboardApp';
import { VendorLogin } from './VendorLogin';
import { VendorOnboarding } from './VendorOnboarding';

const RootApp: React.FC = () => {
  const path = window.location.pathname;

  if (path === '/vendor/login') {
    return <VendorLogin />;
  }

  if (path === '/vendor/onboard' || path === '/vendor/register' || path === '/vendor/setup-pin') {
    return <VendorOnboarding />;
  }

  if (path === '/vendor' || path.startsWith('/vendor/')) {
    return <VendorDashboardApp />;
  }

  return <VendorBiddingApp />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
