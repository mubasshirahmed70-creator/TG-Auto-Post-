import React, { useState } from 'react';
import type { UserbotStatus } from '../types.ts';
import { withBase } from '../basePath.ts';

interface UserbotLoginCardProps {
  userbotStatus: UserbotStatus;
  authToken: string;
  onRefreshState: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
  onOpenSetup?: () => void;
  onUnauthorized?: () => void;
}

export const UserbotLoginCard: React.FC<UserbotLoginCardProps> = ({
  userbotStatus,
  authToken,
  onRefreshState,
  onNotify,
  onOpenSetup,
  onUnauthorized,
}) => {
  const [phoneNumber, setPhoneNumber] = useState(userbotStatus.pendingPhone ?? '+880');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncingDialogs, setSyncingDialogs] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const authHeaders = (json = true): Record<string, string> => ({
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  });

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      const res = await fetch(withBase('/api/userbot/send-code'), {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ phoneNumber }),
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      const data = (await res.json()) as { error?: string; isCodeViaApp?: boolean };
      if (!res.ok) {
        setLocalError(data.error ?? 'কোড পাঠানো যায়নি');
        return;
      }
      await onRefreshState();
      onNotify(
        'success',
        data.isCodeViaApp
          ? 'আপনার টেলিগ্রাম অ্যাপে ভেরিফিকেশন কোড পাঠানো হয়েছে'
          : 'আপনার নম্বরে OTP কোড পাঠানো হয়েছে'
      );
    } catch {
      setLocalError('সার্ভারের সাথে সংযোগ করতে সমস্যা হয়েছে');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      const res = await fetch(withBase('/api/userbot/verify-code'), {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ code: otpCode }),
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      const data = (await res.json()) as {
        step?: string;
        syncedGroups?: number;
        error?: string;
      };
      if (!res.ok) {
        setLocalError(data.error ?? 'কোড যাচাই করা যায়নি');
        return;
      }
      setOtpCode('');
      await onRefreshState();
      if (data.step === 'password_required') {
        onNotify('info', 'আপনার অ্যাকাউন্টে ২-স্টেপ পাসওয়ার্ড চালু আছে — পাসওয়ার্ড দিন');
      } else {
        onNotify(
          'success',
          `অ্যাকাউন্ট লগইন সফল! ${data.syncedGroups ?? 0}টি জয়েন করা গ্রুপ পাওয়া গেছে`
        );
      }
    } catch {
      setLocalError('কোড যাচাই করতে সমস্যা হয়েছে');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      const res = await fetch(withBase('/api/userbot/verify-password'), {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      const data = (await res.json()) as { syncedGroups?: number; error?: string };
      if (!res.ok) {
        setLocalError(data.error ?? 'পাসওয়ার্ড ভুল হয়েছে');
        return;
      }
      setPassword('');
      await onRefreshState();
      onNotify(
        'success',
        `লগইন সফল! ${data.syncedGroups ?? 0}টি জয়েন করা গ্রুপ লোড হয়েছে`
      );
    } catch {
      setLocalError('পাসওয়ার্ড যাচাই করতে সমস্যা হয়েছে');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncDialogs = async () => {
    setSyncingDialogs(true);
    try {
      const res = await fetch(withBase('/api/userbot/sync-dialogs'), {
        method: 'POST',
        headers: authHeaders(false),
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      const data = (await res.json()) as { syncedCount?: number; error?: string };
      if (!res.ok) {
        onNotify('error', data.error ?? 'গ্রুপ লোড করা যায়নি');
        return;
      }
      await onRefreshState();
      onNotify('success', `আপনার অ্যাকাউন্টের ${data.syncedCount ?? 0}টি গ্রুপ সিঙ্ক হয়েছে`);
    } catch {
      onNotify('error', 'গ্রুপ সিঙ্ক করতে সমস্যা হয়েছে');
    } finally {
      setSyncingDialogs(false);
    }
  };

  const handleLogout = async () => {
    setSubmitting(true);
    setLocalError(null);
    try {
      const res = await fetch(withBase('/api/userbot/logout'), {
        method: 'POST',
        headers: authHeaders(false),
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      await onRefreshState();
      onNotify('info', 'টেলিগ্রাম অ্যাকাউন্ট লগআউট করা হয়েছে');
    } catch {
      onNotify('error', 'লগআউট করতে সমস্যা হয়েছে');
    } finally {
      setSubmitting(false);
    }
  };

  if (userbotStatus.connected && userbotStatus.user) {
    const fullName = [userbotStatus.user.firstName, userbotStatus.user.lastName]
      .filter(Boolean)
      .join(' ');
    return (
      <div className="ui-card">
        <div className="ui-card-body flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className="ui-stat-ico"
              style={
                {
                  '--accent': '#059669',
                  '--accent-soft': '#ecfdf5',
                  '--accent-border': '#a7f3d0',
                } as React.CSSProperties
              }
            >
              <i className="ri-checkbox-circle-fill" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[13.5px] font-extrabold text-[#0f172a]">{fullName}</h3>
                <span className="ui-badge ui-badge-ok">কানেক্টেড</span>
                {userbotStatus.user.username && (
                  <span className="text-[11.5px] text-[#475569] ui-mono">
                    @{userbotStatus.user.username}
                  </span>
                )}
                {userbotStatus.user.phone && (
                  <span className="text-[11px] text-[#94a3b8] ui-mono">
                    · +{userbotStatus.user.phone}
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-[#475569] mt-1">
                পার্সোনাল অ্যাকাউন্ট কানেক্টেড — যেসব বাই-সেল গ্রুপে আপনি মেম্বার আছেন, বট অ্যাড ছাড়াই সেগুলোতে অটো-পোস্ট হবে।
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleSyncDialogs()}
              disabled={syncingDialogs}
              className="ui-btn ui-btn-primary"
            >
              <i className={`ri-refresh-line ${syncingDialogs ? 'animate-spin' : ''}`} />
              {syncingDialogs ? 'গ্রুপ আনা হচ্ছে...' : 'জয়েন করা সব গ্রুপ আনুন'}
            </button>

            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={submitting}
              className="ui-btn ui-btn-danger"
            >
              <i className="ri-logout-box-r-line" />
              লগআউট
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stepIndex =
    userbotStatus.authStep === 'idle' ? 1 : userbotStatus.authStep === 'code_sent' ? 2 : 3;

  return (
    <div className="ui-card">
      <div className="ui-card-head">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="ui-drawer-ico"
            style={
              {
                '--accent': '#0d9488',
                '--accent-soft': '#f0fdfa',
                '--accent-border': '#99f6e4',
              } as React.CSSProperties
            }
          >
            <i className="ri-telegram-fill" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate">টেলিগ্রাম অ্যাকাউন্ট কানেক্ট করুন</h3>
            <p className="text-[11px] text-[#475569] font-medium truncate">
              ফোন নম্বর ও OTP দিয়ে লগইন করলে আপনার জয়েন করা সব বাই-সেল গ্রুপ চলে আসবে
            </p>
          </div>
        </div>
        <span className={`ui-badge ${userbotStatus.apiConfigured ? 'ui-badge-ok' : 'ui-badge-info'}`}>
          <i className={userbotStatus.apiConfigured ? 'ri-shield-check-fill' : 'ri-phone-fill'} />
          {userbotStatus.apiConfigured ? 'প্রস্তুত' : 'ফোন + OTP'}
        </span>
      </div>

      <div className="ui-card-body space-y-3">
        {/* Step Progress Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`ui-badge ${stepIndex === 1 ? 'ui-badge-info' : 'ui-badge-ok'}`}>
            <i className={stepIndex > 1 ? 'ri-checkbox-circle-fill' : 'ri-phone-fill'} />
            ১. ফোন নম্বর
          </span>
          <i className="ri-arrow-right-s-line text-xs text-[#94a3b8]" />
          <span
            className={`ui-badge ${
              stepIndex === 2
                ? 'ui-badge-info'
                : stepIndex > 2
                ? 'ui-badge-ok'
                : 'ui-badge-neutral'
            }`}
          >
            <i className={stepIndex > 2 ? 'ri-checkbox-circle-fill' : 'ri-message-2-fill'} />
            ২. OTP কোড
          </span>
          <i className="ri-arrow-right-s-line text-xs text-[#94a3b8]" />
          <span className={`ui-badge ${stepIndex === 3 ? 'ui-badge-info' : 'ui-badge-neutral'}`}>
            <i className="ri-shield-keyhole-fill" />
            ৩. পাসওয়ার্ড / সম্পন্ন
          </span>
        </div>

        {(localError || userbotStatus.lastError) && (
          <div className="p-2.5 rounded-[9px] bg-[#fff1f2] border border-[#fecdd3] text-[11.5px] font-semibold text-[#e11d48] flex items-center gap-2">
            <i className="ri-error-warning-fill text-sm shrink-0" />
            <span>{localError ?? userbotStatus.lastError}</span>
          </div>
        )}

        {userbotStatus.authStep === 'idle' && (
          <form
            onSubmit={handleSendCode}
            className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5"
          >
            <div className="ui-field flex-1 max-w-sm mb-0">
              <label htmlFor="tg-phone">টেলিগ্রাম ফোন নম্বর (কান্ট্রি কোডসহ)</label>
              <div className="relative">
                <i className="ri-phone-line text-sm text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="tg-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+8801712345678"
                  className="ui-mono"
                  style={{ paddingLeft: '30px' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="ui-btn ui-btn-primary py-2 px-4"
            >
              <i className="ri-send-plane-2-line" />
              {submitting ? 'কোড পাঠানো হচ্ছে...' : 'OTP কোড পাঠান'}
            </button>
          </form>
        )}

        {userbotStatus.authStep === 'code_sent' && (
          <form
            onSubmit={handleVerifyCode}
            className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5"
          >
            <div className="ui-field flex-1 max-w-sm mb-0">
              <label htmlFor="tg-otp">
                টেলিগ্রাম অ্যাপ বা SMS OTP কোড ({userbotStatus.pendingPhone})
              </label>
              <div className="relative">
                <i className="ri-key-2-line text-sm text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="tg-otp"
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="12345"
                  className="ui-mono"
                  style={{ paddingLeft: '30px' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="ui-btn ui-btn-primary py-2 px-4"
            >
              <i className="ri-check-double-line" />
              {submitting ? 'যাচাই হচ্ছে...' : 'যাচাই ও লগইন করুন'}
            </button>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="ui-btn ui-btn-outline py-2"
            >
              নম্বর বদলান
            </button>
          </form>
        )}

        {userbotStatus.authStep === 'password_required' && (
          <form
            onSubmit={handleVerifyPassword}
            className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5"
          >
            <div className="ui-field flex-1 max-w-sm mb-0">
              <label htmlFor="tg-2fa">টেলিগ্রাম ২-স্টেপ ভেরিফিকেশন পাসওয়ার্ড</label>
              <div className="relative">
                <i className="ri-shield-keyhole-line text-sm text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="tg-2fa"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="আপনার 2FA পাসওয়ার্ড লিখুন"
                  style={{ paddingLeft: '30px' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="ui-btn ui-btn-primary py-2 px-4"
            >
              <i className="ri-lock-unlock-line" />
              {submitting ? 'লগইন হচ্ছে...' : 'পাসওয়ার্ড সাবমিট করুন'}
            </button>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="ui-btn ui-btn-outline py-2"
            >
              বাতিল
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
