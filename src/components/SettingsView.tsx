import React, { useState } from 'react';
import type {
  PostingMode,
  RotationMode,
  SchedulerConfig,
  UserbotStatus,
} from '../types.ts';
import { UserbotLoginCard } from './UserbotLoginCard.tsx';
import { CodeEditorPanel } from './CodeEditorPanel.tsx';
import { withBase } from '../basePath.ts';

const INTERVAL_PRESETS = [
  { label: '৪০ মিনিট', minutes: 40 },
  { label: 'দেড় ঘণ্টা', minutes: 90 },
  { label: '২ ঘণ্টা', minutes: 120 },
  { label: 'আড়াই ঘণ্টা', minutes: 150 },
];

interface SettingsViewProps {
  userbotStatus: UserbotStatus;
  authToken: string;
  currentConfig: SchedulerConfig;
  savedConfig: SchedulerConfig;
  activeMode: PostingMode;
  savingConfig: boolean;
  onDraftConfigChange: (next: SchedulerConfig) => void;
  onSaveConfig: (override?: Partial<SchedulerConfig>) => Promise<void>;
  onRefreshState: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
  onOpenSetup: () => void;
  onUnauthorized: () => void;
  onPasswordUpdated: (newToken: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  userbotStatus,
  authToken,
  currentConfig,
  savedConfig,
  activeMode,
  savingConfig,
  onDraftConfigChange,
  onSaveConfig,
  onRefreshState,
  onNotify,
  onOpenSetup,
  onUnauthorized,
  onPasswordUpdated,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [updatingPwd, setUpdatingPwd] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [resetScopeConfirm, setResetScopeConfirm] = useState<'posts' | 'groups' | 'all' | null>(null);
  const [resetting, setResetting] = useState(false);

  const hasUnsavedChanges =
    currentConfig.postingMode !== savedConfig.postingMode ||
    currentConfig.intervalMinutes !== savedConfig.intervalMinutes ||
    currentConfig.delayBetweenGroupsSec !== savedConfig.delayBetweenGroupsSec ||
    currentConfig.activeHoursEnabled !== savedConfig.activeHoursEnabled ||
    currentConfig.activeStartHour !== savedConfig.activeStartHour ||
    currentConfig.activeEndHour !== savedConfig.activeEndHour ||
    currentConfig.rotationMode !== savedConfig.rotationMode ||
    currentConfig.sellerContactUrl !== savedConfig.sellerContactUrl ||
    currentConfig.buttonText !== savedConfig.buttonText;

  const handleConfirmReset = async () => {
    if (!resetScopeConfirm) return;
    const scope = resetScopeConfirm;
    setResetting(true);
    try {
      const res = await fetch(withBase('/api/system/reset'), {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ scope }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        onNotify('error', data.error ?? 'ডাটা রিসেট করা যায়নি');
        return;
      }
      setResetScopeConfirm(null);
      await onRefreshState();
      onNotify('success', data.message ?? 'সফলভাবে রিসেট করা হয়েছে');
    } catch {
      onNotify('error', 'ডাটা রিসেট করতে নেটওয়ার্ক সমস্যা হয়েছে');
    } finally {
      setResetting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword.trim()) {
      onNotify('error', 'বর্তমান এবং নতুন পাসওয়ার্ড লিখুন');
      return;
    }
    setUpdatingPwd(true);
    try {
      const res = await fetch(withBase('/api/auth/change-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          currentPassword,
          newPassword: newPassword.trim(),
        }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        onNotify('error', data.error ?? 'পাসওয়ার্ড পরিবর্তন করা যায়নি');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      onPasswordUpdated(data.token);
      onNotify('success', 'ওয়েবসাইটের পাসওয়ার্ড পরিবর্তন করা হয়েছে');
    } catch {
      onNotify('error', 'পাসওয়ার্ড পরিবর্তনে সমস্যা হয়েছে');
    } finally {
      setUpdatingPwd(false);
    }
  };

  if (showCodeEditor) {
    return (
      <CodeEditorPanel
        authToken={authToken}
        onBack={() => setShowCodeEditor(false)}
        onNotify={onNotify}
        onUnauthorized={onUnauthorized}
      />
    );
  }

  return (
    <div className="space-y-3 max-w-4xl">
      {/* 1. Telegram Account / Number Connect System */}
      <UserbotLoginCard
        userbotStatus={userbotStatus}
        authToken={authToken}
        onRefreshState={onRefreshState}
        onNotify={onNotify}
        onOpenSetup={onOpenSetup}
        onUnauthorized={onUnauthorized}
      />

      {/* 2. Auto-Post Scheduler */}
      <div className="ui-card mb-0">
        <div className="ui-card-head">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="ui-drawer-ico"
              style={
                {
                  '--accent': '#2563eb',
                  '--accent-soft': '#eff6ff',
                  '--accent-border': '#bfdbfe',
                } as React.CSSProperties
              }
            >
              <i className="ri-calendar-schedule-fill" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate">অটো-পোস্ট শিডিউলার</h3>
              <p className="text-[10.5px] text-[#64748b] font-medium truncate">
                পোস্টের মাধ্যম, সময় ও নিয়ম সেট করে সেভ করুন
              </p>
            </div>
          </div>

          <span className="ui-badge ui-badge-info">কনফিগারেশন</span>
        </div>

        <div className="ui-card-body space-y-4">
          {/* Posting Mode Selector */}
          <div>
            <label className="block text-[10.5px] font-bold text-[#475569] uppercase tracking-wider mb-2">
              পোস্ট করার মাধ্যম (Posting Mode)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  onDraftConfigChange({ ...currentConfig, postingMode: 'userbot' })
                }
                className={`p-2.5 text-left rounded-[10px] border transition-all ${
                  activeMode === 'userbot'
                    ? 'bg-[#eff6ff] border-[#2563eb] text-[#1e293b]'
                    : 'bg-white border-[#e2e8f0] text-[#475569] hover:bg-[#f8fafc]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-extrabold text-[#0f172a] flex items-center gap-1.5">
                    <i className="ri-user-3-fill text-[#2563eb]" />
                    পার্সোনাল অ্যাকাউন্ট
                  </span>
                  {activeMode === 'userbot' && (
                    <span className="ui-badge ui-badge-info">নির্বাচিত</span>
                  )}
                </div>
                <p className="text-[11px] text-[#64748b] mt-1 leading-snug">
                  অ্যাডমিন না হলেও আপনার জয়েন করা যেকোনো বাই-সেল গ্রুপে পোস্ট হবে
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  onDraftConfigChange({ ...currentConfig, postingMode: 'bot' })
                }
                className={`p-2.5 text-left rounded-[10px] border transition-all ${
                  activeMode === 'bot'
                    ? 'bg-[#eff6ff] border-[#2563eb] text-[#1e293b]'
                    : 'bg-white border-[#e2e8f0] text-[#475569] hover:bg-[#f8fafc]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-extrabold text-[#0f172a] flex items-center gap-1.5">
                    <i className="ri-robot-2-fill text-[#4f46e5]" />
                    অফিশিয়াল বট
                  </span>
                  {activeMode === 'bot' && (
                    <span className="ui-badge ui-badge-info">নির্বাচিত</span>
                  )}
                </div>
                <p className="text-[11px] text-[#64748b] mt-1 leading-snug">
                  যেসব গ্রুপে আপনি @BotFather বট অ্যাড করতে পারেন সেগুলোর জন্য
                </p>
              </button>
            </div>
          </div>

          {/* Interval Presets */}
          <div>
            <label className="block text-[10.5px] font-bold text-[#475569] uppercase tracking-wider mb-2">
              কত সময় পরপর পোস্ট হবে?
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {INTERVAL_PRESETS.map((preset) => {
                const active = currentConfig.intervalMinutes === preset.minutes;
                return (
                  <button
                    key={preset.minutes}
                    type="button"
                    style={
                      {
                        '--accent': '#2563eb',
                        '--accent-soft': '#eff6ff',
                        '--accent-border': '#bfdbfe',
                      } as React.CSSProperties
                    }
                    onClick={() =>
                      onDraftConfigChange({
                        ...currentConfig,
                        intervalMinutes: preset.minutes,
                      })
                    }
                    className={`ui-chip ${active ? 'active' : ''}`}
                  >
                    {preset.label}
                  </button>
                );
              })}

              <div className="flex items-center gap-1.5 ml-auto">
                <i className="ri-time-line text-sm text-[#94a3b8]" />
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={currentConfig.intervalMinutes}
                  onChange={(e) =>
                    onDraftConfigChange({
                      ...currentConfig,
                      intervalMinutes: Number(e.target.value) || 120,
                    })
                  }
                  className="w-16 px-2 py-1 text-[12px] border border-[#cbd5e1] rounded-[8px] ui-mono focus:outline-none focus:border-[#2563eb]"
                />
                <span className="text-[11px] font-semibold text-[#64748b]">মিনিট</span>
              </div>
            </div>
          </div>

          {/* Rotation Mode & Group Delay */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="ui-field mb-0">
              <label htmlFor="rotation-mode">পোস্ট রোটেশন নিয়ম</label>
              <select
                id="rotation-mode"
                value={currentConfig.rotationMode}
                onChange={(e) =>
                  onDraftConfigChange({
                    ...currentConfig,
                    rotationMode: e.target.value as RotationMode,
                  })
                }
              >
                <option value="sequential">একের পর এক পোস্ট (প্রতি রাউন্ডে ১টি)</option>
                <option value="all_active">সব সক্রিয় পোস্ট একসাথে</option>
                <option value="random">র‍্যান্ডমভাবে যেকোনো ১টি পোস্ট</option>
              </select>
            </div>

            <div className="ui-field mb-0">
              <label htmlFor="group-delay">অ্যান্টি-স্প্যাম গ্যাপ (গ্রুপ প্রতি বিরতি)</label>
              <select
                id="group-delay"
                value={currentConfig.delayBetweenGroupsSec}
                onChange={(e) =>
                  onDraftConfigChange({
                    ...currentConfig,
                    delayBetweenGroupsSec: Number(e.target.value),
                  })
                }
                className="ui-mono"
              >
                <option value={15}>১৫ সেকেন্ড</option>
                <option value={30}>৩০ সেকেন্ড</option>
                <option value={60}>১ মিনিট (৬০ সেকেন্ড — সুপারিশকৃত)</option>
                <option value={120}>২ মিনিট (১২০ সেকেন্ড)</option>
              </select>
            </div>
          </div>

          {/* Active Hours Window */}
          <div className="p-3 rounded-[10px] bg-[#f8fafc] border border-[#e2e8f0] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={currentConfig.activeHoursEnabled}
                  onChange={(e) =>
                    onDraftConfigChange({
                      ...currentConfig,
                      activeHoursEnabled: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-[#cbd5e1] text-[#2563eb] focus:ring-[#2563eb]"
                />
                <span className="text-[12px] font-bold text-[#0f172a]">
                  শুধুমাত্র দিনের নির্ধারিত সময়ে পোস্ট হবে (বাংলাদেশ সময়)
                </span>
              </label>

              <span
                className={`ui-badge shrink-0 ${
                  currentConfig.activeHoursEnabled ? 'ui-badge-info' : 'ui-badge-ok'
                }`}
              >
                {currentConfig.activeHoursEnabled
                  ? `সময়: ${String(currentConfig.activeStartHour).padStart(2, '0')}:00–${String(currentConfig.activeEndHour).padStart(2, '0')}:59`
                  : '২৪ ঘণ্টা চলবে (সব সময়)'}
              </span>
            </div>

            {currentConfig.activeHoursEnabled && (
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-semibold text-[#475569] pl-6">
                <span>শুরু:</span>
                <select
                  value={currentConfig.activeStartHour}
                  onChange={(e) =>
                    onDraftConfigChange({
                      ...currentConfig,
                      activeStartHour: Number(e.target.value),
                    })
                  }
                  className="px-2 py-1 border border-[#cbd5e1] rounded-[7px] bg-white ui-mono"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
                <span>শেষ:</span>
                <select
                  value={currentConfig.activeEndHour}
                  onChange={(e) =>
                    onDraftConfigChange({
                      ...currentConfig,
                      activeEndHour: Number(e.target.value),
                    })
                  }
                  className="px-2 py-1 border border-[#cbd5e1] rounded-[7px] bg-white ui-mono"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:59
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Contact CTA Button Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="ui-field mb-0">
              <label htmlFor="default-link">ডিফল্ট লিংক (আলাদা লিংক না দিলে)</label>
              <input
                id="default-link"
                type="url"
                value={currentConfig.sellerContactUrl}
                onChange={(e) =>
                  onDraftConfigChange({
                    ...currentConfig,
                    sellerContactUrl: e.target.value,
                  })
                }
                placeholder="https://t.me/your_username"
              />
            </div>

            <div className="ui-field mb-0">
              <label htmlFor="bot-btn-text">বট বাটনের লেখা (শুধু বট মোডে)</label>
              <input
                id="bot-btn-text"
                type="text"
                value={currentConfig.buttonText}
                onChange={(e) =>
                  onDraftConfigChange({
                    ...currentConfig,
                    buttonText: e.target.value,
                  })
                }
                placeholder="অর্ডার করতে মেসেজ দিন"
              />
            </div>
          </div>
        </div>

        {/* Action Footer (Save Configuration Only) */}
        <div className="px-3.5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc]/60 flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-[11.5px] font-bold">
            {hasUnsavedChanges ? (
              <span className="text-[#b45309] flex items-center gap-1.5">
                <i className="ri-error-warning-fill text-sm" />
                পরিবর্তন এখনো সেভ হয়নি — কার্যকর করতে পাশের বাটনে চাপ দিন
              </span>
            ) : (
              <span className="text-[#059669] flex items-center gap-1.5">
                <i className="ri-checkbox-circle-fill text-sm" />
                বর্তমান সেটিংস ডাটাবেজে সেভ আছে
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={savingConfig}
            onClick={() => void onSaveConfig()}
            className={`ui-btn ${hasUnsavedChanges ? 'ui-btn-success' : 'ui-btn-primary'}`}
          >
            <i className="ri-save-3-fill" />
            {savingConfig ? 'সেভ হচ্ছে...' : 'সেটিংস সেভ করুন'}
          </button>
        </div>
      </div>

      {/* 3. Change Website Login Password Card */}
      <div className="ui-card">
        <div className="ui-card-head">
          <div className="flex items-center gap-2.5">
            <span
              className="ui-drawer-ico"
              style={
                {
                  '--accent': '#4f46e5',
                  '--accent-soft': '#eef2ff',
                  '--accent-border': '#c7d2fe',
                } as React.CSSProperties
              }
            >
              <i className="ri-lock-password-fill" />
            </span>
            <div>
              <h3>ওয়েবসাইট লগইন পাসওয়ার্ড পরিবর্তন</h3>
              <p className="text-[11px] text-[#475569] font-medium">
                হোস্টিং প্যানেলে না ঢুকেই এখান থেকে ওয়েবসাইটের অ্যাডমিন পাসওয়ার্ড পরিবর্তন করুন
              </p>
            </div>
          </div>
          <span className="ui-badge ui-badge-ok">সুরক্ষিত</span>
        </div>

        <form onSubmit={handleChangePassword} className="ui-card-body">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
            <div className="ui-field mb-0">
              <label htmlFor="settings-cur-pwd">বর্তমান পাসওয়ার্ড</label>
              <input
                id="settings-cur-pwd"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="বর্তমান পাসওয়ার্ড"
              />
            </div>
            <div className="ui-field mb-0">
              <label htmlFor="settings-new-pwd">নতুন পাসওয়ার্ড</label>
              <input
                id="settings-new-pwd"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="কমপক্ষে ৪ অক্ষর"
              />
            </div>
            <button
              type="submit"
              disabled={updatingPwd}
              className="ui-btn ui-btn-primary py-2"
            >
              <i className={updatingPwd ? 'ri-loader-4-line animate-spin' : 'ri-save-3-fill'} />
              {updatingPwd ? 'পরিবর্তন হচ্ছে...' : 'পাসওয়ার্ড আপডেট করুন'}
            </button>
          </div>
        </form>
      </div>

      {/* 4. Data & Session Reset (Clean Customer Handover / Full Wipe) */}
      <div className="ui-card">
        <div className="ui-card-head">
          <div className="flex items-center gap-2.5">
            <span
              className="ui-drawer-ico"
              style={
                {
                  '--accent': '#e11d48',
                  '--accent-soft': '#fff1f2',
                  '--accent-border': '#fecdd3',
                } as React.CSSProperties
              }
            >
              <i className="ri-delete-bin-5-fill" />
            </span>
            <div>
              <h3>ডাটা ও সেশন রিসেট</h3>
              <p className="text-[11px] text-[#475569] font-medium">
                পুরোনো পোস্ট, গ্রুপ বা টেলিগ্রাম সেশন এক ক্লিকে মূল থেকে পরিষ্কার করুন
              </p>
            </div>
          </div>
          <span className="ui-badge ui-badge-err">রিসেট টুল</span>
        </div>

        <div className="ui-card-body space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={resetting}
              onClick={() => setResetScopeConfirm('posts')}
              className="ui-btn ui-btn-outline"
            >
              <i className="ri-shopping-bag-3-line text-[#e11d48]" />
              সব পোস্ট ও হিস্ট্রি মুছুন
            </button>

            <button
              type="button"
              disabled={resetting}
              onClick={() => setResetScopeConfirm('groups')}
              className="ui-btn ui-btn-outline"
            >
              <i className="ri-group-line text-[#d97706]" />
              সব গ্রুপ মুছুন
            </button>

            <button
              type="button"
              disabled={resetting}
              onClick={() => setResetScopeConfirm('all')}
              className="ui-btn ui-btn-danger"
            >
              <i className="ri-refresh-line" />
              সম্পূর্ণ ফ্যাক্টরি রিসেট (টেলিগ্রাম সেশনসহ)
            </button>
          </div>
          <p className="text-[11px] text-[#64748b] leading-relaxed">
            ফ্যাক্টরি রিসেট দিলে আপনার টেলিগ্রাম অ্যাকাউন্ট লগআউট হবে এবং সব পোস্ট, আপলোড করা ছবি, গ্রুপ ও হিস্ট্রি একদম পরিষ্কার হয়ে যাবে (ওয়েবসাইট লগইন পাসওয়ার্ড অপরিবর্তিত থাকবে)।
          </p>
        </div>
      </div>

      {/* 5. Edit Code (Built-in Code Patcher & File Updater) */}
      <div className="ui-card">
        <div className="ui-card-body flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="ui-drawer-ico"
              style={
                {
                  '--accent': '#7c3aed',
                  '--accent-soft': '#f5f3ff',
                  '--accent-border': '#ddd6fe',
                } as React.CSSProperties
              }
            >
              <i className="ri-code-s-slash-fill" />
            </span>
            <div>
              <h3 className="text-[13px] font-extrabold text-[#0f172a]">Edit Code</h3>
              <p className="text-[11px] text-[#475569] font-medium">
                cPanel ছাড়াই ভেতরের কোড আপলোড, Find &amp; Replace ও বিল্ড করুন
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCodeEditor(true)}
            className="ui-btn ui-btn-dark py-2 px-4"
          >
            <i className="ri-code-box-fill" />
            Edit Code
          </button>
        </div>
      </div>

      {/* Custom Confirm Reset Modal */}
      {resetScopeConfirm && (
        <div className="ui-modal-ov show" role="dialog" aria-modal="true">
          <div className="ui-modal max-w-[360px]">
            <div className="ui-modal-head">
              <h3>
                <i className="ri-alert-fill text-[#e11d48]" />
                নিশ্চিত করুন
              </h3>
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetScopeConfirm(null)}
                className="ui-btn ui-btn-outline py-1 px-2"
              >
                <i className="ri-close-line" />
              </button>
            </div>
            <div className="p-4 text-center space-y-3">
              <div className="w-11 h-11 rounded-[12px] bg-[#fff1f2] text-[#e11d48] border border-[#fecdd3] flex items-center justify-center text-xl mx-auto">
                <i className="ri-delete-bin-2-fill" />
              </div>
              <p className="text-[12.5px] font-semibold text-[#0f172a] leading-relaxed">
                {resetScopeConfirm === 'posts'
                  ? 'সব পোস্ট, আপলোড করা ছবি ও পোস্ট হিস্ট্রি স্থায়ীভাবে মুছে ফেলা হবে এবং অটো-পোস্ট বন্ধ হবে।'
                  : resetScopeConfirm === 'groups'
                  ? 'তালিকার সব টেলিগ্রাম গ্রুপ মুছে ফেলা হবে।'
                  : 'টেলিগ্রাম লগইন সেশন, সব পোস্ট, আপলোড করা ছবি, গ্রুপ ও হিস্ট্রি স্থায়ীভাবে মুছে একদম নতুন অবস্থায় আনা হবে।'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={resetting}
                  onClick={() => setResetScopeConfirm(null)}
                  className="ui-btn ui-btn-outline flex-1 py-2"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={resetting}
                  onClick={() => void handleConfirmReset()}
                  className="ui-btn ui-btn-stop flex-1 py-2"
                >
                  <i className={resetting ? 'ri-loader-4-line animate-spin' : 'ri-check-line'} />
                  {resetting ? 'মুছে ফেলা হচ্ছে...' : 'হ্যাঁ, মুছে ফেলুন'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
