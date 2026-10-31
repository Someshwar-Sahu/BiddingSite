import React, { useEffect, useState } from 'react';

interface VendorData {
  id: string;
  companyName: string;
  email: string;
  contactPerson: string;
  phone: string;
  gstin: string;
  pan: string;
  address: string;
  status: string;
  hasPassword?: boolean;
}

export const VendorOnboarding: React.FC = () => {
  const [token, setToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState<boolean>(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState<boolean>(false);
  const [registeredStatus, setRegisteredStatus] = useState<string>('');

  const [onboardingType, setOnboardingType] = useState<'full' | 'pin_only'>('full');
  const [vendor, setVendor] = useState<VendorData | null>(null);

  // Form Fields
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = (params.get('token') || params.get('key') || '').trim();
    setToken(tokenParam);

    if (!tokenParam) {
      setLoadError('An onboarding token or invitation key is required in the link.');
      setIsLoading(false);
      return;
    }

    fetch(`/api/vendor/onboard-info?token=${encodeURIComponent(tokenParam)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to retrieve onboarding details.');
        return data;
      })
      .then((data) => {
        if (data.alreadyRegistered) {
          setAlreadyRegistered(true);
          setRegisteredStatus(data.status || 'pending_approval');
          setVendor(data.vendor);
          return;
        }
        setOnboardingType(data.onboardingType || 'full');
        setVendor(data.vendor);
        if (data.vendor) {
          setCompanyName(data.vendor.companyName || '');
          setContactPerson(data.vendor.contactPerson || '');
          setPhone(data.vendor.phone || '');
          setGstin(data.vendor.gstin || '');
          setPan(data.vendor.pan || '');
          setAddress(data.vendor.address || '');
        }
      })
      .catch((err: any) => {
        setLoadError(err.message || 'Unable to load invitation details.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!pin.trim()) {
      setFormError('Please enter a 6-digit access PIN or password.');
      return;
    }

    if (pin.trim().length < 6) {
      setFormError('Access PIN must be at least 6 characters or digits.');
      return;
    }

    if (pin.trim() !== confirmPin.trim()) {
      setFormError('Access PIN and confirmation do not match.');
      return;
    }

    if (onboardingType === 'full') {
      if (!companyName.trim()) {
        setFormError('Legal Company Name is required.');
        return;
      }
      if (!contactPerson.trim()) {
        setFormError('Authorized Contact Person Name is required.');
        return;
      }
      if (!phone.trim()) {
        setFormError('Official Mobile / Contact Phone is required.');
        return;
      }
      const cleanGstin = gstin.trim().toUpperCase();
      if (!cleanGstin || cleanGstin.length !== 15) {
        setFormError('Please enter a valid 15-character GSTIN (e.g. 27AAPFU0939F1ZV).');
        return;
      }
      const cleanPan = pan.trim().toUpperCase();
      if (!cleanPan || cleanPan.length !== 10) {
        setFormError('Please enter a valid 10-character PAN (e.g. AAPFU0939F).');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/vendor/complete-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          company_name: companyName.trim(),
          contact_person: contactPerson.trim(),
          phone: phone.trim(),
          gstin: gstin.trim().toUpperCase(),
          pan: pan.trim().toUpperCase(),
          address: address.trim(),
          pin: pin.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit onboarding details.');
      }

      if (data.redirect) {
        window.location.href = data.redirect;
        return;
      }

      // Track A (Full KYC) success screen
      setSubmittedSuccess(true);
    } catch (err: any) {
      setFormError(err.message || 'Error completing registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0c0e1a] via-[#121526] to-[#1a1d36] text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="max-w-xl w-full space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded-full text-blue-400 text-xs font-mono">
            <span>🏭</span>
            <span>NEXTRADE ONBOARDING PORTAL</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {onboardingType === 'pin_only' ? 'Activate Supplier Account' : 'Supplier KYC & Registration'}
          </h1>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {onboardingType === 'pin_only'
              ? 'Your company details have been pre-verified by the procurement team. Set your permanent access PIN to enter the live reverse bidding room.'
              : 'Complete your legal business profile and tax credentials to qualify for corporate reverse auctions.'}
          </p>
        </div>

        {/* Card Body */}
        <div className="bg-[#171a2b] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          {isLoading ? (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <span className="inline-block animate-spin text-3xl">🔄</span>
              <p className="text-xs">Verifying invitation credentials...</p>
            </div>
          ) : alreadyRegistered ? (
            <div className="text-center py-6 space-y-4">
              <div className="text-5xl">ℹ️</div>
              <h2 className="text-xl font-bold text-white">Account Already Registered</h2>
              <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                This supplier account (<strong className="text-white">{vendor?.companyName || vendor?.email}</strong>) has already completed registration and its status is <strong className="text-emerald-400 uppercase tracking-wide">{registeredStatus.replace('_', ' ')}</strong>.
              </p>
              <div className="pt-3">
                <a
                  href="/vendor/login"
                  className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-lg shadow-blue-600/30 transition-all"
                >
                  Go to Supplier Portal Login →
                </a>
              </div>
            </div>
          ) : loadError ? (
            <div className="text-center py-8 space-y-4">
              <div className="text-4xl">⚠️</div>
              <h2 className="text-lg font-bold text-red-400">Invalid or Expired Invitation</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">{loadError}</p>
              <div className="pt-2">
                <a
                  href="/vendor/login"
                  className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2 rounded-xl text-xs"
                >
                  Go to Supplier Login
                </a>
              </div>
            </div>
          ) : submittedSuccess ? (
            <div className="text-center py-6 space-y-4">
              <div className="text-5xl">✅</div>
              <h2 className="text-xl font-bold text-white">KYC Profile Submitted for Verification</h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Thank you, <strong className="text-white">{companyName}</strong>. Your legal entity registration and tax compliance details (GSTIN & PAN) have been submitted to the <strong className="text-blue-400">NexTrade Operations Desk</strong>.
              </p>
              <div className="bg-[#0f1224] p-4 rounded-xl border border-slate-800 text-left text-xs space-y-2 text-slate-300">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">Compliance Status:</span>
                  <span className="font-bold text-amber-400 uppercase tracking-wider">⏳ Pending Review</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500">Registered Email:</span>
                  <span className="font-mono text-slate-200">{vendor?.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Next Action:</span>
                  <span className="text-slate-300">Operations Desk will verify and approve your account shortly.</span>
                </div>
              </div>
              <div className="pt-2">
                <a
                  href="/vendor/login"
                  className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-lg shadow-blue-600/30"
                >
                  Return to Supplier Portal Login
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{formError}</span>
                </div>
              )}

              {/* TRACK B: PIN SETUP ONLY READ-ONLY CARD */}
              {onboardingType === 'pin_only' && (
                <div className="bg-[#0f1224] border border-blue-500/20 rounded-xl p-4 text-xs space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-blue-400 uppercase text-[10px] tracking-wider">
                      Verified Organization Profile
                    </span>
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      ✓ Pre-Verified
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Company:</span>
                      <strong className="text-white block">{companyName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Email:</span>
                      <span className="text-slate-300 font-mono block">{vendor?.email}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Officer:</span>
                      <span className="text-slate-300 block">{contactPerson || 'Authorized Representative'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">GSTIN / PAN:</span>
                      <span className="text-slate-300 font-mono block">
                        {gstin || 'Verified'} • {pan || 'Verified'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TRACK A: FULL KYC FIELDS */}
              {onboardingType === 'full' && (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                      Official Registered Email
                    </label>
                    <input
                      type="email"
                      value={vendor?.email || ''}
                      disabled
                      className="w-full bg-[#0a0c18] border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-400 font-mono cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                      Legal Business / Company Name *
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Apex Industrial Supplies Pvt Ltd"
                      required
                      className="w-full bg-[#0d1021] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                        Contact Person Name *
                      </label>
                      <input
                        type="text"
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        placeholder="e.g. Rajesh Kumar"
                        required
                        className="w-full bg-[#0d1021] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                        Official Mobile / Phone *
                      </label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. 9876543210"
                        required
                        className="w-full bg-[#0d1021] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                        GSTIN (15 Digits) *
                      </label>
                      <input
                        type="text"
                        value={gstin}
                        onChange={(e) => setGstin(e.target.value.toUpperCase())}
                        placeholder="27AAPFU0939F1ZV"
                        maxLength={15}
                        required
                        className="w-full bg-[#0d1021] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono uppercase placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                        PAN (10 Digits) *
                      </label>
                      <input
                        type="text"
                        value={pan}
                        onChange={(e) => setPan(e.target.value.toUpperCase())}
                        placeholder="AAPFU0939F"
                        maxLength={10}
                        required
                        className="w-full bg-[#0d1021] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono uppercase placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                      Registered Business Address
                    </label>
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Plot No, Industrial Area, City, State, PIN"
                      rows={2}
                      className="w-full bg-[#0d1021] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* SECURITY PIN SETUP (Common to both tracks) */}
              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    {onboardingType === 'pin_only' ? 'Set Permanent Access PIN' : 'Create 6-Digit Access PIN'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {showPin ? 'Hide PIN' : 'Show PIN'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Enter Security PIN (Min 6 characters) *
                    </label>
                    <input
                      type={showPin ? 'text' : 'password'}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="e.g. 654321"
                      required
                      className="w-full bg-[#0d1021] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Confirm Security PIN *</label>
                    <input
                      type={showPin ? 'text' : 'password'}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      placeholder="Re-enter PIN"
                      required
                      className="w-full bg-[#0d1021] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin text-sm">🔄</span>
                      <span>Processing...</span>
                    </>
                  ) : onboardingType === 'pin_only' ? (
                    <>
                      <span>🔐</span>
                      <span>Activate Account & Enter Supplier Hub</span>
                    </>
                  ) : (
                    <>
                      <span>📋</span>
                      <span>Submit KYC for Operations Review</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Back Link */}
        <div className="text-center text-xs text-slate-500">
          Already registered and approved?{' '}
          <a href="/vendor/login" className="text-blue-400 hover:underline">
            Sign in to Supplier Hub
          </a>
        </div>
      </div>
    </div>
  );
};

