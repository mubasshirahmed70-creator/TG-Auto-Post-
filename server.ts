import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { execFile } from 'node:child_process';
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
  deletedProductIds?: string[];
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
const STORE_LOCK_FILE = path.join(DATA_DIR, 'store.lock');
const SCHEDULER_LOCK_FILE = path.join(DATA_DIR, 'scheduler.lock');
const INSTANCE_LOCK_FILE = path.join(DATA_DIR, 'instance.lock.json');
const GENERATED_IMAGES_DIR = path.resolve('src/assets/images');
const INSTANCE_ID = `${process.pid}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const LOCK_SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function withStoreLock<T>(fn: () => T): T {
  let acquired = false;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(STORE_LOCK_FILE, 'wx');
      fs.writeFileSync(fd, `${process.pid}:${Date.now()}`, 'utf-8');
      fs.closeSync(fd);
      acquired = true;
      break;
    } catch {
      try {
        if (fs.existsSync(STORE_LOCK_FILE)) {
          const stat = fs.statSync(STORE_LOCK_FILE);
          if (Date.now() - stat.mtimeMs > 8000) {
            fs.unlinkSync(STORE_LOCK_FILE);
            continue;
          }
        }
      } catch {
        // ignore stale-check race
      }
      Atomics.wait(LOCK_SLEEP_BUF, 0, 0, 12);
    }
  }
  try {
    return fn();
  } finally {
    if (acquired) {
      try {
        if (fs.existsSync(STORE_LOCK_FILE)) {
          fs.unlinkSync(STORE_LOCK_FILE);
        }
      } catch {
        // ignore unlock error
      }
    }
  }
}

function createDefaultStore(): StoreData {
  const nextRun = new Date(Date.now() + 150 * 60 * 1000).toISOString();

  return {
    products: [],
    deletedProductIds: [],
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

function normalizeStoreData(parsed: Partial<StoreData>): StoreData {
  const defaults = createDefaultStore();
  const deletedList = Array.isArray(parsed.deletedProductIds)
    ? parsed.deletedProductIds.filter((id): id is string => typeof id === 'string').slice(-300)
    : [];
  const deletedSet = new Set(deletedList);
  const products = (Array.isArray(parsed.products) ? parsed.products : []).filter(
    (p) => p && typeof p.id === 'string' && !deletedSet.has(p.id)
  );
  const config: SchedulerConfig = { ...defaults.config, ...(parsed.config ?? {}) };
  if (products.filter((p) => p.active).length === 0) {
    config.enabled = false;
  }

  return {
    products,
    deletedProductIds: deletedList,
    groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    config,
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

function parseStoreFromDisk(): StoreData | null {
  try {
    if (!fs.existsSync(STORE_FILE)) return null;
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return normalizeStoreData(parsed);
  } catch (err) {
    console.error('Failed to read store.json:', err);
    return null;
  }
}

function saveStore(data: StoreData): void {
  const normalized = normalizeStoreData(data);
  const tmpFile = `${STORE_FILE}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpFile, JSON.stringify(normalized, null, 2), 'utf-8');
  fs.renameSync(tmpFile, STORE_FILE);
}

function loadStore(): StoreData {
  return withStoreLock(() => {
    const fromDisk = parseStoreFromDisk();
    if (fromDisk) return fromDisk;
    const initial = createDefaultStore();
    saveStore(initial);
    return initial;
  });
}

const store = loadStore();

function applyFreshStore(fresh: StoreData): void {
  store.products = fresh.products;
  store.deletedProductIds = fresh.deletedProductIds;
  store.groups = fresh.groups;
  store.config = fresh.config;
  store.logs = fresh.logs;
  store.updateOffset = fresh.updateOffset;
  store.userSessionString = fresh.userSessionString;
  store.authSecret = fresh.authSecret;
  store.adminPasswordSalt = fresh.adminPasswordSalt;
  store.adminPasswordHash = fresh.adminPasswordHash;
}

function reloadStoreFromDisk(): StoreData {
  const fresh = parseStoreFromDisk();
  if (!fresh) return store;
  applyFreshStore(fresh);
  return store;
}

function mutateStore<T>(mutator: (s: StoreData) => T): T {
  return withStoreLock(() => {
    reloadStoreFromDisk();
    const result = mutator(store);
    saveStore(store);
    reloadStoreFromDisk();
    return result;
  });
}

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
  reloadStoreFromDisk();
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
  reloadStoreFromDisk();
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
      mutateStore((s) => {
        s.userSessionString = '';
      });
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
  const addedOrUpdated = mutateStore((s) => {
    let count = 0;

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

      const existing = s.groups.find((g) => g.chatId === chatIdStr);
      if (existing) {
        existing.title = title;
        existing.username = username ?? existing.username;
        existing.type = type;
        count++;
      } else {
        s.groups.unshift({
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
        count++;
      }
    }

    return count;
  });

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

// ---------- OFFICIAL BOT API (Pure node:https, zero undici/Wasm) ----------

function httpsPostBuffer<T>(
  urlPath: string,
  bodyBuffer: Buffer,
  contentType: string
): Promise<{ ok: boolean; result?: T; description?: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Content-Length': bodyBuffer.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const text = Buffer.concat(chunks).toString('utf-8');
            resolve(JSON.parse(text) as { ok: boolean; result?: T; description?: string });
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

function buildMultipartBody(
  fields: Array<{ name: string; value: string }>,
  files: Array<{ name: string; filename: string; mime: string; buffer: Buffer }>
): { body: Buffer; contentType: string } {
  const boundary = `----BazarBotBoundary${crypto.randomBytes(12).toString('hex')}`;
  const parts: Buffer[] = [];

  for (const f of fields) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`,
        'utf-8'
      )
    );
  }
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.mime}\r\n\r\n`,
        'utf-8'
      )
    );
    parts.push(file.buffer);
    parts.push(Buffer.from('\r\n', 'utf-8'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function telegramRequest<T>(
  method: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = getToken();
  if (!token) {
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN সেট করা নেই' };
  }

  const payload = body ? Buffer.from(JSON.stringify(body), 'utf-8') : Buffer.alloc(0);
  return httpsPostBuffer<T>(`/bot${token}/${method}`, payload, 'application/json');
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

  const groupType: TelegramGroup['type'] = chat.type;
  const chatIdStr = String(chat.id);
  return mutateStore((s) => {
    const existing = s.groups.find((g) => g.chatId === chatIdStr);
    if (existing) {
      existing.title = chat.title ?? existing.title;
      existing.username = chat.username ?? existing.username;
      existing.type = groupType;
      existing.lastError = null;
      return existing;
    }

    const created: TelegramGroup = {
      id: `grp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      chatId: chatIdStr,
      title: chat.title ?? (chat.username ? `@${chat.username}` : `Group ${chatIdStr}`),
      username: chat.username,
      type: groupType,
      enabled: true,
      postCount: 0,
      lastPostedAt: null,
      lastError: null,
      addedVia,
      addedAt: new Date().toISOString(),
    };
    s.groups.unshift(created);
    return created;
  });
}

async function pollTelegramUpdates(): Promise<void> {
  if (!isCurrentActiveInstance()) {
    return;
  }
  const token = getToken();
  if (!token) {
    botStatus.pollingActive = false;
    return;
  }

  try {
    reloadStoreFromDisk();
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
    let nextOffset = store.updateOffset;

    for (const upd of updates) {
      nextOffset = Math.max(nextOffset, upd.update_id + 1);

      if (upd.my_chat_member) {
        const { chat, new_chat_member } = upd.my_chat_member;
        const memberStatus = new_chat_member?.status ?? '';
        if (chat.type !== 'private') {
          if (memberStatus === 'member' || memberStatus === 'administrator') {
            upsertGroupFromChat(chat, 'auto');
          } else if (memberStatus === 'left' || memberStatus === 'kicked') {
            mutateStore((s) => {
              const existing = s.groups.find((g) => g.chatId === String(chat.id));
              if (existing) {
                existing.enabled = false;
                existing.lastError = 'বটটি গ্রুপ থেকে রিমুভ করা হয়েছে';
              }
            });
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
      mutateStore((s) => {
        s.updateOffset = Math.max(s.updateOffset, nextOffset);
      });
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
        const fields = [
          { name: 'chat_id', value: group.chatId },
          { name: 'caption', value: caption },
          { name: 'parse_mode', value: 'HTML' },
          ...(replyMarkup ? [{ name: 'reply_markup', value: JSON.stringify(replyMarkup) }] : []),
        ];
        const mp = buildMultipartBody(fields, [
          { name: 'photo', filename: localFile.filename, mime: localFile.mime, buffer: localFile.buffer },
        ]);
        const data = await httpsPostBuffer<{ message_id: number }>(
          `/bot${token}/sendPhoto`,
          mp.body,
          mp.contentType
        );
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

    const mediaPayload: Array<{
      type: 'photo';
      media: string;
      caption?: string;
      parse_mode?: string;
    }> = [];
    const files: Array<{ name: string; filename: string; mime: string; buffer: Buffer }> = [];

    images.forEach((img, idx) => {
      const localFile = resolveLocalImageFile(img);
      const attachKey = `photo_${idx}`;
      if (localFile) {
        files.push({
          name: attachKey,
          filename: localFile.filename,
          mime: localFile.mime,
          buffer: localFile.buffer,
        });
      }

      mediaPayload.push({
        type: 'photo',
        media: localFile ? `attach://${attachKey}` : img,
        ...(idx === 0 ? { caption, parse_mode: 'HTML' } : {}),
      });
    });

    const mp = buildMultipartBody(
      [
        { name: 'chat_id', value: group.chatId },
        { name: 'media', value: JSON.stringify(mediaPayload) },
      ],
      files
    );
    const data = await httpsPostBuffer<Array<{ message_id: number }>>(
      `/bot${token}/sendMediaGroup`,
      mp.body,
      mp.contentType
    );

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

let stopRequested = false;

function addLogToStore(targetStore: StoreData, entry: Omit<PostLog, 'id' | 'timestamp'>): void {
  targetStore.logs.unshift({
    id: `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (targetStore.logs.length > 200) {
    targetStore.logs = targetStore.logs.slice(0, 200);
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
  mutateStore((s) => {
    const freshActive = s.products.filter((p) => p.active);
    if (freshActive.length > 0) {
      s.config.rotationIndex = (idx + 1) % freshActive.length;
    }
  });
  return [activeProducts[idx]];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleepInterruptible(ms: number, isScheduled: boolean, productId: string): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    await sleep(Math.min(1000, Math.max(50, deadline - Date.now())));
    if (isScheduled) {
      reloadStoreFromDisk();
      if (!store.config.enabled || stopRequested) {
        return false;
      }
      if (!store.products.some((p) => p.id === productId && p.active)) {
        return false;
      }
    }
  }
  return true;
}

function tryAcquireSchedulerLock(): boolean {
  try {
    if (fs.existsSync(SCHEDULER_LOCK_FILE)) {
      const stat = fs.statSync(SCHEDULER_LOCK_FILE);
      // Recover stale lock older than 5 minutes
      if (Date.now() - stat.mtimeMs > 5 * 60 * 1000) {
        fs.unlinkSync(SCHEDULER_LOCK_FILE);
      }
    }
    const fd = fs.openSync(SCHEDULER_LOCK_FILE, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf-8');
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function releaseSchedulerLock(): void {
  try {
    if (fs.existsSync(SCHEDULER_LOCK_FILE)) {
      fs.unlinkSync(SCHEDULER_LOCK_FILE);
    }
  } catch {
    // ignore cleanup error
  }
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

  reloadStoreFromDisk();
  const isScheduled = Boolean(options?.isScheduled);
  if (isScheduled && (!store.config.enabled || stopRequested)) {
    return { sent: 0, failed: 0, dryRunCount: 0 };
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
    if (store.config.enabled) {
      mutateStore((s) => {
        if (s.products.filter((p) => p.active).length === 0) {
          s.config.enabled = false;
        }
      });
    }
    return { sent: 0, failed: 0, dryRunCount: 0, error: 'কোনো সক্রিয় পোস্ট পাওয়া যায়নি' };
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
  let aborted = false;

  try {
    const delayMs = Math.max(1, store.config.delayBetweenGroupsSec) * 1000;

    for (let pIdx = 0; pIdx < chosenProducts.length && !aborted; pIdx++) {
      const product = chosenProducts[pIdx];

      for (let gIdx = 0; gIdx < targetGroups.length; gIdx++) {
        // Re-verify fresh state from disk before every single Telegram send
        reloadStoreFromDisk();
        if (isScheduled && (!store.config.enabled || stopRequested)) {
          aborted = true;
          break;
        }
        const liveProduct = store.products.find((p) => p.id === product.id);
        if (!liveProduct || (isScheduled && !liveProduct.active)) {
          aborted = true;
          break;
        }

        const group = targetGroups[gIdx];
        const liveGroup = store.groups.find((g) => g.id === group.id);
        if (!liveGroup) {
          continue;
        }

        const result =
          mode === 'userbot'
            ? await sendProductViaUserbot(liveProduct, liveGroup, store.config, dryRun)
            : await sendProductToGroup(liveProduct, liveGroup, store.config, dryRun);

        const nowIso = new Date().toISOString();
        mutateStore((s) => {
          const targetProd = s.products.find((p) => p.id === liveProduct.id);
          const targetGrp = s.groups.find((g) => g.id === liveGroup.id);

          if (result.ok) {
            if (result.dryRun) {
              dryRunCount++;
              addLogToStore(s, {
                productId: liveProduct.id,
                productName: liveProduct.name,
                groupId: liveGroup.id,
                groupTitle: liveGroup.title,
                status: 'dry_run',
                message: 'টেস্ট সিমুলেশন সম্পন্ন (বাস্তব টেলিগ্রাম মেসেজ পাঠানো হয়নি)',
              });
            } else {
              sent++;
              if (targetProd) {
                targetProd.postCount += 1;
                targetProd.lastPostedAt = nowIso;
              }
              if (targetGrp) {
                targetGrp.postCount += 1;
                targetGrp.lastPostedAt = nowIso;
                targetGrp.lastError = null;
              }
              addLogToStore(s, {
                productId: liveProduct.id,
                productName: liveProduct.name,
                groupId: liveGroup.id,
                groupTitle: liveGroup.title,
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
            if (targetGrp) {
              targetGrp.lastError = result.error ?? 'Unknown error';
            }
            addLogToStore(s, {
              productId: liveProduct.id,
              productName: liveProduct.name,
              groupId: liveGroup.id,
              groupTitle: liveGroup.title,
              status: 'error',
              message: result.error ?? 'পোস্ট ব্যর্থ হয়েছে',
            });
          }
        });

        const hasMore = gIdx < targetGroups.length - 1 || pIdx < chosenProducts.length - 1;
        if (hasMore && !dryRun) {
          const jitter = mode === 'userbot' ? Math.floor(Math.random() * 3000) : 0;
          const keepGoing = await sleepInterruptible(delayMs + jitter, isScheduled, product.id);
          if (!keepGoing) {
            aborted = true;
            break;
          }
        }
      }
    }

    const now = Date.now();
    mutateStore((s) => {
      s.config.lastRunAt = new Date(now).toISOString();
      if (s.config.enabled) {
        s.config.nextRunAt = new Date(now + s.config.intervalMinutes * 60 * 1000).toISOString();
      }
    });
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
  if (!isCurrentActiveInstance()) {
    return;
  }
  if (isBroadcasting || stopRequested) {
    return;
  }
  if (!tryAcquireSchedulerLock()) {
    return;
  }
  try {
    reloadStoreFromDisk();
    if (!store.config.enabled || stopRequested) {
      return;
    }
    if (store.products.filter((p) => p.active).length === 0) {
      mutateStore((s) => {
        if (s.products.filter((p) => p.active).length === 0) {
          s.config.enabled = false;
        }
      });
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
      mutateStore((s) => {
        s.config.nextRunAt = new Date(now + s.config.intervalMinutes * 60 * 1000).toISOString();
      });
      return;
    }

    if (now >= nextRunMs) {
      if (!isWithinActiveHours(store.config)) {
        mutateStore((s) => {
          s.config.nextRunAt = new Date(now + 15 * 60 * 1000).toISOString();
        });
        return;
      }

      // Advance nextRunAt on disk BEFORE broadcasting so concurrent workers/cron never double-send
      mutateStore((s) => {
        s.config.nextRunAt = new Date(now + s.config.intervalMinutes * 60 * 1000).toISOString();
      });

      await executeBroadcastRound({ isScheduled: true });
    }
  } finally {
    releaseSchedulerLock();
  }
}

function normalizeBasePath(raw?: string | null): string {
  if (!raw) return '';
  const cleaned = raw.trim().replace(/^\/+|\/+$/g, '');
  return cleaned ? `/${cleaned}` : '';
}

function detectSubpathPrefix(reqPath: string, isProd: boolean): string {
  const envBase = normalizeBasePath(
    process.env.APP_BASE_PATH || process.env.PASSENGER_BASE_URI || process.env.LSNODE_BASE_URI
  );
  if (envBase) {
    return reqPath === envBase || reqPath.startsWith(`${envBase}/`) ? envBase : '';
  }
  if (!isProd) return '';
  const match = reqPath.match(/^\/([^/]+)(\/.*)?$/);
  if (!match) return '';
  const seg = match[1];
  const rest = match[2] || '';
  const reservedRootSegments = new Set([
    'api',
    'assets',
    'uploads',
    'src',
    'favicon.ico',
    'robots.txt',
  ]);
  if (reservedRootSegments.has(seg)) return '';
  if (
    rest === '' ||
    rest === '/' ||
    rest.startsWith('/api/') ||
    rest.startsWith('/assets/') ||
    rest.startsWith('/uploads/') ||
    rest.startsWith('/src/assets/images/')
  ) {
    return `/${seg}`;
  }
  return '';
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  const isProd = process.env.NODE_ENV === 'production';
  app.use((req, res, next) => {
    const envBase = normalizeBasePath(
      process.env.APP_BASE_PATH || process.env.PASSENGER_BASE_URI || process.env.LSNODE_BASE_URI
    );
    const reqPrefix = detectSubpathPrefix(req.path, isProd);
    res.locals.basePath = envBase || reqPrefix;
    if (
      reqPrefix &&
      (req.url === reqPrefix ||
        req.url.startsWith(`${reqPrefix}/`) ||
        req.url.startsWith(`${reqPrefix}?`))
    ) {
      const stripped = req.url.slice(reqPrefix.length);
      req.url = stripped ? (stripped.startsWith('/') ? stripped : `/${stripped}`) : '/';
    }
    next();
  });

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
    mutateStore((s) => {
      s.adminPasswordSalt = salt;
      s.adminPasswordHash = hashPasswordWithSalt(newPwd, salt);
    });
    res.json({ ok: true, token: createAuthToken() });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ ok: true });
  });

  // Prevent LiteSpeed / browser / proxy caching on all API routes & protect dashboard endpoints
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-LiteSpeed-Cache-Control', 'no-cache');

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
    reloadStoreFromDisk();
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

      const savedSession = String(client.session.save());
      mutateStore((s) => {
        s.userSessionString = savedSession;
      });

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

      const savedSession = String(client.session.save());
      mutateStore((s) => {
        s.userSessionString = savedSession;
      });

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
    mutateStore((s) => {
      s.userSessionString = '';
    });
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

    mutateStore((s) => {
      s.products.unshift(created);
    });
    res.status(201).json(created);
  });

  app.put('/api/products/:id', (req, res) => {
    const body = req.body as Partial<ProductItem>;
    const updatedResult = mutateStore<ProductItem | null>((s) => {
      const idx = s.products.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return null;
      const existing = s.products[idx];
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
      s.products[idx] = updated;
      if (s.products.filter((p) => p.active).length === 0) {
        s.config.enabled = false;
        stopRequested = true;
      }
      return updated;
    });

    if (!updatedResult) {
      res.status(404).json({ error: 'পোস্ট পাওয়া যায়নি' });
      return;
    }
    res.json(updatedResult);
  });

  app.delete('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    const removedImages = mutateStore<string[] | null>((s) => {
      const target = s.products.find((p) => p.id === productId);
      if (!target) return null;
      const deadImages = [...target.images];
      s.products = s.products.filter((p) => p.id !== productId);
      const deletedSet = new Set(s.deletedProductIds ?? []);
      deletedSet.add(productId);
      s.deletedProductIds = Array.from(deletedSet).slice(-300);
      if (s.products.filter((p) => p.active).length === 0) {
        s.config.enabled = false;
        stopRequested = true;
      }
      const stillReferenced = new Set(s.products.flatMap((p) => p.images));
      return deadImages.filter((img) => img.startsWith('/uploads/') && !stillReferenced.has(img));
    });

    if (removedImages === null) {
      res.status(404).json({ error: 'প্রোডাক্ট পাওয়া যায়নি' });
      return;
    }

    for (const imgPath of removedImages) {
      try {
        const diskFile = path.join(UPLOADS_DIR, path.basename(imgPath));
        if (fs.existsSync(diskFile)) {
          fs.unlinkSync(diskFile);
        }
      } catch {
        // ignore image cleanup errors
      }
    }

    res.json({ ok: true, schedulerEnabled: store.config.enabled });
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

    const createdOrUpdated = mutateStore<{ created: boolean; group: TelegramGroup }>((s) => {
      const existing = s.groups.find((g) => g.chatId === resolvedChatId);
      if (existing) {
        existing.title = resolvedTitle;
        existing.username = resolvedUsername ?? existing.username;
        existing.type = resolvedType;
        existing.lastError = lastError;
        return { created: false, group: existing };
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

      s.groups.unshift(created);
      return { created: true, group: created };
    });

    res.status(createdOrUpdated.created ? 201 : 200).json(createdOrUpdated.group);
  });

  app.put('/api/groups/:id', (req, res) => {
    const body = req.body as Partial<TelegramGroup>;
    const updatedGroup = mutateStore<TelegramGroup | null>((s) => {
      const group = s.groups.find((g) => g.id === req.params.id);
      if (!group) return null;
      if (body.enabled !== undefined) group.enabled = Boolean(body.enabled);
      if (body.title !== undefined) group.title = body.title.trim() || group.title;
      return group;
    });
    if (!updatedGroup) {
      res.status(404).json({ error: 'গ্রুপ পাওয়া যায়নি' });
      return;
    }
    res.json(updatedGroup);
  });

  app.delete('/api/groups/:id', (req, res) => {
    mutateStore((s) => {
      s.groups = s.groups.filter((g) => g.id !== req.params.id);
    });
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

  // ---------- CONFIG, SCHEDULER TOGGLE & BROADCAST ----------

  app.post('/api/scheduler/toggle', (req, res) => {
    const desired = Boolean((req.body as { enabled?: boolean }).enabled);
    const result = mutateStore<{ error?: string; config: SchedulerConfig }>((s) => {
      const activeCount = s.products.filter((p) => p.active).length;

      if (desired && activeCount === 0) {
        s.config.enabled = false;
        stopRequested = true;
        return {
          error:
            'কোনো সক্রিয় পোস্ট তৈরি করা নেই! আগে "পোস্ট" ট্যাব থেকে অন্তত ১টি পোস্ট তৈরি করুন, তারপর Start দিন।',
          config: s.config,
        };
      }

      s.config.enabled = desired;
      if (!desired) {
        stopRequested = true;
      } else {
        stopRequested = false;
        s.config.nextRunAt = new Date(
          Date.now() + s.config.intervalMinutes * 60 * 1000
        ).toISOString();
      }
      return { config: s.config };
    });

    if (result.error) {
      res.status(400).json({ error: result.error, config: result.config });
      return;
    }
    res.json(result.config);
  });

  app.put('/api/config', (req, res) => {
    const body = req.body as Partial<SchedulerConfig>;
    const result = mutateStore<{ error?: string; config: SchedulerConfig }>((s) => {
      const prevEnabled = s.config.enabled;
      const prevInterval = s.config.intervalMinutes;
      const activeCount = s.products.filter((p) => p.active).length;

      // Never allow PUT /api/config to accidentally re-enable a stopped scheduler;
      // Start must go through POST /api/scheduler/toggle (only explicit Stop is honored here).
      const nextEnabled =
        body.enabled === false ? false : activeCount === 0 ? false : prevEnabled;

      s.config = {
        ...s.config,
        ...body,
        enabled: nextEnabled,
        postingMode:
          body.postingMode === 'bot'
            ? 'bot'
            : body.postingMode === 'userbot'
            ? 'userbot'
            : s.config.postingMode,
        intervalMinutes: Math.max(5, Number(body.intervalMinutes ?? s.config.intervalMinutes) || 150),
        delayBetweenGroupsSec: Math.max(
          1,
          Math.min(180, Number(body.delayBetweenGroupsSec ?? s.config.delayBetweenGroupsSec) || 15)
        ),
        activeStartHour: Math.max(0, Math.min(23, Number(body.activeStartHour ?? s.config.activeStartHour))),
        activeEndHour: Math.max(0, Math.min(23, Number(body.activeEndHour ?? s.config.activeEndHour))),
      };

      if (!s.config.enabled) {
        stopRequested = true;
      }

      if (prevInterval !== s.config.intervalMinutes || !s.config.nextRunAt) {
        s.config.nextRunAt = new Date(
          Date.now() + s.config.intervalMinutes * 60 * 1000
        ).toISOString();
      }

      return { config: s.config };
    });

    res.json(result.config);
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
    mutateStore((s) => {
      s.logs = [];
    });
    res.json({ ok: true });
  });

  app.get('/api/health', (_req, res) => {
    reloadStoreFromDisk();
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

  // ---------- BUILT-IN CODE EDITOR & SMART PATCHER API ----------
  const EDITOR_ROOT = path.resolve('.');
  const EDITOR_ROOT_ALLOWLIST = [
    'server.ts',
    'index.html',
    'package.json',
    'build-cpanel.mjs',
    'cpanel-start.cjs',
    'vite.config.ts',
    'tsconfig.json',
    'metadata.json',
  ];
  const EDITOR_ALLOWED_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.html', '.css', '.json', '.txt']);

  function listEditableFiles(): Array<{
    path: string;
    label: string;
    size: number;
    modified: string;
    hasBackup: boolean;
  }> {
    const results: Array<{
      path: string;
      label: string;
      size: number;
      modified: string;
      hasBackup: boolean;
    }> = [];
    const seen = new Set<string>();

    const addRelFile = (relPosix: string) => {
      if (seen.has(relPosix) || relPosix.endsWith('.bak')) return;
      const abs = path.join(EDITOR_ROOT, relPosix);
      if (!fs.existsSync(abs)) return;
      const stat = fs.statSync(abs);
      if (!stat.isFile()) return;
      seen.add(relPosix);
      results.push({
        path: relPosix,
        label: relPosix,
        size: stat.size,
        modified: stat.mtime.toISOString().slice(0, 19).replace('T', ' '),
        hasBackup: fs.existsSync(`${abs}.bak`),
      });
    };

    for (const rootFile of EDITOR_ROOT_ALLOWLIST) {
      addRelFile(rootFile);
    }

    const srcDir = path.join(EDITOR_ROOT, 'src');
    const walkSrc = (dir: string, prefix: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.endsWith('.bak')) continue;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkSrc(full, rel);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (EDITOR_ALLOWED_EXTS.has(ext)) {
            addRelFile(rel);
          }
        }
      }
    };
    walkSrc(srcDir, 'src');

    return results;
  }

  function resolveEditableFilePath(relInput: unknown): { relPath: string; absPath: string } | null {
    const raw = String(relInput ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!raw || raw.includes('..') || raw.endsWith('.bak')) return null;
    if (
      raw.startsWith('.env') ||
      raw.startsWith('data/') ||
      raw.startsWith('node_modules/') ||
      raw.startsWith('dist/')
    ) {
      return null;
    }
    const allowed = listEditableFiles().some((f) => f.path === raw);
    if (!allowed) return null;
    const absPath = path.resolve(EDITOR_ROOT, raw);
    if (!absPath.startsWith(EDITOR_ROOT + path.sep)) return null;
    return { relPath: raw, absPath };
  }

  app.get('/api/editor/files', (_req, res) => {
    res.json({ files: listEditableFiles() });
  });

  app.post('/api/editor/load', (req, res) => {
    const resolved = resolveEditableFilePath((req.body as { filename?: string }).filename);
    if (!resolved) {
      res.status(400).json({ error: 'এই ফাইলটি এডিট করার অনুমতি নেই' });
      return;
    }
    const content = fs.readFileSync(resolved.absPath, 'utf8');
    const stat = fs.statSync(resolved.absPath);
    res.json({
      filename: resolved.relPath,
      content,
      size: `${Buffer.byteLength(content, 'utf8').toLocaleString()} bytes`,
      modified: stat.mtime.toISOString().slice(0, 19).replace('T', ' '),
      hasBackup: fs.existsSync(`${resolved.absPath}.bak`),
    });
  });

  app.post('/api/editor/upload', (req, res) => {
    const body = req.body as { filename?: string; content?: string };
    const resolved = resolveEditableFilePath(body.filename);
    if (!resolved) {
      res.status(400).json({ error: 'সঠিক টার্গেট ফাইল সিলেক্ট করুন' });
      return;
    }
    const content = typeof body.content === 'string' ? body.content : '';
    if (content.trim().length < 5) {
      res.status(400).json({ error: 'আপলোড করা ফাইলটি খালি' });
      return;
    }
    fs.copyFileSync(resolved.absPath, `${resolved.absPath}.bak`);
    fs.writeFileSync(resolved.absPath, content, 'utf8');
    res.json({
      ok: true,
      message: `${resolved.relPath} সফলভাবে রিপ্লেস হয়েছে (${Buffer.byteLength(content, 'utf8').toLocaleString()} bytes)`,
    });
  });

  app.post('/api/editor/find-replace', (req, res) => {
    const body = req.body as { filename?: string; findText?: string; replaceText?: string };
    const resolved = resolveEditableFilePath(body.filename);
    if (!resolved) {
      res.status(400).json({ error: 'সঠিক ফাইল সিলেক্ট করুন' });
      return;
    }
    const findRaw = String(body.findText ?? '');
    const replaceRaw = String(body.replaceText ?? '');
    if (!findRaw.trim()) {
      res.status(400).json({ error: 'খুঁজে বের করার জন্য পুরোনো কোড লিখুন' });
      return;
    }

    const normContent = fs.readFileSync(resolved.absPath, 'utf8').replace(/\r\n/g, '\n');
    const normFind = findRaw.replace(/\r\n/g, '\n');
    const normReplace = replaceRaw.replace(/\r\n/g, '\n');

    const parts = normContent.split(normFind);
    const count = parts.length - 1;
    if (count === 0) {
      res.status(400).json({ error: `${resolved.relPath} ফাইলে হুবহু এই কোড পাওয়া যায়নি` });
      return;
    }

    const updated = parts.join(normReplace);
    fs.copyFileSync(resolved.absPath, `${resolved.absPath}.bak`);
    fs.writeFileSync(resolved.absPath, updated, 'utf8');
    res.json({
      ok: true,
      count,
      message: `${resolved.relPath}-এ ${count}টি অংশ রিপ্লেস ও সেভ হয়েছে!`,
      content: updated,
    });
  });

  app.post('/api/editor/save', (req, res) => {
    const body = req.body as { filename?: string; content?: string };
    const resolved = resolveEditableFilePath(body.filename);
    if (!resolved) {
      res.status(400).json({ error: 'সঠিক ফাইল সিলেক্ট করুন' });
      return;
    }
    const content = typeof body.content === 'string' ? body.content : '';
    if (content.trim().length < 5) {
      res.status(400).json({ error: 'কোড খালি রাখা যাবে না' });
      return;
    }
    fs.copyFileSync(resolved.absPath, `${resolved.absPath}.bak`);
    fs.writeFileSync(resolved.absPath, content, 'utf8');
    res.json({
      ok: true,
      message: `${resolved.relPath} সেভ হয়েছে (${Buffer.byteLength(content, 'utf8').toLocaleString()} bytes)`,
    });
  });

  app.post('/api/editor/restore', (req, res) => {
    const resolved = resolveEditableFilePath((req.body as { filename?: string }).filename);
    if (!resolved) {
      res.status(400).json({ error: 'সঠিক ফাইল সিলেক্ট করুন' });
      return;
    }
    const bakPath = `${resolved.absPath}.bak`;
    if (!fs.existsSync(bakPath)) {
      res.status(404).json({ error: 'এই ফাইলের কোনো ব্যাকআপ নেই' });
      return;
    }
    fs.copyFileSync(bakPath, resolved.absPath);
    res.json({ ok: true, message: `${resolved.relPath} আগের ব্যাকআপ থেকে রিস্টোর হয়েছে!` });
  });

  app.get('/api/editor/export-txt', (_req, res) => {
    const allFiles = listEditableFiles();
    const chunks: string[] = [];
    for (const f of allFiles) {
      const abs = path.join(EDITOR_ROOT, f.path);
      if (!fs.existsSync(abs)) continue;
      chunks.push(`--- START OF FILE ${f.path} ---\n\n${fs.readFileSync(abs, 'utf8')}\n\n`);
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="BazarBot_All_Files.txt"');
    res.send(chunks.join(''));
  });

  app.post('/api/editor/rebuild', (_req, res) => {
    const buildScript = path.join(EDITOR_ROOT, 'build-cpanel.mjs');
    if (!fs.existsSync(buildScript)) {
      res.status(404).json({ error: 'build-cpanel.mjs পাওয়া যায়নি' });
      return;
    }
    execFile(process.execPath, [buildScript], { cwd: EDITOR_ROOT, timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        res.status(500).json({ error: stderr || err.message || 'বিল্ড ব্যর্থ হয়েছে' });
        return;
      }
      try {
        const tmpDir = path.join(EDITOR_ROOT, 'tmp');
        fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'restart.txt'), `${Date.now()}\n`, 'utf8');
      } catch {
        // ignore restart hint error
      }
      res.json({
        ok: true,
        message: 'অ্যাপ সফলভাবে Rebuild হয়েছে! পরিবর্তন দেখতে পেজ রিফ্রেশ দিন।',
        output: stdout.trim(),
      });
    });
  });

  const distDir = path.resolve('dist');
  const distIndex = path.join(distDir, 'index.html');
  if (process.env.NODE_ENV !== 'production' || !fs.existsSync(distIndex)) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.NODE_ENV === 'production' || process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ...(disableHmr ? { hmr: false } : {}),
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir, { index: false, redirect: false }));
    app.get('*', (_req, res) => {
      const basePath = typeof res.locals.basePath === 'string' ? res.locals.basePath : '';
      const rawHtml = fs.readFileSync(distIndex, 'utf8');
      const assetPrefix = `${basePath}/assets/`;
      const html = rawHtml
        .replace('</head>', `    <script>window.__APP_BASE__=${JSON.stringify(basePath)};</script>\n  </head>`)
        .replaceAll('"/assets/', `"${assetPrefix}`);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-LiteSpeed-Cache-Control', 'no-cache');
      res.type('html').send(html);
    });
  }

  // Terminate any orphaned previous BazarBot worker in this same directory before claiming lock
  if (process.env.NODE_ENV === 'production') {
    terminateOrphanedWorkers();
  }
  claimActiveInstance();

  const server =
    typeof PORT === 'number'
      ? app.listen(PORT, '0.0.0.0', () => {
          console.log(`BazarBot server running on http://0.0.0.0:${PORT}`);
        })
      : app.listen(PORT, () => {
          console.log(`BazarBot server listening on socket ${PORT}`);
        });

  activeHttpServer = server;

  await initUserbotClient();
  await verifyBotToken();
  if (getToken()) {
    await pollTelegramUpdates();
  }

  pollIntervalHandle = setInterval(() => {
    void pollTelegramUpdates();
  }, 5000);

  schedulerIntervalHandle = setInterval(() => {
    void schedulerTick();
  }, 15000);
}

let activeHttpServer: import('node:http').Server | null = null;
let pollIntervalHandle: ReturnType<typeof setInterval> | null = null;
let schedulerIntervalHandle: ReturnType<typeof setInterval> | null = null;
let isShuttingDown = false;

function claimActiveInstance(): void {
  try {
    fs.writeFileSync(
      INSTANCE_LOCK_FILE,
      JSON.stringify({
        pid: process.pid,
        instanceId: INSTANCE_ID,
        startedAt: new Date().toISOString(),
      }),
      'utf-8'
    );
  } catch {
    // ignore lock write failure
  }
}

function isCurrentActiveInstance(): boolean {
  if (isShuttingDown) return false;
  try {
    if (!fs.existsSync(INSTANCE_LOCK_FILE)) return true;
    const raw = fs.readFileSync(INSTANCE_LOCK_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as { instanceId?: string; pid?: number };
    if (parsed.instanceId && parsed.instanceId !== INSTANCE_ID) {
      console.log(`Detected newer BazarBot instance (${parsed.pid}); shutting down stale worker ${process.pid}.`);
      void gracefulShutdown('superseded');
      return false;
    }
  } catch {
    // ignore parse race
  }
  return true;
}

function terminateOrphanedWorkers(): void {
  const cwd = process.cwd();
  const stalePids = new Set<number>();

  try {
    if (fs.existsSync(INSTANCE_LOCK_FILE)) {
      const prev = JSON.parse(fs.readFileSync(INSTANCE_LOCK_FILE, 'utf-8')) as { pid?: number };
      if (typeof prev.pid === 'number' && prev.pid > 1 && prev.pid !== process.pid && prev.pid !== process.ppid) {
        stalePids.add(prev.pid);
      }
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync('/proc')) {
      for (const entry of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(entry)) continue;
        const pid = Number(entry);
        if (pid <= 1 || pid === process.pid || pid === process.ppid) continue;
        try {
          const procCwd = fs.readlinkSync(`/proc/${pid}/cwd`);
          if (procCwd !== cwd) continue;
          const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ');
          if (
            cmdline.includes('cpanel-start.cjs') ||
            cmdline.includes('server.mjs') ||
            cmdline.includes('server.ts')
          ) {
            stalePids.add(pid);
          }
        } catch {
          // ignore processes we cannot inspect
        }
      }
    }
  } catch {
    // ignore non-Linux or restricted /proc
  }

  for (const pid of stalePids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore ESRCH
    }
  }

  if (stalePids.size > 0) {
    setTimeout(() => {
      for (const pid of stalePids) {
        try {
          process.kill(pid, 0);
          process.kill(pid, 'SIGKILL');
        } catch {
          // already exited
        }
      }
    }, 1500).unref();
  }
}

async function gracefulShutdown(reason: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  stopRequested = true;
  console.log(`Shutting down BazarBot worker ${process.pid} (${reason})...`);

  if (pollIntervalHandle) clearInterval(pollIntervalHandle);
  if (schedulerIntervalHandle) clearInterval(schedulerIntervalHandle);

  try {
    if (userClient) {
      await userClient.disconnect();
      userClient = null;
    }
  } catch {
    // ignore disconnect errors
  }

  try {
    if (activeHttpServer) {
      activeHttpServer.close();
    }
  } catch {
    // ignore close error
  }

  setTimeout(() => process.exit(0), 250).unref();
}

for (const sig of ['SIGTERM', 'SIGINT', 'SIGUSR2', 'SIGHUP'] as const) {
  process.on(sig, () => {
    void gracefulShutdown(sig);
  });
}

void startServer();
