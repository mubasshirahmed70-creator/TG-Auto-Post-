import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AppStateResponse,
  PostingMode,
  PostLog,
  ProductItem,
  SchedulerConfig,
} from './types.ts';
import { TelegramPreview } from './components/TelegramPreview.tsx';
import { ProductModal } from './components/ProductModal.tsx';
import { SetupGuideView } from './components/SetupGuideView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { withBase } from './basePath.ts';

type NavTab = 'overview' | 'products' | 'groups' | 'logs' | 'setup' | 'settings';

interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AccentTheme {
  accent: string;
  dark: string;
  soft: string;
  border: string;
  glow: string;
}

const ACCENTS: Record<'blue' | 'indigo' | 'violet' | 'sky' | 'teal' | 'emerald' | 'amber' | 'rose', AccentTheme> = {
  blue: {
    accent: '#2563eb',
    dark: '#1d4ed8',
    soft: '#eff6ff',
    border: '#bfdbfe',
    glow: 'rgba(37, 99, 235, 0.24)',
  },
  indigo: {
    accent: '#4f46e5',
    dark: '#4338ca',
    soft: '#eef2ff',
    border: '#c7d2fe',
    glow: 'rgba(79, 70, 229, 0.24)',
  },
  violet: {
    accent: '#7c3aed',
    dark: '#6d28d9',
    soft: '#f5f3ff',
    border: '#ddd6fe',
    glow: 'rgba(124, 58, 237, 0.24)',
  },
  sky: {
    accent: '#0284c7',
    dark: '#0369a1',
    soft: '#f0f9ff',
    border: '#bae6fd',
    glow: 'rgba(2, 132, 199, 0.24)',
  },
  teal: {
    accent: '#0d9488',
    dark: '#0f766e',
    soft: '#f0fdfa',
    border: '#99f6e4',
    glow: 'rgba(13, 148, 136, 0.24)',
  },
  emerald: {
    accent: '#059669',
    dark: '#047857',
    soft: '#ecfdf5',
    border: '#a7f3d0',
    glow: 'rgba(5, 150, 105, 0.24)',
  },
  amber: {
    accent: '#d97706',
    dark: '#b45309',
    soft: '#fffbeb',
    border: '#fde68a',
    glow: 'rgba(217, 119, 6, 0.24)',
  },
  rose: {
    accent: '#e11d48',
    dark: '#be123c',
    soft: '#fff1f2',
    border: '#fecdd3',
    glow: 'rgba(225, 29, 72, 0.24)',
  },
};

function accentVars(theme: AccentTheme): React.CSSProperties {
  return {
    '--accent': theme.accent,
    '--accent-dark': theme.dark,
    '--accent-soft': theme.soft,
    '--accent-border': theme.border,
    '--accent-glow': theme.glow,
  } as React.CSSProperties;
}

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  shortLabel: string;
  iconClass: string;
  theme: AccentTheme;
}> = [
  {
    id: 'overview',
    label: 'ওভারভিউ ও শিডিউল',
    shortLabel: 'ওভারভিউ',
    iconClass: 'ri-home-5-fill',
    theme: ACCENTS.blue,
  },
  {
    id: 'products',
    label: 'পোস্ট সমূহ',
    shortLabel: 'পোস্ট',
    iconClass: 'ri-shopping-bag-3-fill',
    theme: ACCENTS.violet,
  },
  {
    id: 'groups',
    label: 'অ্যাকাউন্ট ও গ্রুপ',
    shortLabel: 'গ্রুপ',
    iconClass: 'ri-group-fill',
    theme: ACCENTS.teal,
  },
  {
    id: 'logs',
    label: 'পোস্ট হিস্ট্রি',
    shortLabel: 'হিস্ট্রি',
    iconClass: 'ri-history-fill',
    theme: ACCENTS.emerald,
  },
  {
    id: 'setup',
    label: 'সেটআপ গাইড',
    shortLabel: 'সেটআপ',
    iconClass: 'ri-book-open-fill',
    theme: ACCENTS.indigo,
  },
  {
    id: 'settings',
    label: 'সেটিংস',
    shortLabel: 'সেটিংস',
    iconClass: 'ri-settings-4-fill',
    theme: ACCENTS.blue,
  },
];

const DOCK_ITEMS = NAV_ITEMS.slice(0, 4);

function formatCountdown(nextRunAt: string | null, enabled: boolean, nowMs: number): string {
  if (!enabled) return 'শিডিউল বন্ধ';
  if (!nextRunAt) return 'অপেক্ষমাণ';
  const diff = Math.max(0, Date.parse(nextRunAt) - nowMs);
  if (diff <= 0) return 'পোস্ট শুরু হচ্ছে...';
  const totalSec = Math.floor(diff / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('bn-BD', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function formatIntervalLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    return `${minutes / 60} ঘণ্টা`;
  }
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return hrs > 0 ? `${hrs} ঘণ্টা ${rem} মিনিট` : `${minutes} মিনিট`;
}

const AUTH_TOKEN_KEY = 'bazarbot_auth_token';

export default function App() {
  const [authToken, setAuthToken] = useState<string>(() => {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [authState, setAuthState] = useState<'checking' | 'locked' | 'unlocked'>('checking');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [state, setState] = useState<AppStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [draftConfig, setDraftConfig] = useState<SchedulerConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productFilter, setProductFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const [newGroupChatId, setNewGroupChatId] = useState('');
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [syncingGroups, setSyncingGroups] = useState(false);

  const [logFilter, setLogFilter] = useState<'all' | PostLog['status']>('all');
  const [broadcastingNow, setBroadcastingNow] = useState(false);

  // Subtle Button Ripple Listener (strictly excludes .ui-dock-btn)
  useEffect(() => {
    const handleRippleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest('.ui-btn, .ui-menu-btn, .ui-drawer-btn') as HTMLElement | null;
      if (!btn || btn.classList.contains('ui-dock-btn')) return;
      const r = btn.getBoundingClientRect();
      const sp = document.createElement('span');
      const sz = Math.max(r.width, r.height);
      sp.style.width = `${sz}px`;
      sp.style.height = `${sz}px`;
      sp.style.left = `${e.clientX - r.left - sz / 2}px`;
      sp.style.top = `${e.clientY - r.top - sz / 2}px`;
      sp.className = 'ui-ripple';
      btn.appendChild(sp);
      setTimeout(() => sp.remove(), 500);
    };
    document.addEventListener('click', handleRippleClick);
    return () => document.removeEventListener('click', handleRippleClick);
  }, []);

  const pushToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const handleUnauthorized = useCallback(() => {
    setAuthToken('');
    setAuthState('locked');
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // ignore storage errors
    }
  }, []);

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(options.headers);
      if (authToken) {
        headers.set('Authorization', `Bearer ${authToken}`);
      }
      const res = await fetch(withBase(url), { ...options, headers });
      if (res.status === 401) {
        handleUnauthorized();
      }
      return res;
    },
    [authToken, handleUnauthorized]
  );

  // Verify existing saved session token on boot
  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      if (!authToken) {
        setAuthState('locked');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(withBase('/api/auth/status'), {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = (await res.json()) as { authenticated?: boolean };
        if (cancelled) return;
        if (data.authenticated) {
          setAuthState('unlocked');
        } else {
          handleUnauthorized();
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setAuthState('locked');
          setLoading(false);
        }
      }
    };
    void verify();
    return () => {
      cancelled = true;
    };
  }, [authToken, handleUnauthorized]);

  const handleWebsiteLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPassword.trim()) {
      setLoginError('পাসওয়ার্ড লিখুন');
      return;
    }
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch(withBase('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword }),
      });
      const data = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !data.token) {
        setLoginError(data.error ?? 'পাসওয়ার্ড ভুল হয়েছে');
        return;
      }
      try {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      } catch {
        // ignore storage errors
      }
      setAuthToken(data.token);
      setLoginPassword('');
      setLoading(true);
      setAuthState('unlocked');
      pushToast('success', 'সফলভাবে লগইন হয়েছে');
    } catch {
      setLoginError('সার্ভারের সাথে সংযোগ করতে সমস্যা হয়েছে');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleWebsiteLogout = async () => {
    try {
      await fetch(withBase('/api/auth/logout'), { method: 'POST' });
    } catch {
      // ignore
    }
    handleUnauthorized();
    setState(null);
    setDraftConfig(null);
    pushToast('info', 'ওয়েবসাইট লক করা হয়েছে');
  };

  const fetchState = useCallback(
    async (isInitial = false) => {
      if (authState !== 'unlocked') return;
      try {
        const res = await apiFetch('/api/state');
        if (!res.ok) throw new Error('Failed to load state');
        const data = (await res.json()) as AppStateResponse;
        setState(data);
        if (isInitial) {
          setDraftConfig(data.config);
        }
      } catch {
        if (isInitial) {
          pushToast('error', 'সার্ভারের সাথে সংযোগ করতে সমস্যা হয়েছে');
        }
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, authState, pushToast]
  );

  useEffect(() => {
    if (authState !== 'unlocked') return;
    void fetchState(true);
    const pollId = setInterval(() => {
      void fetchState(false);
    }, 6000);
    return () => clearInterval(pollId);
  }, [authState, fetchState]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentConfig = draftConfig ?? state?.config ?? null;

  const handleSaveConfig = async (override?: Partial<SchedulerConfig>) => {
    if (!currentConfig) return;
    const payload = { ...currentConfig, ...(override ?? {}) };
    setDraftConfig(payload);
    setSavingConfig(true);
    try {
      const res = await apiFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Config save failed');
      const updated = (await res.json()) as SchedulerConfig;
      setDraftConfig(updated);
      setState((prev) => (prev ? { ...prev, config: updated } : prev));
      if (override && typeof override.enabled === 'boolean') {
        pushToast(
          override.enabled ? 'success' : 'info',
          override.enabled
            ? 'সিস্টেম স্টার্ট হয়েছে — নির্ধারিত সময়ে অটো-পোস্ট চলবে'
            : 'সিস্টেম স্টপ করা হয়েছে'
        );
      } else {
        pushToast('success', 'শিডিউল ও সেটিংস সেভ করা হয়েছে');
      }
    } catch {
      pushToast('error', 'সেটিংস সেভ করা যায়নি');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleBroadcastNow = async (options?: { productId?: string; dryRun?: boolean }) => {
    setBroadcastingNow(true);
    try {
      const res = await apiFetch('/api/broadcast/now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options ?? {}),
      });
      const data = (await res.json()) as {
        sent?: number;
        failed?: number;
        dryRunCount?: number;
        error?: string;
      };
      if (!res.ok) {
        pushToast('error', data.error ?? 'পোস্ট পাঠানো যায়নি');
        return;
      }
      if (options?.dryRun) {
        pushToast('info', `${data.dryRunCount ?? 0}টি গ্রুপের জন্য টেস্ট সিমুলেশন সম্পন্ন হয়েছে`);
      } else {
        pushToast(
          data.failed && data.failed > 0 ? 'info' : 'success',
          `${data.sent ?? 0}টি গ্রুপে পোস্ট সফল হয়েছে${data.failed ? `, ${data.failed}টি ব্যর্থ` : ''}`
        );
      }
      await fetchState(false);
    } catch {
      pushToast('error', 'ব্রডকাস্ট করতে নেটওয়ার্ক সমস্যা হয়েছে');
    } finally {
      setBroadcastingNow(false);
    }
  };

  const handleSaveProduct = async (payload: {
    id?: string;
    name?: string;
    caption: string;
    link?: string;
    images: string[];
    active: boolean;
  }) => {
    const isEdit = Boolean(payload.id);
    const url = isEdit ? `/api/products/${payload.id}` : '/api/products';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      throw new Error(err.error ?? 'পোস্ট সেভ করা যায়নি');
    }
    await fetchState(false);
    pushToast('success', isEdit ? 'পোস্ট আপডেট হয়েছে' : 'নতুন পোস্ট যুক্ত হয়েছে');
  };

  const handleToggleProductActive = async (product: ProductItem) => {
    try {
      const res = await apiFetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !product.active }),
      });
      if (!res.ok) throw new Error();
      await fetchState(false);
      pushToast('info', !product.active ? 'পোস্ট চালু করা হয়েছে' : 'পোস্ট পজ করা হয়েছে');
    } catch {
      pushToast('error', 'স্ট্যাটাস পরিবর্তন করা যায়নি');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const res = await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await fetchState(false);
      pushToast('info', 'পোস্ট ডিলিট করা হয়েছে');
    } catch {
      pushToast('error', 'পোস্ট ডিলিট করা যায়নি');
    }
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupChatId.trim()) return;
    setAddingGroup(true);
    try {
      const res = await apiFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: newGroupChatId.trim(),
          title: newGroupTitle.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        pushToast('error', data.error ?? 'গ্রুপ যুক্ত করা যায়নি');
        return;
      }
      setNewGroupChatId('');
      setNewGroupTitle('');
      await fetchState(false);
      pushToast('success', 'টেলিগ্রাম গ্রুপ যুক্ত হয়েছে');
    } catch {
      pushToast('error', 'গ্রুপ যুক্ত করতে সমস্যা হয়েছে');
    } finally {
      setAddingGroup(false);
    }
  };

  const handleToggleGroup = async (id: string, enabled: boolean) => {
    try {
      await apiFetch(`/api/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      await fetchState(false);
    } catch {
      pushToast('error', 'গ্রুপ আপডেট করা যায়নি');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await apiFetch(`/api/groups/${id}`, { method: 'DELETE' });
      await fetchState(false);
      pushToast('info', 'গ্রুপ তালিকা থেকে সরানো হয়েছে');
    } catch {
      pushToast('error', 'গ্রুপ রিমুভ করা যায়নি');
    }
  };

  const handleSyncGroups = async () => {
    setSyncingGroups(true);
    try {
      const res = await apiFetch('/api/groups/sync', { method: 'POST' });
      if (!res.ok) throw new Error();
      await fetchState(false);
      pushToast('success', 'টেলিগ্রাম অ্যাকাউন্ট ও গ্রুপ তালিকা সিঙ্ক হয়েছে');
    } catch {
      pushToast('error', 'সিঙ্ক করতে সমস্যা হয়েছে');
    } finally {
      setSyncingGroups(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await apiFetch('/api/logs', { method: 'DELETE' });
      await fetchState(false);
      pushToast('info', 'লগ হিস্ট্রি পরিষ্কার করা হয়েছে');
    } catch {
      pushToast('error', 'লগ মুছতে সমস্যা হয়েছে');
    }
  };

  const filteredProducts = useMemo(() => {
    const list = state?.products ?? [];
    return list.filter((p) => {
      const matchesFilter =
        productFilter === 'all' ||
        (productFilter === 'active' && p.active) ||
        (productFilter === 'paused' && !p.active);
      const query = productSearch.trim().toLowerCase();
      const matchesSearch =
        !query ||
        p.name.toLowerCase().includes(query) ||
        (p.link ?? '').toLowerCase().includes(query) ||
        p.caption.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [state?.products, productFilter, productSearch]);

  const filteredGroups = useMemo(() => {
    const list = state?.groups ?? [];
    const q = groupSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        (g.username ?? '').toLowerCase().includes(q) ||
        g.chatId.includes(q)
    );
  }, [state?.groups, groupSearch]);

  const filteredLogs = useMemo(() => {
    const logs = state?.logs ?? [];
    if (logFilter === 'all') return logs;
    return logs.filter((l) => l.status === logFilter);
  }, [state?.logs, logFilter]);

  const activeProductsCount = (state?.products ?? []).filter((p) => p.active).length;
  const enabledGroupsCount = (state?.groups ?? []).filter((g) => g.enabled).length;

  const activeMode: PostingMode = currentConfig?.postingMode ?? 'userbot';
  const userbotConnected = Boolean(state?.userbotStatus.connected);
  const botConnected = Boolean(state?.botStatus.connected);
  const activeSenderConnected = activeMode === 'userbot' ? userbotConnected : botConnected;

  const senderDisplayName =
    activeMode === 'userbot'
      ? state?.userbotStatus.user
        ? [state.userbotStatus.user.firstName, state.userbotStatus.user.lastName]
            .filter(Boolean)
            .join(' ')
        : 'আপনার টেলিগ্রাম অ্যাকাউন্ট'
      : state?.botStatus.botInfo?.first_name ?? 'BazarBot';

  const selectTab = (tab: NavTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="ui-card max-w-[360px] w-full mb-0">
          <div className="ui-card-body py-10 flex flex-col items-center gap-3 text-center">
            <div className="ui-stat-ico" style={accentVars(ACCENTS.blue)}>
              <i className="ri-loader-4-line animate-spin" />
            </div>
            <p className="text-[12.5px] font-bold text-[#475569]">সেশন যাচাই হচ্ছে...</p>
          </div>
        </div>
      </div>
    );
  }

  if (authState === 'locked') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="ui-card max-w-[380px] w-full mb-0 ui-page-enter">
          <div className="ui-card-head">
            <div className="flex items-center gap-2.5">
              <div className="ui-brand-ico">
                <i className="ri-send-plane-fill" />
              </div>
              <div>
                <h3 className="leading-none">BazarBot</h3>
                <p className="text-[10.5px] font-bold text-[#64748b] mt-0.5">
                  Telegram Auto-Poster
                </p>
              </div>
            </div>
            <span className="ui-badge ui-badge-info">
              <i className="ri-lock-2-fill" />
              সুরক্ষিত
            </span>
          </div>

          <form onSubmit={handleWebsiteLogin} className="ui-card-body space-y-3.5">
            <div className="flex items-start gap-2.5 p-2.5 rounded-[10px] bg-[#f8fafc] border border-[#e2e8f0]">
              <span className="ui-drawer-ico" style={accentVars(ACCENTS.indigo)}>
                <i className="ri-shield-user-fill" />
              </span>
              <div>
                <p className="text-[12.5px] font-extrabold text-[#0f172a]">
                  অ্যাডমিন প্যানেল লগইন
                </p>
                <p className="text-[11px] text-[#64748b] mt-0.5">
                  ড্যাশবোর্ডে প্রবেশ করতে ওয়েবসাইটের পাসওয়ার্ড দিন
                </p>
              </div>
            </div>

            {loginError && (
              <div className="p-2.5 rounded-[9px] bg-[#fff1f2] border border-[#fecdd3] text-[11.5px] font-semibold text-[#e11d48] flex items-center gap-2">
                <i className="ri-error-warning-fill text-sm shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <div className="ui-field mb-0">
              <label htmlFor="site-password">ওয়েবসাইট পাসওয়ার্ড</label>
              <div className="relative">
                <i className="ri-lock-password-line text-sm text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="site-password"
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="পাসওয়ার্ড লিখুন"
                  autoFocus
                  style={{ paddingLeft: '30px', paddingRight: '34px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#0f172a]"
                  aria-label="Toggle password visibility"
                >
                  <i className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="ui-btn ui-btn-primary w-full py-2.5"
            >
              <i className={loggingIn ? 'ri-loader-4-line animate-spin' : 'ri-login-box-line'} />
              {loggingIn ? 'যাচাই হচ্ছে...' : 'লগইন করুন'}
            </button>
          </form>
        </div>

        {toasts.length > 0 && (
          <div className="ui-toast-stack">
            {toasts.map((t) => (
              <div key={t.id} className="ui-toast">
                {t.type === 'success' && (
                  <i className="ri-checkbox-circle-fill text-sm text-[#10b981] shrink-0" />
                )}
                {t.type === 'error' && (
                  <i className="ri-close-circle-fill text-sm text-[#fb7185] shrink-0" />
                )}
                {t.type === 'info' && (
                  <i className="ri-information-fill text-sm text-[#60a5fa] shrink-0" />
                )}
                <span>{t.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Sticky Compact Top Navbar */}
      <header className="ui-navbar">
        <div className="ui-nav-inner">
          <button
            type="button"
            onClick={() => selectTab('overview')}
            className="ui-brand"
          >
            <div className="ui-brand-ico">
              <i className="ri-send-plane-fill" />
            </div>
            <div className="min-w-0">
              <span className="ui-brand-title block leading-none">BazarBot</span>
              <span className="text-[10px] font-bold text-[#64748b] hidden sm:block mt-0.5">
                Telegram Auto-Poster
              </span>
            </div>
          </button>

          {/* Right Action Controls (Setup Guide + Settings + Lock) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => selectTab('setup')}
              className={`ui-btn ${activeTab === 'setup' ? 'ui-btn-primary' : 'ui-btn-outline'}`}
            >
              <i
                className="ri-book-open-fill"
                style={{ color: activeTab === 'setup' ? '#ffffff' : '#4f46e5' }}
              />
              <span>সেটআপ গাইড</span>
            </button>

            <button
              type="button"
              onClick={() => selectTab('settings')}
              className={`ui-btn ${activeTab === 'settings' ? 'ui-btn-primary' : 'ui-btn-outline'}`}
            >
              <i
                className="ri-settings-4-fill"
                style={{ color: activeTab === 'settings' ? '#ffffff' : '#2563eb' }}
              />
              <span>সেটিংস</span>
            </button>

            <button
              type="button"
              onClick={() => void handleWebsiteLogout()}
              className="ui-btn ui-btn-ghost px-2"
              title="ওয়েবসাইট লক / লগআউট"
              aria-label="Lock website"
            >
              <i className="ri-logout-box-r-line text-sm" style={{ color: '#e11d48' }} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="ui-container">
        {loading || !state || !currentConfig ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-white border border-[#e2e8f0] rounded-[12px]" />
            ))}
          </div>
        ) : (
          <div key={activeTab} className="ui-page-enter">
            {/* OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-3">
                {/* 1. Top Card: Account & Schedule Status + Instructions Only (No Action Buttons) */}
                <div className="ui-card mb-0">
                  <div className="ui-card-head">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="ui-drawer-ico" style={accentVars(ACCENTS.blue)}>
                        <i className="ri-dashboard-3-fill" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate">অ্যাকাউন্ট ও শিডিউল অবস্থা</h3>
                        <p className="text-[10.5px] text-[#64748b] font-medium truncate">
                          বর্তমান সংযোগ এবং অটো-পোস্টের সার্বিক নির্দেশনা
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="ui-card-body space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="p-2.5 rounded-[10px] bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10.5px] font-bold text-[#64748b]">টেলিগ্রাম অ্যাকাউন্ট</p>
                          <p className="text-[12.5px] font-extrabold text-[#0f172a] truncate mt-0.5">
                            {activeSenderConnected ? senderDisplayName : 'কানেক্ট করা নেই'}
                          </p>
                        </div>
                        <span
                          className={`ui-badge shrink-0 ${
                            activeSenderConnected ? 'ui-badge-ok' : 'ui-badge-warn'
                          }`}
                        >
                          {activeSenderConnected ? 'কানেক্টেড' : 'অফলাইন'}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-[10px] bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10.5px] font-bold text-[#64748b]">অটো-পোস্ট শিডিউলার</p>
                          <p className="text-[12.5px] font-extrabold text-[#0f172a] truncate mt-0.5">
                            {activeMode === 'userbot' ? 'পার্সোনাল অ্যাকাউন্ট' : 'অফিশিয়াল বট'}
                          </p>
                        </div>
                        <span
                          className={`ui-badge shrink-0 ${
                            currentConfig.enabled ? 'ui-badge-ok' : 'ui-badge-neutral'
                          }`}
                        >
                          {currentConfig.enabled ? 'চলমান (Start)' : 'বন্ধ (Stop)'}
                        </span>
                      </div>
                    </div>

                    {/* Instructions Box */}
                    <div className="p-3 rounded-[10px] bg-[#f8fafc] border border-[#e2e8f0] space-y-1.5 text-[11.5px] text-[#475569] leading-relaxed">
                      <p className="font-extrabold text-[#0f172a] flex items-center gap-1.5">
                        <i className="ri-information-fill text-[#2563eb]" />
                        ব্যবহারের নির্দেশনা:
                      </p>
                      <p>
                        ১. টেলিগ্রাম নাম্বার কানেক্ট করতে এবং অটো-পোস্টের সময় ও নিয়ম সেট করতে উপরের{' '}
                        <strong className="text-[#0f172a]">সেটিংস</strong> ট্যাবে যান।
                      </p>
                      <p>
                        ২. নিচের <strong className="text-[#0f172a]">পোস্ট</strong> ট্যাব থেকে আপনার পোস্ট যুক্ত করুন এবং{' '}
                        <strong className="text-[#0f172a]">গ্রুপ</strong> ট্যাব থেকে যেসব গ্রুপে পোস্ট পাঠাতে চান তা চালু করুন।
                      </p>
                      <p>
                        ৩. সব সেটআপ শেষে নিচের <strong className="text-[#059669]">Start</strong> বাটনে চাপ দিলে সিস্টেম স্বয়ংক্রিয়ভাবে কাজ শুরু করবে; বন্ধ করতে <strong className="text-[#e11d48]">Stop</strong> চাপুন।
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Big Start / Stop System Control Button */}
                <button
                  type="button"
                  disabled={savingConfig}
                  onClick={() => void handleSaveConfig({ enabled: !currentConfig.enabled })}
                  className={`ui-btn w-full py-3.5 text-[14.5px] font-extrabold rounded-[12px] ${
                    currentConfig.enabled ? 'ui-btn-stop' : 'ui-btn-success'
                  }`}
                >
                  <i
                    className={`text-lg ${
                      savingConfig
                        ? 'ri-loader-4-line animate-spin'
                        : currentConfig.enabled
                        ? 'ri-stop-circle-fill'
                        : 'ri-play-circle-fill'
                    }`}
                  />
                  <span>
                    {savingConfig
                      ? 'আপডেট হচ্ছে...'
                      : currentConfig.enabled
                      ? 'Stop — অটো-পোস্ট সিস্টেম বন্ধ করুন'
                      : 'Start — অটো-পোস্ট সিস্টেম চালু করুন'}
                  </span>
                </button>

                {/* 3. 4-Column Stat Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="ui-stat-card">
                    <div className="min-w-0">
                      <p className="text-[10.5px] font-bold text-[#64748b] uppercase">সক্রিয় পোস্ট</p>
                      <p className="text-xl font-extrabold text-[#0f172a] ui-mono mt-0.5">
                        {activeProductsCount}
                        <span className="text-xs font-semibold text-[#94a3b8] ml-1">
                          / {state.products.length}
                        </span>
                      </p>
                      <p className="text-[10.5px] text-[#64748b] truncate mt-0.5">কিউ-তে প্রস্তুত</p>
                    </div>
                    <div className="ui-stat-ico" style={accentVars(ACCENTS.blue)}>
                      <i className="ri-shopping-bag-3-fill" />
                    </div>
                  </div>

                  <div className="ui-stat-card">
                    <div className="min-w-0">
                      <p className="text-[10.5px] font-bold text-[#64748b] uppercase">টার্গেট গ্রুপ</p>
                      <p className="text-xl font-extrabold text-[#0f172a] ui-mono mt-0.5">
                        {enabledGroupsCount}
                        <span className="text-xs font-semibold text-[#94a3b8] ml-1">
                          / {state.groups.length}
                        </span>
                      </p>
                      <p className="text-[10.5px] text-[#64748b] truncate mt-0.5">
                        {enabledGroupsCount === 0 ? 'গ্রুপ চালু করুন' : 'পোস্টের জন্য সক্রিয়'}
                      </p>
                    </div>
                    <div className="ui-stat-ico" style={accentVars(ACCENTS.teal)}>
                      <i className="ri-group-fill" />
                    </div>
                  </div>

                  <div className="ui-stat-card">
                    <div className="min-w-0">
                      <p className="text-[10.5px] font-bold text-[#64748b] uppercase">পোস্ট বিরতি</p>
                      <p className="text-lg font-extrabold text-[#0f172a] ui-mono mt-0.5 truncate">
                        {formatIntervalLabel(currentConfig.intervalMinutes)}
                      </p>
                      <p className="text-[10.5px] text-[#64748b] truncate mt-0.5">
                        গ্রুপ গ্যাপ {currentConfig.delayBetweenGroupsSec} সে.
                      </p>
                    </div>
                    <div className="ui-stat-ico" style={accentVars(ACCENTS.violet)}>
                      <i className="ri-time-fill" />
                    </div>
                  </div>

                  <div className="ui-stat-card">
                    <div className="min-w-0">
                      <p className="text-[10.5px] font-bold text-[#64748b] uppercase">পরবর্তী পোস্ট</p>
                      <p className="text-lg font-extrabold text-[#0f172a] ui-mono mt-0.5 truncate">
                        {formatCountdown(currentConfig.nextRunAt, currentConfig.enabled, nowMs)}
                      </p>
                      <p className="text-[10.5px] text-[#64748b] truncate mt-0.5">
                        শেষ: {formatDateTime(currentConfig.lastRunAt)}
                      </p>
                    </div>
                    <div className="ui-stat-ico" style={accentVars(ACCENTS.emerald)}>
                      <i className="ri-timer-flash-fill" />
                    </div>
                  </div>
                </div>

                {/* 4. Two-Column Balanced Workspace */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                  {/* Left: Telegram Preview */}
                  <div className="lg:col-span-5">
                    <TelegramPreview
                      products={state.products}
                      config={currentConfig}
                      senderName={senderDisplayName}
                    />
                  </div>

                  {/* Right: Recent Activity Logs Summary */}
                  <div className="lg:col-span-7">
                    <div className="ui-card mb-0">
                      <div className="ui-card-head">
                        <div className="flex items-center gap-2">
                          <span className="ui-drawer-ico" style={accentVars(ACCENTS.emerald)}>
                            <i className="ri-history-fill" />
                          </span>
                          <h3>সাম্প্রতিক পোস্ট হিস্ট্রি</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => selectTab('logs')}
                          className="ui-btn ui-btn-ghost"
                        >
                          সব হিস্ট্রি
                          <i className="ri-arrow-right-s-line" />
                        </button>
                      </div>

                      {state.logs.length === 0 ? (
                        <div className="ui-card-body py-10 text-center">
                          <p className="text-[12px] font-bold text-[#475569]">এখনো কোনো পোস্ট হিস্ট্রি নেই</p>
                          <p className="text-[11px] text-[#94a3b8] mt-1">
                            পোস্ট যোগ করে সিস্টেম স্টার্ট করলে প্রতিটি গ্রুপের ডেলিভারি রিপোর্ট এখানে দেখাবে।
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-[#f1f5f9]">
                          {state.logs.slice(0, 6).map((log) => (
                            <div
                              key={log.id}
                              className="px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-[12px]"
                            >
                              <div className="min-w-0">
                                <p className="font-bold text-[#0f172a] truncate">{log.productName}</p>
                                <p className="text-[11px] text-[#64748b] truncate">
                                  {log.groupTitle} · {formatDateTime(log.timestamp)}
                                </p>
                              </div>
                              {log.status === 'success' && (
                                <span className="ui-badge ui-badge-ok shrink-0">সফল</span>
                              )}
                              {log.status === 'error' && (
                                <span className="ui-badge ui-badge-err shrink-0">ব্যর্থ</span>
                              )}
                              {log.status === 'dry_run' && (
                                <span className="ui-badge ui-badge-info shrink-0">টেস্ট</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PRODUCTS / POSTS CATALOG */}
            {activeTab === 'products' && (
              <div className="space-y-3">
                <div className="ui-card">
                  <div className="ui-card-body flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { key: 'all', label: `সব (${state.products.length})`, theme: ACCENTS.blue },
                        { key: 'active', label: `সক্রিয় (${activeProductsCount})`, theme: ACCENTS.emerald },
                        {
                          key: 'paused',
                          label: `বন্ধ (${state.products.length - activeProductsCount})`,
                          theme: ACCENTS.amber,
                        },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          style={accentVars(tab.theme)}
                          onClick={() =>
                            setProductFilter(tab.key as 'all' | 'active' | 'paused')
                          }
                          className={`ui-chip ${productFilter === tab.key ? 'active' : ''}`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative w-full sm:w-64">
                        <i className="ri-search-line text-sm text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          placeholder="পোস্ট খুঁজুন..."
                          className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-[#cbd5e1] rounded-[8px] bg-white text-[#0f172a] focus:outline-none focus:border-[#2563eb] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingProduct(null);
                          setModalOpen(true);
                        }}
                        className="ui-btn ui-btn-primary shrink-0"
                      >
                        <i className="ri-add-line" />
                        <span>নতুন পোস্ট</span>
                      </button>
                    </div>
                  </div>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="ui-card">
                    <div className="ui-card-body py-12 text-center">
                      <div
                        className="ui-stat-ico mx-auto mb-3"
                        style={accentVars(ACCENTS.violet)}
                      >
                        <i className="ri-shopping-bag-3-line" />
                      </div>
                      <p className="text-[13.5px] font-extrabold text-[#0f172a]">কোনো পোস্ট পাওয়া যায়নি</p>
                      <p className="text-[11.5px] text-[#64748b] mt-1 mb-4">
                        ছবি, লেখা এবং লিংক যুক্ত করে প্রথম টেলিগ্রাম পোস্ট তৈরি করুন।
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProduct(null);
                          setModalOpen(true);
                        }}
                        className="ui-btn ui-btn-primary"
                      >
                        <i className="ri-add-line" />
                        প্রথম পোস্ট যোগ করুন
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredProducts.map((product) => {
                      const cover = product.images[0];
                      return (
                        <div key={product.id} className="ui-card flex flex-col mb-0">
                          {cover && !imgErrors[cover] ? (
                            <div className="aspect-[4/3] bg-[#f1f5f9] relative overflow-hidden border-b border-[#f1f5f9]">
                              <img
                                src={withBase(cover)}
                                alt={product.name}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setImgErrors((prev) => ({ ...prev, [cover]: true }))
                                }
                                className="w-full h-full object-cover"
                              />
                              {product.images.length > 1 && (
                                <span className="absolute bottom-2 right-2 bg-[#0f172a]/80 text-white text-[10.5px] font-bold px-2 py-0.5 rounded-[6px] tabular-nums flex items-center gap-1">
                                  <i className="ri-gallery-fill text-[11px]" />
                                  {product.images.length} ছবি
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="px-3.5 pt-3 flex items-center gap-1.5">
                              <span className="ui-badge ui-badge-info">
                                <i className="ri-file-text-line" />
                                টেক্সট পোস্ট
                              </span>
                            </div>
                          )}

                          <div className="ui-card-body flex-1 flex flex-col justify-between space-y-3">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-[#64748b] ui-mono">
                                  {product.postCount} বার পোস্ট
                                </span>
                                <span
                                  className={`ui-badge ${
                                    product.active ? 'ui-badge-ok' : 'ui-badge-neutral'
                                  }`}
                                >
                                  <i
                                    className={
                                      product.active
                                        ? 'ri-checkbox-circle-fill'
                                        : 'ri-pause-circle-fill'
                                    }
                                  />
                                  {product.active ? 'সক্রিয়' : 'বন্ধ'}
                                </span>
                              </div>

                              <p className="text-[12.5px] text-[#0f172a] whitespace-pre-line line-clamp-3 leading-relaxed">
                                {product.caption || product.name}
                              </p>

                              {product.link && product.link !== 'https://t.me/' && (
                                <p className="text-[11px] text-[#2563eb] truncate ui-mono flex items-center gap-1">
                                  <i className="ri-links-line shrink-0" />
                                  <span className="truncate">{product.link}</span>
                                </p>
                              )}
                            </div>

                            <div className="pt-2.5 border-t border-[#f1f5f9] flex items-center justify-between gap-1.5">
                              <button
                                type="button"
                                disabled={broadcastingNow}
                                onClick={() =>
                                  void handleBroadcastNow({
                                    productId: product.id,
                                    dryRun: !activeSenderConnected,
                                  })
                                }
                                className="ui-btn ui-btn-dark"
                              >
                                <i className="ri-play-fill" />
                                {activeSenderConnected ? 'এখনই পোস্ট' : 'টেস্ট পোস্ট'}
                              </button>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => void handleToggleProductActive(product)}
                                  className="ui-btn ui-btn-outline"
                                >
                                  {product.active ? 'পজ' : 'চালু'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingProduct(product);
                                    setModalOpen(true);
                                  }}
                                  className="ui-btn ui-btn-ghost px-2"
                                  aria-label="Edit post"
                                >
                                  <i className="ri-edit-line" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteProduct(product.id)}
                                  className="ui-btn ui-btn-danger px-2"
                                  aria-label="Delete post"
                                >
                                  <i className="ri-delete-bin-6-line" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TARGET TELEGRAM GROUPS */}
            {activeTab === 'groups' && (
              <div className="space-y-3">
                <div className="ui-card">
                  <div className="ui-card-body flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="ui-stat-ico"
                        style={accentVars(activeSenderConnected ? ACCENTS.emerald : ACCENTS.amber)}
                      >
                        <i className={activeSenderConnected ? 'ri-checkbox-circle-fill' : 'ri-telegram-fill'} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[13px] font-extrabold text-[#0f172a] truncate">
                            {activeSenderConnected ? senderDisplayName : 'টেলিগ্রাম অ্যাকাউন্ট কানেক্ট করা নেই'}
                          </h3>
                          <span
                            className={`ui-badge ${
                              activeSenderConnected ? 'ui-badge-ok' : 'ui-badge-warn'
                            }`}
                          >
                            {activeSenderConnected ? 'কানেক্টেড' : 'অফলাইন'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#64748b] mt-0.5">
                          নম্বর পরিবর্তন বা নতুন অ্যাকাউন্ট কানেক্ট করতে সেটিংস ট্যাব ব্যবহার করুন।
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => selectTab('settings')}
                      className="ui-btn ui-btn-outline shrink-0 self-start sm:self-center"
                    >
                      <i className="ri-settings-4-fill" style={{ color: '#2563eb' }} />
                      নাম্বার কানেক্ট / সেটিংস
                    </button>
                  </div>
                </div>

                <div className="ui-card">
                  <div className="ui-card-body flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                    <form
                      onSubmit={handleAddGroup}
                      className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5 flex-1"
                    >
                      <div className="ui-field flex-1 mb-0">
                        <label htmlFor="manual-chat-id">ম্যানুয়ালি গ্রুপ যোগ করুন (@username বা Chat ID)</label>
                        <input
                          id="manual-chat-id"
                          type="text"
                          value={newGroupChatId}
                          onChange={(e) => setNewGroupChatId(e.target.value)}
                          placeholder="@dhaka_buysell অথবা -1001234567890"
                          className="ui-mono"
                        />
                      </div>
                      <div className="ui-field sm:w-52 mb-0">
                        <label htmlFor="manual-group-title">গ্রুপের নাম (ঐচ্ছিক)</label>
                        <input
                          id="manual-group-title"
                          type="text"
                          value={newGroupTitle}
                          onChange={(e) => setNewGroupTitle(e.target.value)}
                          placeholder="Dhaka Buy Sell"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={addingGroup}
                        className="ui-btn ui-btn-primary py-2 shrink-0"
                      >
                        <i className="ri-add-line" />
                        {addingGroup ? 'যুক্ত হচ্ছে...' : 'গ্রুপ যোগ'}
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={() => void handleSyncGroups()}
                      disabled={syncingGroups}
                      className="ui-btn ui-btn-outline py-2 shrink-0"
                    >
                      <i className={`ri-refresh-line ${syncingGroups ? 'animate-spin' : ''}`} />
                      সব গ্রুপ রিফ্রেশ
                    </button>
                  </div>
                </div>

                <div className="ui-card">
                  {state.groups.length > 0 && (
                    <div className="ui-card-head">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="ui-drawer-ico" style={accentVars(ACCENTS.teal)}>
                          <i className="ri-group-fill" />
                        </span>
                        <div>
                          <h3>টার্গেট বাই-সেল গ্রুপ তালিকা</h3>
                          <p className="text-[11px] text-[#64748b] font-medium">
                            মোট <strong className="ui-mono text-[#0f172a]">{state.groups.length}</strong>টি · সক্রিয়{' '}
                            <strong className="ui-mono text-[#059669]">{enabledGroupsCount}</strong>টি
                          </p>
                        </div>
                      </div>
                      <div className="relative w-full sm:w-64">
                        <i className="ri-search-line text-sm text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={groupSearch}
                          onChange={(e) => setGroupSearch(e.target.value)}
                          placeholder="গ্রুপ খুঁজুন..."
                          className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-[#cbd5e1] rounded-[8px] bg-white text-[#0f172a] focus:outline-none focus:border-[#2563eb]"
                        />
                      </div>
                    </div>
                  )}

                  {filteredGroups.length === 0 ? (
                    <div className="ui-card-body py-12 text-center">
                      <div
                        className="ui-stat-ico mx-auto mb-3"
                        style={accentVars(ACCENTS.teal)}
                      >
                        <i className="ri-group-line" />
                      </div>
                      <p className="text-[13.5px] font-extrabold text-[#0f172a]">
                        কোনো বাই-সেল গ্রুপ পাওয়া যায়নি
                      </p>
                      <p className="text-[11.5px] text-[#64748b] mt-1 max-w-md mx-auto leading-relaxed">
                        উপরে আপনার টেলিগ্রাম নম্বর দিয়ে লগইন করলে আপনার জয়েন করা সব বাই-সেল গ্রুপ অটোমেটিক চলে আসবে, অথবা ম্যানুয়ালি{' '}
                        <code className="px-1 py-0.5 rounded bg-[#f1f5f9] text-[#0f172a]">@groupusername</code> যোগ করুন।
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[10.5px] font-extrabold text-[#475569] uppercase">
                            <th className="py-2.5 px-3.5">গ্রুপের নাম</th>
                            <th className="py-2.5 px-3.5">Chat ID</th>
                            <th className="py-2.5 px-3.5">ধরন</th>
                            <th className="py-2.5 px-3.5 text-right">মোট পোস্ট</th>
                            <th className="py-2.5 px-3.5">স্ট্যাটাস</th>
                            <th className="py-2.5 px-3.5 text-right">অ্যাকশন</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f1f5f9] text-[12px]">
                          {filteredGroups.map((grp) => (
                            <tr key={grp.id} className="hover:bg-[#f8fafc]">
                              <td className="py-2.5 px-3.5">
                                <p className="font-bold text-[#0f172a]">{grp.title}</p>
                                {grp.username && (
                                  <p className="text-[10.5px] text-[#64748b] ui-mono">@{grp.username}</p>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 ui-mono text-[#475569]">{grp.chatId}</td>
                              <td className="py-2.5 px-3.5 text-[#475569] capitalize">{grp.type}</td>
                              <td className="py-2.5 px-3.5 text-right ui-mono font-bold text-[#0f172a]">
                                {grp.postCount}
                              </td>
                              <td className="py-2.5 px-3.5">
                                {grp.lastError ? (
                                  <span className="ui-badge ui-badge-err" title={grp.lastError}>
                                    <i className="ri-close-circle-fill" />
                                    <span className="truncate max-w-[160px]">{grp.lastError}</span>
                                  </span>
                                ) : grp.enabled ? (
                                  <span className="ui-badge ui-badge-ok">
                                    <i className="ri-checkbox-circle-fill" />
                                    পোস্ট হবে
                                  </span>
                                ) : (
                                  <span className="ui-badge ui-badge-neutral">বন্ধ আছে</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleGroup(grp.id, !grp.enabled)}
                                    className={`ui-btn ${grp.enabled ? 'ui-btn-outline' : 'ui-btn-primary'}`}
                                  >
                                    {grp.enabled ? 'বন্ধ করুন' : 'চালু করুন'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteGroup(grp.id)}
                                    className="ui-btn ui-btn-danger px-2"
                                    aria-label="Remove group"
                                  >
                                    <i className="ri-delete-bin-6-line" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DELIVERY LOGS */}
            {activeTab === 'logs' && (
              <div className="space-y-3">
                <div className="ui-card">
                  <div className="ui-card-body flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { key: 'all', label: 'সব', theme: ACCENTS.blue },
                        { key: 'success', label: 'সফল', theme: ACCENTS.emerald },
                        { key: 'error', label: 'ব্যর্থ', theme: ACCENTS.rose },
                        { key: 'dry_run', label: 'টেস্ট', theme: ACCENTS.sky },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          style={accentVars(item.theme)}
                          onClick={() => setLogFilter(item.key as 'all' | PostLog['status'])}
                          className={`ui-chip ${logFilter === item.key ? 'active' : ''}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {state.logs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleClearLogs()}
                        className="ui-btn ui-btn-danger"
                      >
                        <i className="ri-delete-bin-6-line" />
                        হিস্ট্রি মুছে ফেলুন
                      </button>
                    )}
                  </div>
                </div>

                <div className="ui-card">
                  {filteredLogs.length === 0 ? (
                    <div className="ui-card-body py-12 text-center">
                      <div
                        className="ui-stat-ico mx-auto mb-3"
                        style={accentVars(ACCENTS.emerald)}
                      >
                        <i className="ri-history-line" />
                      </div>
                      <p className="text-[13.5px] font-extrabold text-[#0f172a]">কোনো পোস্ট হিস্ট্রি নেই</p>
                      <p className="text-[11.5px] text-[#64748b] mt-1">
                        শিডিউল বা ম্যানুয়াল পোস্ট চালানোর পর প্রতিটি গ্রুপের ডেলিভারি রিপোর্ট এখানে দেখা যাবে।
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[10.5px] font-extrabold text-[#475569] uppercase">
                            <th className="py-2.5 px-3.5">সময়</th>
                            <th className="py-2.5 px-3.5">পোস্ট</th>
                            <th className="py-2.5 px-3.5">গ্রুপ</th>
                            <th className="py-2.5 px-3.5">অবস্থা</th>
                            <th className="py-2.5 px-3.5">বিস্তারিত</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f1f5f9] text-[12px]">
                          {filteredLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-[#f8fafc]">
                              <td className="py-2.5 px-3.5 text-[#64748b] ui-mono whitespace-nowrap">
                                {formatDateTime(log.timestamp)}
                              </td>
                              <td className="py-2.5 px-3.5 font-bold text-[#0f172a]">
                                {log.productName}
                              </td>
                              <td className="py-2.5 px-3.5 text-[#1e293b]">{log.groupTitle}</td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                {log.status === 'success' && (
                                  <span className="ui-badge ui-badge-ok">
                                    <i className="ri-checkbox-circle-fill" />
                                    সফল
                                  </span>
                                )}
                                {log.status === 'error' && (
                                  <span className="ui-badge ui-badge-err">
                                    <i className="ri-close-circle-fill" />
                                    ব্যর্থ
                                  </span>
                                )}
                                {log.status === 'dry_run' && (
                                  <span className="ui-badge ui-badge-info">
                                    <i className="ri-flask-fill" />
                                    টেস্ট
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 text-[#475569]">
                                {log.message}
                                {log.telegramMessageId && (
                                  <span className="ml-2 ui-mono text-[10.5px] text-[#94a3b8]">
                                    #msg_{log.telegramMessageId}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SETTINGS (Number Connect + Auto-Post Scheduler + Website Password Change) */}
            {activeTab === 'settings' && (
              <SettingsView
                userbotStatus={state.userbotStatus}
                authToken={authToken}
                currentConfig={currentConfig}
                activeMode={activeMode}
                savingConfig={savingConfig}
                onDraftConfigChange={setDraftConfig}
                onSaveConfig={handleSaveConfig}
                onRefreshState={() => fetchState(false)}
                onNotify={pushToast}
                onOpenSetup={() => selectTab('setup')}
                onUnauthorized={handleUnauthorized}
                onPasswordUpdated={(newToken) => {
                  try {
                    localStorage.setItem(AUTH_TOKEN_KEY, newToken);
                  } catch {
                    // ignore storage errors
                  }
                  setAuthToken(newToken);
                }}
              />
            )}

            {/* SETUP GUIDE */}
            {activeTab === 'setup' && (
              <SetupGuideView
                botStatus={state.botStatus}
                onSync={handleSyncGroups}
                onOpenSettings={() => selectTab('settings')}
                syncing={syncingGroups}
              />
            )}
          </div>
        )}
      </main>

      {/* Floating Boxed-Icon Bottom Navigation Dock */}
      <nav className="ui-dock" aria-label="Bottom Navigation Dock">
        {DOCK_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              style={accentVars(item.theme)}
              className={`ui-dock-btn ${isActive ? 'active' : ''}`}
            >
              <span className="ui-dock-ico-box">
                <i className={item.iconClass} />
              </span>
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Add / Edit Post Modal */}
      {modalOpen && (
        <ProductModal
          initialProduct={editingProduct}
          onClose={() => {
            setModalOpen(false);
            setEditingProduct(null);
          }}
          onSave={handleSaveProduct}
        />
      )}

      {/* Toast Stack */}
      {toasts.length > 0 && (
        <div className="ui-toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className="ui-toast">
              {t.type === 'success' && (
                <i className="ri-checkbox-circle-fill text-sm text-[#10b981] shrink-0" />
              )}
              {t.type === 'error' && (
                <i className="ri-close-circle-fill text-sm text-[#fb7185] shrink-0" />
              )}
              {t.type === 'info' && (
                <i className="ri-information-fill text-sm text-[#60a5fa] shrink-0" />
              )}
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
