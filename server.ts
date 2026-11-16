import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { TelegramClient, Api, sessions, password as tgPassword } from 'telegram';
import type {
  AppStateResponse,
  BotInfo,
  BotStatus,
  PostLog,
  ProductItem,
  SchedulerConfig,
  TelegramGroup,
  UserbotStatus,
} from './src/types.ts';

interface StoreData {
  products: ProductItem[];
  groups: TelegramGroup[];
  config: SchedulerConfig;
  logs: PostLog[];
  updateOffset: number;
  userSessionString: string;
  authSecret: string;
  adminPasswordSalt?: string;
  adminPasswordHash?: string;
}

const rawPort = process.env.PORT?.trim();
const PORT: number | string = rawPort
  ? Number.isNaN(Number(rawPort))
    ? rawPort
    : Number(rawPort)
  : 3000;
const DATA_DIR = path.resolve('data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const GENERATED_IMAGES_DIR = path.resolve('src/assets/images');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function createDefaultStore(): StoreData {
  const now = new Date().toISOString();
  const nextRun = new Date(Date.now() + 150 * 60 * 1000).toISOString();

  return {
    products: [
      {
        id: 'prod_smartwatch_01',
        name: 'AMOLED Smart Watch Series 9',
        caption:
          '🔥 AMOLED Smart Watch Series 9 (Matte Black)\nদাম: ১,৮৫০ টাকা (অফার প্রাইস)\n\n• ব্লুটুথ কলিং ও ৭ দিন ব্যাটারি ব্যাকআপ\n• সারা দেশে ক্যাশ অন ডেলিভারি',
        link: 'https://t.me/',
        images: ['/src/assets/images/product_smartwatch_1794788785090.jpg'],
        active: true,
        postCount: 0,
        lastPostedAt: null,
        createdAt: now,
      },
      {
        id: 'prod_earbuds_02',
        name: 'ANC Pro Wireless Earbuds',
        caption:
          '🎧 ANC Pro Wireless Earbuds (Olive Sage)\nদাম: ১,২৯০ টাকা\n\n• ৩২ ঘণ্টা প্লে-টাইম + Type-C ফাস্ট চার্জিং\n• ৭ দিনের রিপ্লেসমেন্ট গ্যারান্টি',
        link: 'https://t.me/',
        images: ['/src/assets/images/product_earbuds_1794788785844.jpg'],
        active: true,
        postCount: 0,
        lastPostedAt: null,
        createdAt: now,
      },
      {
        id: 'prod_leather_03',
        name: 'হ্যান্ডক্রাফটেড লেদার মেসেঞ্জার ব্যাগ',
        caption:
          '💼 হ্যান্ডক্রাফটেড লেদার ক্রসবডি মেসেঞ্জার ব্যাগ\nদাম: ২,৬৫০ টাকা\n\n• ১০০% জেনুইন কাউ লেদার\n• ১১ ইঞ্চি ট্যাবলেট/আইপ্যাড ফিট হয়',
        link: 'https://t.me/',
        images: ['/src/assets/images/product_leather_bag_1794788785769.jpg'],
        active: true,
        postCount: 0,
        lastPostedAt: null,
        createdAt: now,
      },
    ],
    groups: [],
    config: {
      enabled: false,
      postingMode: 'userbot',
      intervalMinutes: 150,
      delayBetweenGroupsSec: 60,
      activeHoursEnabled: true,
      activeStartHour: 8,
      activeEndHour: 23,
      rotationMode: 'sequential',
      sellerContactUrl: 'https://t.me/',
      buttonText: 'অর্ডার করতে মেসেজ দিন',
      appendFooterTag: false,
      footerText: '',
      nextRunAt: nextRun,
      lastRunAt: null,
      rotationIndex: 0,
    },
    logs: [],
    updateOffset: 0,
    userSessionString: '',
    authSecret: crypto.randomBytes(32).toString('hex'),
  };
}

function loadStore(): StoreData {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      const defaults = createDefaultStore();
      return {
        products: Array.isArray(parsed.products) ? parsed.products : defaults.products,
        groups: Array.isArray(parsed.groups) ? parsed.groups : defaults.groups,
        config: { ...defaults.config, ...(parsed.config ?? {}) },
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
        updateOffset: typeof parsed.updateOffset === 'number' ? parsed.updateOffset : 0,
        userSessionString: typeof parsed.userSessionString === 'string' ? parsed.userSessionString : '',
        authSecret:
          typeof parsed.authSecret === 'string' && parsed.authSecret.length >= 16
            ? parsed.authSecret
            : defaults.authSecret,
        adminPasswordSalt:
          typeof parsed.adminPasswordSalt === 'string' ? parsed.adminPasswordSalt : undefined,
        adminPasswordHash:
          typeof parsed.adminPasswordHash === 'string' ? parsed.adminPasswordHash : undefined,
      };
    }
  } catch (err) {
    console.error('Failed to load store.json, recreating defaults:', err);
  }
  const initial = createDefaultStore();
  saveStore(initial);
  return initial;
}

function saveStore(data: StoreData): void {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

const store = loadStore();

function getApiCredentials(): { apiId: number; apiHash: string; configured: boolean } {
  const apiId = Number.parseInt(process.env.TELEGRAM_API_ID?.trim() ?? '', 10);
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() ?? '';
  const configured = Number.isFinite(apiId) && apiId > 0 && apiHash.length > 0;
  return { apiId: configured ? apiId : 0, apiHash, configured };
}

function getToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
}

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || 'shadin@111';
}

function hashPasswordWithSalt(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifySubmittedPassword(submitted: string): boolean {
  if (store.adminPasswordSalt && store.adminPasswordHash) {
    const derived = hashPasswordWithSalt(submitted, store.adminPasswordSalt);
    return crypto.timingSafeEqual(
      Buffer.from(derived, 'hex'),
      Buffer.from(store.adminPasswordHash, 'hex')
    );
  }
  const expected = getAdminPassword();
  const a = crypto.createHash('sha256').update(submitted).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function getSigningKey(): string {
  const passwordMaterial = store.adminPasswordHash ?? getAdminPassword();
  return crypto
    .createHmac('sha256', store.authSecret)
    .update(passwordMaterial)
    .digest('hex');
}

function createAuthToken(): string {
  const issuedAt = String(Date.now());
  const sig = crypto.createHmac('sha256', getSigningKey()).update(issuedAt).digest('hex');
  return `${issuedAt}.${sig}`;
}

function verifyAuthToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [issuedAt, providedSig] = parts;
  if (!/^\d+$/.test(issuedAt) || !/^[a-f0-9]{64}$/i.test(providedSig)) return false;
  const issuedMs = Number(issuedAt);
  // 30-day session expiry
  if (!Number.isFinite(issuedMs) || Date.now() - issuedMs > 30 * 24 * 60 * 60 * 1000) {
    return false;
  }
  const expectedSig = crypto.createHmac('sha256', getSigningKey()).update(issuedAt).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(providedSig, 'hex'), Buffer.from(expectedSig, 'hex'));
}

function extractBearerToken(req: express.Request): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return undefined;
}

let botStatus: BotStatus = {
  tokenConfigured: Boolean(getToken()),
  connected: false,
  botInfo: null,
  pollingActive: false,
  lastPollError: null,
};

let userbotStatus: UserbotStatus = {
  apiConfigured: getApiCredentials().configured,
  connected: false,
  authStep: 'idle',
  pendingPhone: null,
  user: null,
  lastError: null,
};

let userClient: TelegramClient | null = null;
let pendingUserAuth: {
  client: TelegramClient;
  phoneNumber: string;
  phoneCodeHash: string;
} | null = null;

let isBroadcasting = false;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isValidButtonUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'https://t.me/' || trimmed === 'http://t.me/') {
    return false;
  }
  return /^https?:\/\/.+/i.test(trimmed) || /^tg:\/\/.+/i.test(trimmed);
}

function resolvePostLink(product: ProductItem, config: SchedulerConfig): string {
  const postLink = product.link?.trim() ?? '';
  if (isValidButtonUrl(postLink)) {
    return postLink;
  }
  const globalLink = config.sellerContactUrl.trim();
  return isValidButtonUrl(globalLink) ? globalLink : '';
}

function buildTelegramCaption(
  product: ProductItem,
  config: SchedulerConfig,
  includeContactLinkInText: boolean
): string {
  const lines: string[] = [];
  const effectiveLink = resolvePostLink(product, config);

  if (product.caption.trim()) {
    lines.push(escapeHtml(product.caption.trim()));
  } else if (effectiveLink && !includeContactLinkInText) {
    lines.push(escapeHtml(effectiveLink));
  } else if (product.name.trim() && product.name.trim() !== 'টেলিগ্রাম পোস্ট') {
    lines.push(escapeHtml(product.name.trim()));
  }

  if (includeContactLinkInText && effectiveLink) {
    if (lines.length > 0) lines.push('');
    lines.push(`🔗 ${escapeHtml(effectiveLink)}`);
  }

  const fullCaption = lines.join('\n');
  return fullCaption.length > 1020 ? `${fullCaption.slice(0, 1017)}...` : fullCaption;
}

function saveBase64Images(images: string[]): string[] {
  return images.map((img) => {
    const match = img.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
    if (!match) {
      return img;
    }
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    const filename = `prod_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
    return `/uploads/${filename}`;
  });
}

function resolveLocalImagePath(imagePath: string): string | null {
  let fullPath: string | null = null;
  if (imagePath.startsWith('/uploads/')) {
    fullPath = path.join(UPLOADS_DIR, path.basename(imagePath));
  } else if (imagePath.startsWith('/src/assets/images/')) {
    fullPath = path.join(GENERATED_IMAGES_DIR, path.basename(imagePath));
  }
  if (!fullPath || !fs.existsSync(fullPath)) {
    return null;
  }
  return fullPath;
}

function resolveLocalImageFile(imagePath: string): { buffer: Buffer; filename: string; mime: string } | null {
  const fullPath = resolveLocalImagePath(imagePath);
  if (!fullPath) {
    return null;
  }
  const ext = path.extname(fullPath).toLowerCase();
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
      ? 'image/webp'
      : ext === '.gif'
      ? 'image/gif'
      : 'image/jpeg';

  return {
    buffer: fs.readFileSync(fullPath),
    filename: path.basename(fullPath),
    mime,
  };
}

function translateTelegramError(rawMsg: string): string {
  const floodMatch = rawMsg.match(/FLOOD_WAIT_(\d+)|wait of (\d+) seconds/i);
  if (floodMatch) {
    const sec = floodMatch[1] || floodMatch[2];
    return `টেলিগ্রাম সাময়িক বিরতি দিয়েছে: ${sec} সেকেন্ড পর চেষ্টা করুন`;
  }
  if (/CHAT_WRITE_FORBIDDEN|CHAT_SEND_MEDIA_FORBIDDEN|CHAT_SEND_PHOTOS_FORBIDDEN/i.test(rawMsg)) {
    return 'এই গ্রুপে আপনার অ্যাকাউন্টের ছবি/মেসেজ পাঠানোর অনুমতি নেই';
  }
  if (/USER_BANNED_IN_CHANNEL|CHANNEL_PRIVATE/i.test(rawMsg)) {
    return 'গ্রুপটি প্রাইভেট অথবা এই অ্যাকাউন্ট গ্রুপে ব্যান করা হয়েছে';
  }
  if (/PHONE_NUMBER_INVALID/i.test(rawMsg)) {
    return 'ফোন নম্বরটি সঠিক নয় (+880... ফরম্যাটে দিন)';
  }
  if (/PHONE_CODE_INVALID/i.test(rawMsg)) {
    return 'OTP কোডটি সঠিক নয়';
  }
  if (/PHONE_CODE_EXPIRED/i.test(rawMsg)) {
    return 'OTP কোডের মেয়াদ শেষ হয়ে গেছে — নতুন করে কোড পাঠান';
  }
  if (/PASSWORD_HASH_INVALID/i.test(rawMsg)) {
    return '২-স্টেপ ভেরিফিকেশন পাসওয়ার্ড সঠিক নয়';
  }
  return rawMsg;
}

// ---------- PERSONAL ACCOUNT (MTPROTO USERBOT) ----------

async function initUserbotClient(): Promise<void> {
  const { apiId, apiHash, configured } = getApiCredentials();
  userbotStatus.apiConfigured = configured;

  if (!configured || !store.userSessionString) {
    userbotStatus.connected = false;
    userbotStatus.authStep = 'idle';
    userbotStatus.user = null;
    return;
  }

  try {
    const client = new TelegramClient(
      new sessions.StringSession(store.userSessionString),
      apiId,
      apiHash,
      { connectionRetries: 5 }
    );
    await client.connect();
    const authorized = await client.checkAuthorization();
    if (!authorized) {
      userbotStatus.connected = false;
      userbotStatus.authStep = 'idle';
      userbotStatus.user = null;
      store.userSessionString = '';
      saveStore(store);
      return;
    }

    const me = (await client.getMe()) as Api.User;
    userClient = client;
    userbotStatus = {
      apiConfigured: true,
      connected: true,
      authStep: 'connected',
      pendingPhone: null,
      user: {
        id: String(me.id),
        firstName: me.firstName ?? 'Telegram User',
        lastName: me.lastName,
        username: me.username,
        phone: me.phone,
      },
      lastError: null,
    };
  } catch (err) {
    userbotStatus.connected = false;
    userbotStatus.authStep = 'idle';
    userbotStatus.lastError = err instanceof Error ? err.message : 'Userbot reconnect failed';
  }
}

async function syncUserbotDialogs(): Promise<number> {
  if (!userClient || !userbotStatus.connected) {
    throw new Error('আগে আপনার টেলিগ্রাম অ্যাকাউন্টে লগইন করুন');
  }

  const dialogs = await userClient.getDialogs({ limit: 150 });
  let addedOrUpdated = 0;

  for (const d of dialogs) {
    if (!d.isGroup && !d.isChannel) continue;

    // Skip read-only broadcast channels unless user is creator or has post rights
    const entity = d.entity;
    if (entity instanceof Api.Channel && entity.broadcast && !entity.creator && !entity.adminRights?.postMessages) {
      continue;
    }

    const chatIdStr = d.id ? d.id.toString() : '';
    if (!chatIdStr) continue;

    const title = d.title || d.name || `Group ${chatIdStr}`;
    const username =
      entity && 'username' in entity && typeof entity.username === 'string'
        ? entity.username
        : undefined;
    const type: TelegramGroup['type'] = d.isGroup
      ? entity instanceof Api.Channel
        ? 'supergroup'
        : 'group'
      : 'channel';

    const existing = store.groups.find((g) => g.chatId === chatIdStr);
    if (existing) {
      existing.title = title;
      existing.username = username ?? existing.username;
      existing.type = type;
      addedOrUpdated++;
    } else {
      store.groups.unshift({
        id: `grp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        chatId: chatIdStr,
        title,
        username,
        type,
        enabled: false, // Let merchant toggle on the exact buy-sell groups they want!
        postCount: 0,
        lastPostedAt: null,
        lastError: null,
        addedVia: 'userbot_sync',
        addedAt: new Date().toISOString(),
      });
      addedOrUpdated++;
    }
  }

  saveStore(store);
  return addedOrUpdated;
}

async function sendProductViaUserbot(
  product: ProductItem,
  group: TelegramGroup,
  config: SchedulerConfig,
  dryRun = false
): Promise<{ ok: boolean; messageId?: number; error?: string; dryRun?: boolean }> {
  if (dryRun) {
    return { ok: true, dryRun: true };
  }

  if (!userClient || !userbotStatus.connected) {
    return { ok: false, error: 'পার্সোনাল টেলিগ্রাম অ্যাকাউন্ট লগইন করা নেই' };
  }

  const caption = buildTelegramCaption(product, config, true);
  const resolvedFiles = product.images
    .filter(Boolean)
    .slice(0, 10)
    .map((img) => resolveLocalImagePath(img) ?? img);

  try {
    // Resolve entity cleanly (username first if public, otherwise numeric/string chatId)
    let target: string | number = group.username ? `@${group.username}` : group.chatId;
    try {
      await userClient.getEntity(target);
    } catch {
      // Warm entity cache via dialogs and retry
      await userClient.getDialogs({ limit: 100 });
      target = group.chatId;
    }

    if (resolvedFiles.length === 0) {
      const sentMsg = await userClient.sendMessage(target, {
        message: caption,
        parseMode: 'html',
      });
      return { ok: true, messageId: sentMsg.id };
    }

    const fileArg = resolvedFiles.length === 1 ? resolvedFiles[0] : resolvedFiles;
    const sentMsg = await userClient.sendFile(target, {
      file: fileArg,
      caption,
      parseMode: 'html',
    });

    const msgId = Array.isArray(sentMsg) ? sentMsg[0]?.id : sentMsg?.id;
    return { ok: true, messageId: msgId };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, error: translateTelegramError(raw) };
  }
}

// ---------- OFFICIAL BOT API ----------

async function telegramRequest<T>(
  method: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = getToken();
  if (!token) {
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN সেট করা নেই' };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  return data;
}

async function verifyBotToken(): Promise<void> {
  const token = getToken();
  botStatus.tokenConfigured = Boolean(token);

  if (!token) {
    botStatus.connected = false;
    botStatus.botInfo = null;
    botStatus.pollingActive = false;
    botStatus.lastPollError = null;
    return;
  }

  try {
    const res = await telegramRequest<BotInfo>('getMe');
    if (res.ok && res.result) {
      botStatus.connected = true;
      botStatus.botInfo = res.result;
      botStatus.lastPollError = null;
    } else {
      botStatus.connected = false;
      botStatus.botInfo = null;
      botStatus.lastPollError = res.description ?? 'Bot token verification failed';
    }
  } catch (err) {
    botStatus.connected = false;
    botStatus.lastPollError = err instanceof Error ? err.message : 'Network error connecting to Telegram';
  }
}

interface TelegramChatPayload {
  id: number;
  title?: string;
  username?: string;
  type: 'private' | 'group' | 'supergroup' | 'channel';
}

interface TelegramUpdatePayload {
  update_id: number;
  message?: {
    message_id: number;
    chat: TelegramChatPayload;
    text?: string;
  };
  my_chat_member?: {
    chat: TelegramChatPayload;
    new_chat_member?: {
      status: string;
    };
  };
}

function upsertGroupFromChat(
  chat: TelegramChatPayload,
  addedVia: 'auto' | 'manual' = 'auto'
): TelegramGroup | null {
  if (chat.type === 'private') {
    return null;
  }

  const chatIdStr = String(chat.id);
  const existing = store.groups.find((g) => g.chatId === chatIdStr);
  if (existing) {
    existing.title = chat.title ?? existing.title;
    existing.username = chat.username ?? existing.username;
    existing.type = chat.type;
    existing.lastError = null;
    saveStore(store);
    return existing;
  }

  const created: TelegramGroup = {
    id: `grp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    chatId: chatIdStr,
    title: chat.title ?? (chat.username ? `@${chat.username}` : `Group ${chatIdStr}`),
    username: chat.username,
    type: chat.type,
    enabled: true,
    postCount: 0,
    lastPostedAt: null,
    lastError: null,
    addedVia,
    addedAt: new Date().toISOString(),
  };
  store.groups.unshift(created);
  saveStore(store);
  return created;
}

async function pollTelegramUpdates(): Promise<void> {
  const token = getToken();
  if (!token) {
    botStatus.pollingActive = false;
    return;
  }

  try {
    botStatus.pollingActive = true;
    const res = await telegramRequest<TelegramUpdatePayload[]>('getUpdates', {
      offset: store.updateOffset,
      limit: 50,
      timeout: 0,
      allowed_updates: ['message', 'my_chat_member'],
    });

    if (!res.ok) {
      botStatus.lastPollError = res.description ?? 'Failed to poll updates';
      return;
    }

    botStatus.connected = true;
    botStatus.lastPollError = null;
    const updates = res.result ?? [];

    for (const upd of updates) {
      store.updateOffset = Math.max(store.updateOffset, upd.update_id + 1);

      if (upd.my_chat_member) {
        const { chat, new_chat_member } = upd.my_chat_member;
        const memberStatus = new_chat_member?.status ?? '';
        if (chat.type !== 'private') {
          if (memberStatus === 'member' || memberStatus === 'administrator') {
            upsertGroupFromChat(chat, 'auto');
          } else if (memberStatus === 'left' || memberStatus === 'kicked') {
            const existing = store.groups.find((g) => g.chatId === String(chat.id));
            if (existing) {
              existing.enabled = false;
              existing.lastError = 'বটটি গ্রুপ থেকে রিমুভ করা হয়েছে';
              saveStore(store);
            }
          }
        }
      }

      if (upd.message) {
        const msg = upd.message;
        const text = (msg.text ?? '').trim();

        if (msg.chat.type !== 'private') {
          upsertGroupFromChat(msg.chat, 'auto');
        }

        if (text.startsWith('/start') && msg.chat.type === 'private') {
          await telegramRequest('sendMessage', {
            chat_id: msg.chat.id,
            text:
              '👋 আসসালামু আলাইকুম! আমি BazarBot।\n\n' +
              'আপনার নিজের গ্রুপে বট দিয়ে অটো-পোস্ট করতে:\n' +
              '১. আমাকে আপনার গ্রুপে অ্যাড করুন।\n' +
              '২. গ্রুপে /groupid লিখে পাঠান।',
          });
        } else if (text.startsWith('/groupid') || text.startsWith('/id')) {
          if (msg.chat.type !== 'private') {
            const grp = upsertGroupFromChat(msg.chat, 'auto');
            await telegramRequest('sendMessage', {
              chat_id: msg.chat.id,
              text: `✅ গ্রুপ যুক্ত হয়েছে!\nনাম: ${grp?.title ?? msg.chat.title ?? 'Group'}\nChat ID: ${msg.chat.id}`,
            });
          } else {
            await telegramRequest('sendMessage', {
              chat_id: msg.chat.id,
              text: `ℹ️ এই কমান্ডটি গ্রুপের ভেতরে পাঠান। আপনার পার্সোনাল Chat ID: ${msg.chat.id}`,
            });
          }
        }
      }
    }

    if (updates.length > 0) {
      saveStore(store);
    }
  } catch (err) {
    botStatus.lastPollError = err instanceof Error ? err.message : 'Polling error';
  }
}

async function sendProductToGroup(
  product: ProductItem,
  group: TelegramGroup,
  config: SchedulerConfig,
  dryRun = false
): Promise<{ ok: boolean; messageId?: number; error?: string; dryRun?: boolean }> {
  const caption = buildTelegramCaption(product, config, false);

  if (dryRun) {
    return { ok: true, dryRun: true };
  }

  const token = getToken();
  if (!token) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN সেট করা নেই' };
  }

  const images = product.images.filter(Boolean).slice(0, 10);
  const effectiveLink = resolvePostLink(product, config);
  const replyMarkup = effectiveLink
    ? {
        inline_keyboard: [
          [{ text: config.buttonText.trim() || 'অর্ডার করুন', url: effectiveLink }],
        ],
      }
    : undefined;

  try {
    if (images.length === 0) {
      const res = await telegramRequest<{ message_id: number }>('sendMessage', {
        chat_id: group.chatId,
        text: caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
      return res.ok
        ? { ok: true, messageId: res.result?.message_id }
        : { ok: false, error: res.description ?? 'Failed to send message' };
    }

    if (images.length === 1) {
      const img = images[0];
      const localFile = resolveLocalImageFile(img);

      if (localFile) {
        const form = new FormData();
        form.append('chat_id', group.chatId);
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
        if (replyMarkup) {
          form.append('reply_markup', JSON.stringify(replyMarkup));
        }
        const blob = new Blob([new Uint8Array(localFile.buffer)], { type: localFile.mime });
        form.append('photo', blob, localFile.filename);

        const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          body: form,
        });
        const data = (await response.json()) as {
          ok: boolean;
          result?: { message_id: number };
          description?: string;
        };
        return data.ok
          ? { ok: true, messageId: data.result?.message_id }
          : { ok: false, error: data.description ?? 'sendPhoto failed' };
      }

      const res = await telegramRequest<{ message_id: number }>('sendPhoto', {
        chat_id: group.chatId,
        photo: img,
        caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
      return res.ok
        ? { ok: true, messageId: res.result?.message_id }
        : { ok: false, error: res.description ?? 'sendPhoto failed' };
    }

    const form = new FormData();
    form.append('chat_id', group.chatId);
    const mediaPayload: Array<{
      type: 'photo';
      media: string;
      caption?: string;
      parse_mode?: string;
    }> = [];

    images.forEach((img, idx) => {
      const localFile = resolveLocalImageFile(img);
      const attachKey = `photo_${idx}`;
      if (localFile) {
        const blob = new Blob([new Uint8Array(localFile.buffer)], { type: localFile.mime });
        form.append(attachKey, blob, localFile.filename);
      }

      mediaPayload.push({
        type: 'photo',
        media: localFile ? `attach://${attachKey}` : img,
        ...(idx === 0 ? { caption, parse_mode: 'HTML' } : {}),
      });
    });

    form.append('media', JSON.stringify(mediaPayload));

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
      method: 'POST',
      body: form,
    });
    const data = (await response.json()) as {
      ok: boolean;
      result?: Array<{ message_id: number }>;
      description?: string;
    };

    return data.ok
      ? { ok: true, messageId: data.result?.[0]?.message_id }
      : { ok: false, error: data.description ?? 'sendMediaGroup failed' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown Telegram API error',
    };
  }
}

// ---------- BROADCAST & SCHEDULER ----------

function addLog(entry: Omit<PostLog, 'id' | 'timestamp'>): void {
  store.logs.unshift({
    id: `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (store.logs.length > 200) {
    store.logs = store.logs.slice(0, 200);
  }
}

function selectProductsForRound(specificProductId?: string): ProductItem[] {
  if (specificProductId) {
    const found = store.products.find((p) => p.id === specificProductId);
    return found ? [found] : [];
  }

  const activeProducts = store.products.filter((p) => p.active);
  if (activeProducts.length === 0) {
    return [];
  }

  if (store.config.rotationMode === 'all_active') {
    return activeProducts;
  }

  if (store.config.rotationMode === 'random') {
    const idx = Math.floor(Math.random() * activeProducts.length);
    return [activeProducts[idx]];
  }

  const idx = store.config.rotationIndex % activeProducts.length;
  store.config.rotationIndex = (idx + 1) % activeProducts.length;
  return [activeProducts[idx]];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeBroadcastRound(options?: {
  productId?: string;
  groupId?: string;
  dryRun?: boolean;
  isScheduled?: boolean;
}): Promise<{ sent: number; failed: number; dryRunCount: number; error?: string }> {
  if (isBroadcasting) {
    return { sent: 0, failed: 0, dryRunCount: 0, error: 'একটি ব্রডকাস্ট ইতোমধ্যে চলছে' };
  }

  const targetGroups = options?.groupId
    ? store.groups.filter((g) => g.id === options.groupId)
    : store.groups.filter((g) => g.enabled);

  if (targetGroups.length === 0) {
    return {
      sent: 0,
      failed: 0,
      dryRunCount: 0,
      error: 'কোনো সক্রিয় টেলিগ্রাম গ্রুপ অন করা নেই। টেলিগ্রাম গ্রুপ ট্যাব থেকে যেসব গ্রুপে পোস্ট করতে চান তা চালু করুন।',
    };
  }

  const chosenProducts = selectProductsForRound(options?.productId);
  if (chosenProducts.length === 0) {
    return { sent: 0, failed: 0, dryRunCount: 0, error: 'কোনো সক্রিয় প্রোডাক্ট পাওয়া যায়নি' };
  }

  const dryRun = Boolean(options?.dryRun);
  const mode = store.config.postingMode;

  if (!dryRun) {
    if (mode === 'userbot' && (!userClient || !userbotStatus.connected)) {
      return {
        sent: 0,
        failed: 0,
        dryRunCount: 0,
        error: 'পার্সোনাল টেলিগ্রাম অ্যাকাউন্ট লগইন করা নেই। আগে টেলিগ্রাম অ্যাকাউন্ট কানেক্ট করুন।',
      };
    }
    if (mode === 'bot' && !getToken()) {
      return {
        sent: 0,
        failed: 0,
        dryRunCount: 0,
        error: 'TELEGRAM_BOT_TOKEN সেট করা নেই। পার্সোনাল অ্যাকাউন্ট মোড ব্যবহার করুন অথবা টোকেন সেট করুন।',
      };
    }
  }

  isBroadcasting = true;
  let sent = 0;
  let failed = 0;
  let dryRunCount = 0;

  try {
    const delayMs = Math.max(1, store.config.delayBetweenGroupsSec) * 1000;

    for (let pIdx = 0; pIdx < chosenProducts.length; pIdx++) {
      const product = chosenProducts[pIdx];

      for (let gIdx = 0; gIdx < targetGroups.length; gIdx++) {
        const group = targetGroups[gIdx];
        const result =
          mode === 'userbot'
            ? await sendProductViaUserbot(product, group, store.config, dryRun)
            : await sendProductToGroup(product, group, store.config, dryRun);

        const nowIso = new Date().toISOString();
        if (result.ok) {
          if (result.dryRun) {
            dryRunCount++;
            addLog({
              productId: product.id,
              productName: product.name,
              groupId: group.id,
              groupTitle: group.title,
              status: 'dry_run',
              message: 'টেস্ট সিমুলেশন সম্পন্ন (বাস্তব টেলিগ্রাম মেসেজ পাঠানো হয়নি)',
            });
          } else {
            sent++;
            product.postCount += 1;
            product.lastPostedAt = nowIso;
            group.postCount += 1;
            group.lastPostedAt = nowIso;
            group.lastError = null;
            addLog({
              productId: product.id,
              productName: product.name,
              groupId: group.id,
              groupTitle: group.title,
              status: 'success',
              message:
                mode === 'userbot'
                  ? 'পার্সোনাল অ্যাকাউন্ট থেকে সফলভাবে পোস্ট হয়েছে'
                  : 'বটের মাধ্যমে সফলভাবে পোস্ট হয়েছে',
              telegramMessageId: result.messageId,
            });
          }
        } else {
          failed++;
          group.lastError = result.error ?? 'Unknown error';
          addLog({
            productId: product.id,
            productName: product.name,
            groupId: group.id,
            groupTitle: group.title,
            status: 'error',
            message: result.error ?? 'পোস্ট ব্যর্থ হয়েছে',
          });
        }

        saveStore(store);

        const hasMore = gIdx < targetGroups.length - 1 || pIdx < chosenProducts.length - 1;
        if (hasMore && !dryRun) {
          // Add slight +/-2s natural jitter in userbot mode
          const jitter = mode === 'userbot' ? Math.floor(Math.random() * 3000) : 0;
          await sleep(delayMs + jitter);
        }
      }
    }

    const now = Date.now();
    store.config.lastRunAt = new Date(now).toISOString();
    if (store.config.enabled || options?.isScheduled) {
      store.config.nextRunAt = new Date(now + store.config.intervalMinutes * 60 * 1000).toISOString();
    }
    saveStore(store);
    return { sent, failed, dryRunCount };
  } finally {
    isBroadcasting = false;
  }
}

function getDhakaHour(): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: 'numeric',
    hour12: false,
  });
  const hourStr = formatter.format(new Date());
  const parsed = Number.parseInt(hourStr, 10);
  return Number.isNaN(parsed) ? new Date().getHours() : parsed % 24;
}

function isWithinActiveHours(config: SchedulerConfig): boolean {
  if (!config.activeHoursEnabled) {
    return true;
  }
  const hour = getDhakaHour();
  if (config.activeStartHour <= config.activeEndHour) {
    return hour >= config.activeStartHour && hour <= config.activeEndHour;
  }
  return hour >= config.activeStartHour || hour <= config.activeEndHour;
}

async function schedulerTick(): Promise<void> {
  if (!store.config.enabled || isBroadcasting) {
    return;
  }
  if (store.config.postingMode === 'userbot' && (!userClient || !userbotStatus.connected)) {
    return;
  }
  if (store.config.postingMode === 'bot' && !getToken()) {
    return;
  }

  const now = Date.now();
  const nextRunMs = store.config.nextRunAt ? Date.parse(store.config.nextRunAt) : 0;

  if (!nextRunMs) {
    store.config.nextRunAt = new Date(now + store.config.intervalMinutes * 60 * 1000).toISOString();
    saveStore(store);
    return;
  }

  if (now >= nextRunMs) {
    if (!isWithinActiveHours(store.config)) {
      store.config.nextRunAt = new Date(now + 15 * 60 * 1000).toISOString();
      saveStore(store);
      return;
    }

    await executeBroadcastRound({ isScheduled: true });
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/src/assets/images', express.static(GENERATED_IMAGES_DIR));

  // ---------- WEBSITE ADMIN AUTH ENDPOINTS ----------

  app.get('/api/auth/status', (req, res) => {
    const token = extractBearerToken(req);
    res.json({ authenticated: verifyAuthToken(token) });
  });

  app.post('/api/auth/login', (req, res) => {
    const submitted = String((req.body as { password?: string }).password ?? '');
    if (!verifySubmittedPassword(submitted)) {
      res.status(401).json({ error: 'পাসওয়ার্ড ভুল হয়েছে। আবার চেষ্টা করুন।' });
      return;
    }
    res.json({ ok: true, token: createAuthToken() });
  });

  app.post('/api/auth/change-password', (req, res) => {
    const token = extractBearerToken(req);
    if (!verifyAuthToken(token)) {
      res.status(401).json({ error: 'অনুমোদিত নয় — আগে লগইন করুন' });
      return;
    }
    const body = req.body as { currentPassword?: string; newPassword?: string };
    const currentPwd = String(body.currentPassword ?? '');
    const newPwd = String(body.newPassword ?? '').trim();
    if (!verifySubmittedPassword(currentPwd)) {
      res.status(400).json({ error: 'বর্তমান পাসওয়ার্ড সঠিক নয়' });
      return;
    }
    if (newPwd.length < 4) {
      res.status(400).json({ error: 'নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে' });
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    store.adminPasswordSalt = salt;
    store.adminPasswordHash = hashPasswordWithSalt(newPwd, salt);
    saveStore(store);
    res.json({ ok: true, token: createAuthToken() });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ ok: true });
  });

  // Protect all dashboard APIs except auth, health, and cron/tick
  app.use('/api', (req, res, next) => {
    if (
      req.path === '/health' ||
      req.path === '/cron/tick' ||
      req.path.startsWith('/auth/')
    ) {
      next();
      return;
    }
    const token = extractBearerToken(req);
    if (!verifyAuthToken(token)) {
      res.status(401).json({ error: 'অনুমোদিত নয় — আগে ওয়েবসাইট পাসওয়ার্ড দিয়ে লগইন করুন' });
      return;
    }
    next();
  });

  app.get('/api/state', (_req, res) => {
    userbotStatus.apiConfigured = getApiCredentials().configured;
    botStatus.tokenConfigured = Boolean(getToken());
    const payload: AppStateResponse = {
      botStatus,
      userbotStatus,
      products: store.products,
      groups: store.groups,
      config: store.config,
      logs: store.logs,
      isBroadcasting,
    };
    res.json(payload);
  });

  // ---------- USERBOT AUTH ENDPOINTS ----------

  app.post('/api/userbot/send-code', async (req, res) => {
    const { apiId, apiHash, configured } = getApiCredentials();
    if (!configured) {
      res.status(400).json({
        error:
          'TELEGRAM_API_ID এবং TELEGRAM_API_HASH সেট করা নেই। আগে AI Studio Secrets-এ এগুলো যোগ করুন।',
      });
      return;
    }

    const phone = String((req.body as { phoneNumber?: string }).phoneNumber ?? '')
      .replace(/[\s()-]/g, '')
      .trim();
    if (!/^\+\d{8,16}$/.test(phone)) {
      res.status(400).json({ error: 'সঠিক ফোন নম্বর দিন (যেমন: +8801712345678)' });
      return;
    }

    try {
      if (pendingUserAuth) {
        try {
          await pendingUserAuth.client.disconnect();
        } catch {
          // ignore disconnect errors
        }
        pendingUserAuth = null;
      }

      const client = new TelegramClient(new sessions.StringSession(''), apiId, apiHash, {
        connectionRetries: 5,
      });
      await client.connect();
      const codeResult = await client.sendCode({ apiId, apiHash }, phone);

      pendingUserAuth = {
        client,
        phoneNumber: phone,
        phoneCodeHash: codeResult.phoneCodeHash,
      };
      userbotStatus = {
        ...userbotStatus,
        apiConfigured: true,
        authStep: 'code_sent',
        pendingPhone: phone,
        lastError: null,
      };

      res.json({ step: 'code_sent', isCodeViaApp: codeResult.isCodeViaApp });
    } catch (err) {
      const msg = translateTelegramError(err instanceof Error ? err.message : String(err));
      userbotStatus.lastError = msg;
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/userbot/verify-code', async (req, res) => {
    if (!pendingUserAuth) {
      res.status(400).json({ error: 'কোনো চলমান লগইন সেশন নেই। আবার ফোন নম্বর দিন।' });
      return;
    }

    const code = String((req.body as { code?: string }).code ?? '').trim();
    if (!code) {
      res.status(400).json({ error: 'টেলিগ্রাম থেকে পাওয়া OTP কোডটি লিখুন' });
      return;
    }

    const { client, phoneNumber, phoneCodeHash } = pendingUserAuth;
    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber,
          phoneCodeHash,
          phoneCode: code,
        })
      );

      store.userSessionString = String(client.session.save());
      saveStore(store);

      const me = (await client.getMe()) as Api.User;
      userClient = client;
      pendingUserAuth = null;

      userbotStatus = {
        apiConfigured: true,
        connected: true,
        authStep: 'connected',
        pendingPhone: null,
        user: {
          id: String(me.id),
          firstName: me.firstName ?? 'Telegram User',
          lastName: me.lastName,
          username: me.username,
          phone: me.phone,
        },
        lastError: null,
      };

      const synced = await syncUserbotDialogs();
      res.json({ step: 'connected', user: userbotStatus.user, syncedGroups: synced });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (/SESSION_PASSWORD_NEEDED/i.test(raw)) {
        userbotStatus.authStep = 'password_required';
        userbotStatus.lastError = null;
        res.json({ step: 'password_required' });
        return;
      }
      const msg = translateTelegramError(raw);
      userbotStatus.lastError = msg;
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/userbot/verify-password', async (req, res) => {
    if (!pendingUserAuth) {
      res.status(400).json({ error: 'কোনো চলমান লগইন সেশন নেই। আবার শুরু করুন।' });
      return;
    }

    const pwd = String((req.body as { password?: string }).password ?? '');
    if (!pwd) {
      res.status(400).json({ error: 'আপনার ২-স্টেপ ভেরিফিকেশন পাসওয়ার্ড লিখুন' });
      return;
    }

    const { client } = pendingUserAuth;
    try {
      const passwordInfo = await client.invoke(new Api.account.GetPassword());
      const passwordSrp = await tgPassword.computeCheck(passwordInfo, pwd);
      await client.invoke(new Api.auth.CheckPassword({ password: passwordSrp }));

      store.userSessionString = String(client.session.save());
      saveStore(store);

      const me = (await client.getMe()) as Api.User;
      userClient = client;
      pendingUserAuth = null;

      userbotStatus = {
        apiConfigured: true,
        connected: true,
        authStep: 'connected',
        pendingPhone: null,
        user: {
          id: String(me.id),
          firstName: me.firstName ?? 'Telegram User',
          lastName: me.lastName,
          username: me.username,
          phone: me.phone,
        },
        lastError: null,
      };

      const synced = await syncUserbotDialogs();
      res.json({ step: 'connected', user: userbotStatus.user, syncedGroups: synced });
    } catch (err) {
      const msg = translateTelegramError(err instanceof Error ? err.message : String(err));
      userbotStatus.lastError = msg;
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/userbot/sync-dialogs', async (_req, res) => {
    try {
      const count = await syncUserbotDialogs();
      res.json({ syncedCount: count, groups: store.groups });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'গ্রুপ লোড করা যায়নি' });
    }
  });

  app.post('/api/userbot/logout', async (_req, res) => {
    try {
      if (userClient) {
        await userClient.disconnect();
      }
      if (pendingUserAuth) {
        await pendingUserAuth.client.disconnect();
      }
    } catch {
      // ignore disconnect errors
    }
    userClient = null;
    pendingUserAuth = null;
    store.userSessionString = '';
    saveStore(store);
    userbotStatus = {
      apiConfigured: getApiCredentials().configured,
      connected: false,
      authStep: 'idle',
      pendingPhone: null,
      user: null,
      lastError: null,
    };
    res.json({ ok: true });
  });

  // ---------- PRODUCT ENDPOINTS ----------

  app.post('/api/products', (req, res) => {
    const body = req.body as Partial<ProductItem>;
    const caption = body.caption?.trim() || '';
    const link = body.link?.trim() || '';
    const rawImages = Array.isArray(body.images) ? body.images.filter(Boolean) : [];
    if (!caption && !link && rawImages.length === 0) {
      res.status(400).json({ error: 'পোস্টের লেখা, লিংক অথবা ছবি — অন্তত একটি দিন' });
      return;
    }

    const firstLine =
      caption.split('\n').find((l) => l.trim().length > 0)?.trim() ||
      link ||
      'টেলিগ্রাম পোস্ট';
    const derivedName = body.name?.trim() || (firstLine.length > 52 ? `${firstLine.slice(0, 52)}...` : firstLine);
    const savedImages = saveBase64Images(rawImages);
    const created: ProductItem = {
      id: `prod_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      name: derivedName,
      caption,
      link: link || undefined,
      images: savedImages,
      active: body.active !== undefined ? Boolean(body.active) : true,
      postCount: 0,
      lastPostedAt: null,
      createdAt: new Date().toISOString(),
    };

    store.products.unshift(created);
    saveStore(store);
    res.status(201).json(created);
  });

  app.put('/api/products/:id', (req, res) => {
    const idx = store.products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'পোস্ট পাওয়া যায়নি' });
      return;
    }

    const body = req.body as Partial<ProductItem>;
    const existing = store.products[idx];
    const savedImages = Array.isArray(body.images) ? saveBase64Images(body.images) : existing.images;
    const nextCaption = body.caption !== undefined ? body.caption.trim() : existing.caption;
    const firstLine = nextCaption.split('\n').find((l) => l.trim().length > 0)?.trim() ?? existing.name;
    const nextName =
      body.name !== undefined
        ? body.name.trim() || (firstLine.length > 52 ? `${firstLine.slice(0, 52)}...` : firstLine)
        : body.caption !== undefined
        ? firstLine.length > 52
          ? `${firstLine.slice(0, 52)}...`
          : firstLine
        : existing.name;

    const updated: ProductItem = {
      ...existing,
      name: nextName,
      caption: nextCaption,
      link: body.link !== undefined ? body.link.trim() || undefined : existing.link,
      images: savedImages,
      active: body.active !== undefined ? Boolean(body.active) : existing.active,
    };

    store.products[idx] = updated;
    saveStore(store);
    res.json(updated);
  });

  app.delete('/api/products/:id', (req, res) => {
    const before = store.products.length;
    store.products = store.products.filter((p) => p.id !== req.params.id);
    if (store.products.length === before) {
      res.status(404).json({ error: 'প্রোডাক্ট পাওয়া যায়নি' });
      return;
    }
    saveStore(store);
    res.json({ ok: true });
  });

  // ---------- GROUP ENDPOINTS ----------

  app.post('/api/groups', async (req, res) => {
    const body = req.body as { chatId?: string; title?: string };
    const rawChatId = body.chatId?.trim();
    if (!rawChatId) {
      res.status(400).json({ error: 'গ্রুপের Chat ID বা @username লিখুন' });
      return;
    }

    let resolvedChatId = rawChatId;
    let resolvedTitle = body.title?.trim() || rawChatId;
    let resolvedUsername: string | undefined = rawChatId.startsWith('@')
      ? rawChatId.slice(1)
      : undefined;
    let resolvedType: TelegramGroup['type'] = 'supergroup';
    let lastError: string | null = null;

    if (userClient && userbotStatus.connected) {
      try {
        const entity = await userClient.getEntity(rawChatId);
        if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
          resolvedChatId = entity instanceof Api.Channel ? `-100${entity.id}` : `-${entity.id}`;
          resolvedTitle = entity.title || resolvedTitle;
          if (entity instanceof Api.Channel) {
            resolvedUsername = entity.username ?? resolvedUsername;
            resolvedType = entity.megagroup ? 'supergroup' : 'channel';
          } else {
            resolvedType = 'group';
          }
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : null;
      }
    } else if (getToken()) {
      const chatRes = await telegramRequest<TelegramChatPayload>('getChat', {
        chat_id: rawChatId,
      });
      if (chatRes.ok && chatRes.result) {
        resolvedChatId = String(chatRes.result.id);
        resolvedTitle = chatRes.result.title || body.title?.trim() || resolvedChatId;
        resolvedUsername = chatRes.result.username;
        if (chatRes.result.type !== 'private') {
          resolvedType = chatRes.result.type;
        }
      } else {
        lastError = chatRes.description ?? null;
      }
    }

    const existing = store.groups.find((g) => g.chatId === resolvedChatId);
    if (existing) {
      existing.title = resolvedTitle;
      existing.username = resolvedUsername ?? existing.username;
      existing.type = resolvedType;
      existing.lastError = lastError;
      saveStore(store);
      res.json(existing);
      return;
    }

    const created: TelegramGroup = {
      id: `grp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      chatId: resolvedChatId,
      title: resolvedTitle,
      username: resolvedUsername,
      type: resolvedType,
      enabled: true,
      postCount: 0,
      lastPostedAt: null,
      lastError,
      addedVia: 'manual',
      addedAt: new Date().toISOString(),
    };

    store.groups.unshift(created);
    saveStore(store);
    res.status(201).json(created);
  });

  app.put('/api/groups/:id', (req, res) => {
    const group = store.groups.find((g) => g.id === req.params.id);
    if (!group) {
      res.status(404).json({ error: 'গ্রুপ পাওয়া যায়নি' });
      return;
    }
    const body = req.body as Partial<TelegramGroup>;
    if (body.enabled !== undefined) group.enabled = Boolean(body.enabled);
    if (body.title !== undefined) group.title = body.title.trim() || group.title;
    saveStore(store);
    res.json(group);
  });

  app.delete('/api/groups/:id', (req, res) => {
    store.groups = store.groups.filter((g) => g.id !== req.params.id);
    saveStore(store);
    res.json({ ok: true });
  });

  app.post('/api/groups/sync', async (_req, res) => {
    await verifyBotToken();
    await pollTelegramUpdates();
    if (userClient && userbotStatus.connected) {
      await syncUserbotDialogs();
    }
    res.json({
      botStatus,
      userbotStatus,
      groups: store.groups,
    });
  });

  // ---------- CONFIG & BROADCAST ----------

  app.put('/api/config', (req, res) => {
    const body = req.body as Partial<SchedulerConfig>;
    const prevEnabled = store.config.enabled;
    const prevInterval = store.config.intervalMinutes;

    store.config = {
      ...store.config,
      ...body,
      postingMode: body.postingMode === 'bot' ? 'bot' : body.postingMode === 'userbot' ? 'userbot' : store.config.postingMode,
      intervalMinutes: Math.max(5, Number(body.intervalMinutes ?? store.config.intervalMinutes) || 150),
      delayBetweenGroupsSec: Math.max(
        1,
        Math.min(180, Number(body.delayBetweenGroupsSec ?? store.config.delayBetweenGroupsSec) || 15)
      ),
      activeStartHour: Math.max(0, Math.min(23, Number(body.activeStartHour ?? store.config.activeStartHour))),
      activeEndHour: Math.max(0, Math.min(23, Number(body.activeEndHour ?? store.config.activeEndHour))),
    };

    if (
      (!prevEnabled && store.config.enabled) ||
      prevInterval !== store.config.intervalMinutes ||
      !store.config.nextRunAt
    ) {
      store.config.nextRunAt = new Date(
        Date.now() + store.config.intervalMinutes * 60 * 1000
      ).toISOString();
    }

    saveStore(store);
    res.json(store.config);
  });

  app.post('/api/broadcast/now', async (req, res) => {
    const body = (req.body ?? {}) as { productId?: string; groupId?: string; dryRun?: boolean };
    const result = await executeBroadcastRound({
      productId: body.productId,
      groupId: body.groupId,
      dryRun: body.dryRun,
    });

    if (result.error) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  });

  app.delete('/api/logs', (_req, res) => {
    store.logs = [];
    saveStore(store);
    res.json({ ok: true });
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      schedulerEnabled: store.config.enabled,
      nextRunAt: store.config.nextRunAt,
      userbotConnected: userbotStatus.connected,
      botConnected: botStatus.connected,
    });
  });

  app.get('/api/cron/tick', async (_req, res) => {
    await schedulerTick();
    res.json({
      ok: true,
      schedulerEnabled: store.config.enabled,
      nextRunAt: store.config.nextRunAt,
      lastRunAt: store.config.lastRunAt,
    });
  });

  const distDir = path.resolve('dist');
  const distIndex = path.join(distDir, 'index.html');
  if (process.env.NODE_ENV !== 'production' || !fs.existsSync(distIndex)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(distIndex);
    });
  }

  if (typeof PORT === 'number') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`BazarBot server running on http://0.0.0.0:${PORT}`);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`BazarBot server listening on socket ${PORT}`);
    });
  }

  await initUserbotClient();
  await verifyBotToken();
  if (getToken()) {
    await pollTelegramUpdates();
  }

  setInterval(() => {
    void pollTelegramUpdates();
  }, 5000);

  setInterval(() => {
    void schedulerTick();
  }, 15000);
}

void startServer();
