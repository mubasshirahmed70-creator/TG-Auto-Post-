import React, { useState } from 'react';
import type {
  PostingMode,
  RotationMode,
  SchedulerConfig,
  UserbotStatus,
} from '../types.ts';
import { UserbotLoginCard } from './UserbotLoginCard.tsx';
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
        <div className="px-3.5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc]/60 flex items-center justify-end">
          <button
            type="button"
            disabled={savingConfig}
            onClick={() => void onSaveConfig()}
            className="ui-btn ui-btn-primary"
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
    </div>
  );
};
