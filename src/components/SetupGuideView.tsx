import React from 'react';
import type { BotStatus } from '../types.ts';

interface SetupGuideViewProps {
  botStatus: BotStatus;
  onSync: () => Promise<void>;
  onOpenSettings: () => void;
  syncing: boolean;
}

export const SetupGuideView: React.FC<SetupGuideViewProps> = ({
  botStatus,
  onSync,
  onOpenSettings,
  syncing,
}) => {
  return (
    <div className="space-y-3 max-w-4xl">
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
              <i className="ri-shield-check-fill" />
            </span>
            <h3>অন্যের বাই-সেল গ্রুপে (অ্যাডমিন না হয়েও) অটো-পোস্ট করার নিয়ম</h3>
          </div>
          <span className="ui-badge ui-badge-info">MTProto Userbot</span>
        </div>
        <div className="ui-card-body">
          <p className="text-[12px] text-[#475569] leading-relaxed">
            আপনি যেহেতু ওই বাই-সেল গ্রুপগুলোর অ্যাডমিন নন, তাই সেখানে বট অ্যাড করা যাবে না। এজন্যই মানুষ
            <strong className="font-bold text-[#0f172a]"> পার্সোনাল টেলিগ্রাম অ্যাকাউন্ট (MTProto Userbot) </strong>
            ব্যবহার করে। একবার লগইন করলে আপনার নিজের আইডি দিয়েই প্রতি ২–৩ ঘণ্টা পরপর অটোমেটিক ছবি, লেখা ও লিংক পোস্ট হবে।
          </p>
        </div>
      </div>

      {/* Step-by-step for Personal Account */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="ui-card mb-0">
          <div className="ui-card-body space-y-2">
            <div className="flex items-center justify-between">
              <span
                className="ui-stat-ico"
                style={
                  {
                    '--accent': '#2563eb',
                    '--accent-soft': '#eff6ff',
                    '--accent-border': '#bfdbfe',
                  } as React.CSSProperties
                }
              >
                <i className="ri-key-2-fill" />
              </span>
              <span className="ui-badge ui-badge-info">ধাপ ০১</span>
            </div>
            <h3 className="text-[13px] font-extrabold text-[#0f172a]">
              my.telegram.org থেকে API ID নিন
            </h3>
            <p className="text-[11.5px] text-[#475569] leading-relaxed">
              ব্রাউজারে <code className="px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a]">my.telegram.org</code>-এ গিয়ে আপনার নম্বর দিয়ে লগইন করুন।
              <strong className="font-bold text-[#0f172a]"> API development tools </strong>
              থেকে যেকোনো নাম দিয়ে তৈরি করলে ফ্রি <code className="px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a]">App api_id</code> ও <code className="px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a]">App api_hash</code> পাবেন।
            </p>
          </div>
        </div>

        <div className="ui-card mb-0">
          <div className="ui-card-body space-y-2">
            <div className="flex items-center justify-between">
              <span
                className="ui-stat-ico"
                style={
                  {
                    '--accent': '#7c3aed',
                    '--accent-soft': '#f5f3ff',
                    '--accent-border': '#ddd6fe',
                  } as React.CSSProperties
                }
              >
                <i className="ri-lock-password-fill" />
              </span>
              <span className="ui-badge ui-badge-info">ধাপ ০২</span>
            </div>
            <h3 className="text-[13px] font-extrabold text-[#0f172a]">
              cPanel Env বা .env-এ API Key দিন
            </h3>
            <p className="text-[11.5px] text-[#475569] leading-relaxed">
              cPanel-এ <strong className="font-bold">Setup Node.js App → Environment variables</strong>-এ (অথবা অ্যাপ ফোল্ডারের <code className="px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a]">.env</code> ফাইলে)
              <code className="mx-1 px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a]">TELEGRAM_API_ID</code> এবং
              <code className="mx-1 px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a]">TELEGRAM_API_HASH</code>
              সেভ করে অ্যাপ রিস্টার্ট করুন।
            </p>
          </div>
        </div>

        <div className="ui-card mb-0">
          <div className="ui-card-body space-y-2">
            <div className="flex items-center justify-between">
              <span
                className="ui-stat-ico"
                style={
                  {
                    '--accent': '#0d9488',
                    '--accent-soft': '#f0fdfa',
                    '--accent-border': '#99f6e4',
                  } as React.CSSProperties
                }
              >
                <i className="ri-group-fill" />
              </span>
              <span className="ui-badge ui-badge-ok">ধাপ ০৩</span>
            </div>
            <h3 className="text-[13px] font-extrabold text-[#0f172a]">
              ফোন নম্বর দিয়ে লগইন ও গ্রুপ সিঙ্ক
            </h3>
            <p className="text-[11.5px] text-[#475569] leading-relaxed">
              উপরের <strong className="font-bold text-[#0f172a]">সেটিংস</strong> ট্যাবে গিয়ে আপনার নম্বর ও OTP কোড দিন। লগইন হলেই আপনার জয়েন করা সব বাই-সেল গ্রুপ অটোমেটিক চলে আসবে।
            </p>
            <button
              type="button"
              onClick={onOpenSettings}
              className="ui-btn ui-btn-outline mt-1"
            >
              <i className="ri-settings-4-fill" style={{ color: '#4f46e5' }} />
              সেটিংসে গিয়ে কানেক্ট করুন
            </button>
          </div>
        </div>
      </div>

      {/* Anti-Ban Safety Advice */}
      <div className="ui-card border-[#fde68a]">
        <div className="ui-card-head bg-[#fffbeb] border-[#fde68a]">
          <div className="flex items-center gap-2">
            <span
              className="ui-drawer-ico"
              style={
                {
                  '--accent': '#d97706',
                  '--accent-soft': '#fffbeb',
                  '--accent-border': '#fde68a',
                } as React.CSSProperties
              }
            >
              <i className="ri-shield-star-fill" />
            </span>
            <h3 className="text-[#92400e]">পার্সোনাল অ্যাকাউন্ট নিরাপদ রাখার ৩টি টিপস</h3>
          </div>
        </div>
        <div className="ui-card-body bg-[#fffbeb]/40">
          <ul className="text-[12px] text-[#78350f] space-y-1.5 list-disc pl-5 leading-relaxed">
            <li>
              প্রতি গ্রুপে পোস্ট করার মাঝে কমপক্ষে <strong>৬০ সেকেন্ড (১ মিনিট) গ্যাপ</strong> রাখুন (ডিফল্ট সেটিংসে দেওয়া আছে)।
            </li>
            <li>একসাথে ৫০–১০০ গ্রুপে না পাঠিয়ে আপনার সেরা ১০–২০টি অ্যাক্টিভ বাই-সেল গ্রুপ চালু রাখুন।</li>
            <li>নিরাপত্তার জন্য মেইন ব্যক্তিগত নম্বরের বদলে ব্যবসার আলাদা টেলিগ্রাম সিম ব্যবহার করা সবচেয়ে ভালো।</li>
          </ul>
        </div>
      </div>

      {/* 24/7 Hosting & Phone Usage Info */}
      <div className="ui-card">
        <div className="ui-card-head">
          <div className="flex items-center gap-2.5">
            <span
              className="ui-drawer-ico"
              style={
                {
                  '--accent': '#0284c7',
                  '--accent-soft': '#f0f9ff',
                  '--accent-border': '#bae6fd',
                } as React.CSSProperties
              }
            >
              <i className="ri-server-fill" />
            </span>
            <h3>ফোনে কি কিছু ইনস্টল করতে হবে? আর ২৪/৭ কীভাবে চলবে?</h3>
          </div>
        </div>
        <div className="ui-card-body text-[12px] text-[#475569] space-y-2 leading-relaxed">
          <p>
            <strong className="text-[#0f172a]">১. ফোনে কোনো অ্যাপ ইনস্টল করতে হবে না:</strong> এটি একটি সার্ভার-ভিত্তিক ওয়েব অ্যাপ। আপনি ফোনের ব্রাউজার দিয়েই সব কন্ট্রোল করতে পারবেন—ফোন বন্ধ থাকলেও সার্ভার পোস্ট পাঠাতে থাকবে।
          </p>
          <p>
            <strong className="text-[#0f172a]">২. cPanel (Node.js) ও Cloud Run-এ ২৪/৭ চালানো:</strong> আপনার cPanel-এ <em>Setup Node.js App</em> (Node 22) থেকে <code className="px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a]">cpanel-start.cjs</code> স্টার্টআপ ফাইল দিয়ে রান করলে কিংবা Cloud Run-এ ডিপ্লয় করলে ২৪/৭ চলবে।
          </p>
          <p>
            <strong className="text-[#0f172a]">৩. স্লিপ মোড আটকাতে Cron পিং:</strong> cPanel <em>Cron Jobs</em> বা <code className="px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a]">cron-job.org</code> থেকে প্রতি ৫ মিনিটে <code className="px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a]">/api/cron/tick</code> পিং করলে ২৪/৭ নির্ধারিত সময়ে পোস্ট হতে থাকবে।
          </p>
        </div>
      </div>

      {/* Optional Official Bot Status */}
      <div className="ui-card">
        <div className="ui-card-body flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className="ui-stat-ico"
              style={
                botStatus.connected
                  ? ({
                      '--accent': '#059669',
                      '--accent-soft': '#ecfdf5',
                      '--accent-border': '#a7f3d0',
                    } as React.CSSProperties)
                  : ({
                      '--accent': '#475569',
                      '--accent-soft': '#f8fafc',
                      '--accent-border': '#e2e8f0',
                    } as React.CSSProperties)
              }
            >
              <i className={botStatus.connected ? 'ri-robot-2-fill' : 'ri-robot-2-line'} />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[13px] font-extrabold text-[#0f172a]">
                  অপশনাল: অফিশিয়াল বট মোড (@BotFather)
                </h3>
                <span className={`ui-badge ${botStatus.connected ? 'ui-badge-ok' : 'ui-badge-neutral'}`}>
                  {botStatus.connected ? 'সক্রিয়' : 'অফলাইন'}
                </span>
              </div>
              <p className="text-[11.5px] text-[#475569] mt-0.5">
                {botStatus.connected && botStatus.botInfo
                  ? `কানেক্টেড: ${botStatus.botInfo.first_name} (@${botStatus.botInfo.username})`
                  : 'আপনার নিজের তৈরি গ্রুপ বা চ্যানেল থাকলে TELEGRAM_BOT_TOKEN সেট করে বট মোডেও চালাতে পারবেন।'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onSync()}
            disabled={syncing}
            className="ui-btn ui-btn-outline shrink-0 self-start sm:self-center"
          >
            <i className={`ri-refresh-line ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'চেক করা হচ্ছে...' : 'স্ট্যাটাস রিফ্রেশ'}
          </button>
        </div>
      </div>
    </div>
  );
};
