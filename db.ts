import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { PostLog, ProductItem, SchedulerConfig, TelegramGroup } from './src/types.ts';

export interface SchedulerRuntimeConfig extends SchedulerConfig {
  schedulerRunId: string;
}

interface LegacyStoreJson {
  products?: ProductItem[];
  deletedProductIds?: string[];
  groups?: TelegramGroup[];
  config?: Partial<SchedulerConfig>;
  logs?: PostLog[];
  updateOffset?: number;
  userSessionString?: string;
  authSecret?: string;
  adminPasswordSalt?: string;
  adminPasswordHash?: string;
}

interface ProductRow {
  id: string;
  name: string;
  caption: string;
  link: string | null;
  images_json: string;
  active: number;
  post_count: number;
  last_posted_at: string | null;
  created_at: string;
  sort_order: number;
}

interface GroupRow {
  id: string;
  chat_id: string;
  title: string;
  username: string | null;
  type: string;
  enabled: number;
  post_count: number;
  last_posted_at: string | null;
  last_error: string | null;
  added_via: string;
  added_at: string;
}

interface ConfigRow {
  id: number;
  enabled: number;
  posting_mode: string;
  interval_minutes: number;
  delay_between_groups_sec: number;
  active_hours_enabled: number;
  active_start_hour: number;
  active_end_hour: number;
  rotation_mode: string;
  seller_contact_url: string;
  button_text: string;
  append_footer_tag: number;
  footer_text: string;
  next_run_at: string | null;
  last_run_at: string | null;
  rotation_index: number;
  scheduler_run_id: string;
}

interface LogRow {
  id: string;
  timestamp: string;
  product_id: string;
  product_name: string;
  group_id: string;
  group_title: string;
  status: string;
  message: string;
  telegram_message_id: number | null;
}

let db: DatabaseSync | null = null;

function requireDb(): DatabaseSync {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

function runTx<T>(fn: (database: DatabaseSync) => T): T {
  const database = requireDb();
  database.exec('BEGIN IMMEDIATE');
  try {
    const res = fn(database);
    database.exec('COMMIT');
    return res;
  } catch (err) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    throw err;
  }
}

export function defaultConfigValues(): SchedulerConfig {
  return {
    enabled: false,
    postingMode: 'userbot',
    intervalMinutes: 150,
    delayBetweenGroupsSec: 60,
    activeHoursEnabled: false,
    activeStartHour: 8,
    activeEndHour: 23,
    rotationMode: 'sequential',
    sellerContactUrl: 'https://t.me/',
    buttonText: 'অর্ডার করতে মেসেজ দিন',
    appendFooterTag: false,
    footerText: '',
    nextRunAt: new Date(Date.now() + 150 * 60 * 1000).toISOString(),
    lastRunAt: null,
    rotationIndex: 0,
  };
}

function mapProductRow(row: ProductRow): ProductItem {
  let images: string[] = [];
  try {
    const parsed = JSON.parse(row.images_json);
    if (Array.isArray(parsed)) {
      images = parsed.filter((x): x is string => typeof x === 'string');
    }
  } catch {
    images = [];
  }
  return {
    id: row.id,
    name: row.name,
    caption: row.caption,
    link: row.link ?? undefined,
    images,
    active: row.active === 1,
    postCount: row.post_count,
    lastPostedAt: row.last_posted_at,
    createdAt: row.created_at,
  };
}

function mapGroupRow(row: GroupRow): TelegramGroup {
  return {
    id: row.id,
    chatId: row.chat_id,
    title: row.title,
    username: row.username ?? undefined,
    type: (row.type as TelegramGroup['type']) || 'supergroup',
    enabled: row.enabled === 1,
    postCount: row.post_count,
    lastPostedAt: row.last_posted_at,
    lastError: row.last_error,
    addedVia: (row.added_via as TelegramGroup['addedVia']) || 'manual',
    addedAt: row.added_at,
  };
}

function mapConfigRow(row: ConfigRow): SchedulerRuntimeConfig {
  return {
    enabled: row.enabled === 1,
    postingMode: row.posting_mode === 'bot' ? 'bot' : 'userbot',
    intervalMinutes: row.interval_minutes,
    delayBetweenGroupsSec: row.delay_between_groups_sec,
    activeHoursEnabled: row.active_hours_enabled === 1,
    activeStartHour: row.active_start_hour,
    activeEndHour: row.active_end_hour,
    rotationMode:
      row.rotation_mode === 'all_active'
        ? 'all_active'
        : row.rotation_mode === 'random'
        ? 'random'
        : 'sequential',
    sellerContactUrl: row.seller_contact_url,
    buttonText: row.button_text,
    appendFooterTag: row.append_footer_tag === 1,
    footerText: row.footer_text,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    rotationIndex: row.rotation_index,
    schedulerRunId: row.scheduler_run_id || '',
  };
}

function stripRuntimeFields(cfg: SchedulerRuntimeConfig): SchedulerConfig {
  const { schedulerRunId: _unused, ...clean } = cfg;
  return clean;
}

function mapLogRow(row: LogRow): PostLog {
  return {
    id: row.id,
    timestamp: row.timestamp,
    productId: row.product_id,
    productName: row.product_name,
    groupId: row.group_id,
    groupTitle: row.group_title,
    status: (row.status as PostLog['status']) || 'info',
    message: row.message,
    telegramMessageId: row.telegram_message_id ?? undefined,
  };
}

export function initDatabase(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'bazarbot.db');
  const legacyJsonPath = path.join(dataDir, 'store.json');

  const database = new DatabaseSync(dbPath, { timeout: 5000 });
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      link TEXT,
      images_json TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      post_count INTEGER NOT NULL DEFAULT 0,
      last_posted_at TEXT,
      created_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deleted_products (
      id TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      username TEXT,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      post_count INTEGER NOT NULL DEFAULT 0,
      last_posted_at TEXT,
      last_error TEXT,
      added_via TEXT NOT NULL,
      added_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      group_id TEXT NOT NULL,
      group_title TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      telegram_message_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      posting_mode TEXT NOT NULL DEFAULT 'userbot',
      interval_minutes INTEGER NOT NULL DEFAULT 150,
      delay_between_groups_sec INTEGER NOT NULL DEFAULT 60,
      active_hours_enabled INTEGER NOT NULL DEFAULT 1,
      active_start_hour INTEGER NOT NULL DEFAULT 8,
      active_end_hour INTEGER NOT NULL DEFAULT 23,
      rotation_mode TEXT NOT NULL DEFAULT 'sequential',
      seller_contact_url TEXT NOT NULL DEFAULT 'https://t.me/',
      button_text TEXT NOT NULL DEFAULT 'অর্ডার করতে মেসেজ দিন',
      append_footer_tag INTEGER NOT NULL DEFAULT 0,
      footer_text TEXT NOT NULL DEFAULT '',
      next_run_at TEXT,
      last_run_at TEXT,
      rotation_index INTEGER NOT NULL DEFAULT 0,
      scheduler_run_id TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS kv_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db = database;

  const existingCfg = database.prepare('SELECT id FROM config WHERE id = 1').get();
  if (!existingCfg) {
    const def = defaultConfigValues();
    database
      .prepare(
        `INSERT INTO config (
          id, enabled, posting_mode, interval_minutes, delay_between_groups_sec,
          active_hours_enabled, active_start_hour, active_end_hour, rotation_mode,
          seller_contact_url, button_text, append_footer_tag, footer_text,
          next_run_at, last_run_at, rotation_index, scheduler_run_id
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`
      )
      .run(
        0,
        def.postingMode,
        def.intervalMinutes,
        def.delayBetweenGroupsSec,
        def.activeHoursEnabled ? 1 : 0,
        def.activeStartHour,
        def.activeEndHour,
        def.rotationMode,
        def.sellerContactUrl,
        def.buttonText,
        def.appendFooterTag ? 1 : 0,
        def.footerText,
        def.nextRunAt,
        def.lastRunAt,
        def.rotationIndex
      );
  }

  const migratedRow = database
    .prepare("SELECT value FROM kv_meta WHERE key = 'migrated_from_json'")
    .get() as { value?: string } | undefined;

  if (!migratedRow && fs.existsSync(legacyJsonPath)) {
    try {
      const raw = fs.readFileSync(legacyJsonPath, 'utf-8');
      if (raw.trim()) {
        const legacy = JSON.parse(raw) as LegacyStoreJson;
        runTx((tx) => {
          const deletedIds = Array.isArray(legacy.deletedProductIds)
            ? legacy.deletedProductIds.filter((x): x is string => typeof x === 'string')
            : [];
          const delStmt = tx.prepare(
            'INSERT OR IGNORE INTO deleted_products (id, deleted_at) VALUES (?, ?)'
          );
          const nowIso = new Date().toISOString();
          for (const did of deletedIds) {
            delStmt.run(did, nowIso);
          }
          const deletedSet = new Set(deletedIds);

          const products = (Array.isArray(legacy.products) ? legacy.products : []).filter(
            (p) => p && typeof p.id === 'string' && !deletedSet.has(p.id)
          );
          const prodStmt = tx.prepare(
            `INSERT OR IGNORE INTO products (
              id, name, caption, link, images_json, active, post_count, last_posted_at, created_at, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          products.forEach((p, idx) => {
            prodStmt.run(
              p.id,
              p.name || 'টেলিগ্রাম পোস্ট',
              p.caption || '',
              p.link ?? null,
              JSON.stringify(Array.isArray(p.images) ? p.images : []),
              p.active ? 1 : 0,
              Number(p.postCount) || 0,
              p.lastPostedAt ?? null,
              p.createdAt || nowIso,
              products.length - idx
            );
          });

          const groups = Array.isArray(legacy.groups) ? legacy.groups : [];
          const grpStmt = tx.prepare(
            `INSERT OR IGNORE INTO groups (
              id, chat_id, title, username, type, enabled, post_count, last_posted_at, last_error, added_via, added_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const g of groups) {
            if (!g || !g.id || !g.chatId) continue;
            grpStmt.run(
              g.id,
              String(g.chatId),
              g.title || String(g.chatId),
              g.username ?? null,
              g.type || 'supergroup',
              g.enabled ? 1 : 0,
              Number(g.postCount) || 0,
              g.lastPostedAt ?? null,
              g.lastError ?? null,
              g.addedVia || 'manual',
              g.addedAt || nowIso
            );
          }

          const logs = Array.isArray(legacy.logs) ? legacy.logs.slice(0, 200) : [];
          const logStmt = tx.prepare(
            `INSERT OR IGNORE INTO logs (
              id, timestamp, product_id, product_name, group_id, group_title, status, message, telegram_message_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const l of logs) {
            if (!l || !l.id) continue;
            logStmt.run(
              l.id,
              l.timestamp || nowIso,
              l.productId || '',
              l.productName || '',
              l.groupId || '',
              l.groupTitle || '',
              l.status || 'info',
              l.message || '',
              typeof l.telegramMessageId === 'number' ? l.telegramMessageId : null
            );
          }

          const def = defaultConfigValues();
          const cfg = { ...def, ...(legacy.config ?? {}) };
          const activeCount = products.filter((p) => p.active).length;
          const enabledVal = activeCount > 0 && cfg.enabled ? 1 : 0;
          const runId = enabledVal ? crypto.randomBytes(8).toString('hex') : '';

          tx.prepare(
            `UPDATE config SET
              enabled = ?, posting_mode = ?, interval_minutes = ?, delay_between_groups_sec = ?,
              active_hours_enabled = ?, active_start_hour = ?, active_end_hour = ?, rotation_mode = ?,
              seller_contact_url = ?, button_text = ?, append_footer_tag = ?, footer_text = ?,
              next_run_at = ?, last_run_at = ?, rotation_index = ?, scheduler_run_id = ?
             WHERE id = 1`
          ).run(
            enabledVal,
            cfg.postingMode === 'bot' ? 'bot' : 'userbot',
            Math.max(5, Number(cfg.intervalMinutes) || 150),
            Math.max(1, Math.min(180, Number(cfg.delayBetweenGroupsSec) || 60)),
            cfg.activeHoursEnabled ? 1 : 0,
            Math.max(0, Math.min(23, Number(cfg.activeStartHour) ?? 8)),
            Math.max(0, Math.min(23, Number(cfg.activeEndHour) ?? 23)),
            cfg.rotationMode || 'sequential',
            cfg.sellerContactUrl || 'https://t.me/',
            cfg.buttonText || 'অর্ডার করতে মেসেজ দিন',
            cfg.appendFooterTag ? 1 : 0,
            cfg.footerText || '',
            cfg.nextRunAt ?? def.nextRunAt,
            cfg.lastRunAt ?? null,
            Number(cfg.rotationIndex) || 0,
            runId
          );

          const metaStmt = tx.prepare('INSERT OR REPLACE INTO kv_meta (key, value) VALUES (?, ?)');
          metaStmt.run('update_offset', String(typeof legacy.updateOffset === 'number' ? legacy.updateOffset : 0));
          metaStmt.run(
            'user_session_string',
            typeof legacy.userSessionString === 'string' ? legacy.userSessionString : ''
          );
          if (typeof legacy.authSecret === 'string' && legacy.authSecret.length >= 16) {
            metaStmt.run('auth_secret', legacy.authSecret);
          }
          if (typeof legacy.adminPasswordSalt === 'string') {
            metaStmt.run('admin_password_salt', legacy.adminPasswordSalt);
          }
          if (typeof legacy.adminPasswordHash === 'string') {
            metaStmt.run('admin_password_hash', legacy.adminPasswordHash);
          }
          metaStmt.run('migrated_from_json', '1');
        });
        fs.renameSync(legacyJsonPath, `${legacyJsonPath}.migrated.${Date.now()}`);
      }
    } catch (err) {
      console.error('Failed migrating legacy store.json to SQLite:', err);
    }
  }

  const secretRow = database
    .prepare("SELECT value FROM kv_meta WHERE key = 'auth_secret'")
    .get() as { value?: string } | undefined;
  if (!secretRow?.value || secretRow.value.length < 16) {
    database
      .prepare("INSERT OR REPLACE INTO kv_meta (key, value) VALUES ('auth_secret', ?)")
      .run(crypto.randomBytes(32).toString('hex'));
  }
}

export function getMeta(key: string): string | null {
  const row = requireDb()
    .prepare('SELECT value FROM kv_meta WHERE key = ?')
    .get(key) as { value?: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  requireDb()
    .prepare('INSERT OR REPLACE INTO kv_meta (key, value) VALUES (?, ?)')
    .run(key, value);
}

export function deleteMeta(key: string): void {
  requireDb().prepare('DELETE FROM kv_meta WHERE key = ?').run(key);
}

export function getRuntimeConfig(): SchedulerRuntimeConfig {
  const row = requireDb()
    .prepare('SELECT * FROM config WHERE id = 1')
    .get() as unknown as ConfigRow;
  return mapConfigRow(row);
}

export function getConfig(): SchedulerConfig {
  return stripRuntimeFields(getRuntimeConfig());
}

export function listProducts(): ProductItem[] {
  const rows = requireDb()
    .prepare('SELECT * FROM products ORDER BY sort_order DESC, created_at DESC')
    .all() as unknown as ProductRow[];
  return rows.map(mapProductRow);
}

export function listActiveProducts(): ProductItem[] {
  const rows = requireDb()
    .prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort_order DESC, created_at DESC')
    .all() as unknown as ProductRow[];
  return rows.map(mapProductRow);
}

export function getProduct(id: string): ProductItem | null {
  const row = requireDb()
    .prepare('SELECT * FROM products WHERE id = ?')
    .get(id) as unknown as ProductRow | undefined;
  return row ? mapProductRow(row) : null;
}

export function createProduct(item: ProductItem): ProductItem {
  return runTx((tx) => {
    const maxRow = tx
      .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM products')
      .get() as { max_order?: number } | undefined;
    const nextOrder = (Number(maxRow?.max_order) || 0) + 1;
    tx.prepare(
      `INSERT INTO products (
        id, name, caption, link, images_json, active, post_count, last_posted_at, created_at, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      item.id,
      item.name,
      item.caption,
      item.link ?? null,
      JSON.stringify(item.images),
      item.active ? 1 : 0,
      item.postCount,
      item.lastPostedAt,
      item.createdAt,
      nextOrder
    );
    return item;
  });
}

export function updateProduct(
  id: string,
  patch: {
    name?: string;
    caption?: string;
    link?: string | undefined;
    hasLinkField?: boolean;
    images?: string[];
    active?: boolean;
  }
): { product: ProductItem | null; autoStopped: boolean } {
  return runTx((tx) => {
    const row = tx
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(id) as unknown as ProductRow | undefined;
    if (!row) {
      return { product: null, autoStopped: false };
    }
    const existing = mapProductRow(row);
    const nextCaption = patch.caption !== undefined ? patch.caption : existing.caption;
    const nextName = patch.name !== undefined ? patch.name : existing.name;
    const nextLink = patch.hasLinkField ? patch.link : existing.link;
    const nextImages = patch.images !== undefined ? patch.images : existing.images;
    const nextActive = patch.active !== undefined ? patch.active : existing.active;

    tx.prepare(
      `UPDATE products SET name = ?, caption = ?, link = ?, images_json = ?, active = ? WHERE id = ?`
    ).run(
      nextName,
      nextCaption,
      nextLink ?? null,
      JSON.stringify(nextImages),
      nextActive ? 1 : 0,
      id
    );

    const activeRow = tx
      .prepare('SELECT COUNT(*) AS cnt FROM products WHERE active = 1')
      .get() as { cnt?: number } | undefined;
    const wasCfg = tx.prepare('SELECT enabled FROM config WHERE id = 1').get() as
      | { enabled?: number }
      | undefined;
    let autoStopped = false;
    if ((Number(activeRow?.cnt) || 0) === 0 && wasCfg?.enabled === 1) {
      tx.prepare("UPDATE config SET enabled = 0, scheduler_run_id = '' WHERE id = 1").run();
      autoStopped = true;
    }

    return {
      product: {
        ...existing,
        name: nextName,
        caption: nextCaption,
        link: nextLink,
        images: nextImages,
        active: nextActive,
      },
      autoStopped,
    };
  });
}

export function deleteProduct(id: string): {
  deleted: boolean;
  unreferencedUploadImages: string[];
  autoStopped: boolean;
  schedulerEnabled: boolean;
} {
  return runTx((tx) => {
    const row = tx
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(id) as unknown as ProductRow | undefined;
    if (!row) {
      const cfg = tx.prepare('SELECT enabled FROM config WHERE id = 1').get() as
        | { enabled?: number }
        | undefined;
      return {
        deleted: false,
        unreferencedUploadImages: [],
        autoStopped: false,
        schedulerEnabled: cfg?.enabled === 1,
      };
    }

    const dead = mapProductRow(row);
    tx.prepare('DELETE FROM products WHERE id = ?').run(id);
    tx.prepare('INSERT OR REPLACE INTO deleted_products (id, deleted_at) VALUES (?, ?)').run(
      id,
      new Date().toISOString()
    );

    const remainingRows = tx
      .prepare('SELECT images_json, active FROM products')
      .all() as Array<{ images_json: string; active: number }>;

    const stillReferenced = new Set<string>();
    let activeCount = 0;
    for (const r of remainingRows) {
      if (r.active === 1) activeCount++;
      try {
        const imgs = JSON.parse(r.images_json);
        if (Array.isArray(imgs)) {
          for (const img of imgs) {
            if (typeof img === 'string') stillReferenced.add(img);
          }
        }
      } catch {
        // ignore parse error
      }
    }

    const wasCfg = tx.prepare('SELECT enabled FROM config WHERE id = 1').get() as
      | { enabled?: number }
      | undefined;
    let autoStopped = false;
    let schedulerEnabled = wasCfg?.enabled === 1;
    if (activeCount === 0) {
      if (schedulerEnabled) autoStopped = true;
      schedulerEnabled = false;
      tx.prepare("UPDATE config SET enabled = 0, scheduler_run_id = '' WHERE id = 1").run();
    }

    const unreferencedUploadImages = dead.images.filter(
      (img) => img.startsWith('/uploads/') && !stillReferenced.has(img)
    );

    return { deleted: true, unreferencedUploadImages, autoStopped, schedulerEnabled };
  });
}

export function listGroups(): TelegramGroup[] {
  const rows = requireDb()
    .prepare('SELECT * FROM groups ORDER BY added_at DESC')
    .all() as unknown as GroupRow[];
  return rows.map(mapGroupRow);
}

export function listEnabledGroups(): TelegramGroup[] {
  const rows = requireDb()
    .prepare('SELECT * FROM groups WHERE enabled = 1 ORDER BY added_at DESC')
    .all() as unknown as GroupRow[];
  return rows.map(mapGroupRow);
}

export function getGroup(id: string): TelegramGroup | null {
  const row = requireDb()
    .prepare('SELECT * FROM groups WHERE id = ?')
    .get(id) as unknown as GroupRow | undefined;
  return row ? mapGroupRow(row) : null;
}

export function syncUserbotGroupsBatch(
  dialogs: Array<{
    chatId: string;
    title: string;
    username?: string;
    type: TelegramGroup['type'];
  }>
): number {
  return runTx((tx) => {
    let count = 0;
    const findStmt = tx.prepare('SELECT * FROM groups WHERE chat_id = ?');
    const updateStmt = tx.prepare(
      'UPDATE groups SET title = ?, username = COALESCE(?, username), type = ? WHERE chat_id = ?'
    );
    const insertStmt = tx.prepare(
      `INSERT INTO groups (
        id, chat_id, title, username, type, enabled, post_count, last_posted_at, last_error, added_via, added_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, NULL, NULL, 'userbot_sync', ?)`
    );

    const nowIso = new Date().toISOString();
    for (const d of dialogs) {
      const existing = findStmt.get(d.chatId) as unknown as GroupRow | undefined;
      if (existing) {
        updateStmt.run(d.title, d.username ?? null, d.type, d.chatId);
      } else {
        insertStmt.run(
          `grp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          d.chatId,
          d.title,
          d.username ?? null,
          d.type,
          nowIso
        );
      }
      count++;
    }
    return count;
  });
}

export function upsertGroupByChatId(params: {
  chatId: string;
  title: string;
  username?: string;
  type: TelegramGroup['type'];
  addedVia: 'auto' | 'manual';
  lastError?: string | null;
  defaultEnabled: boolean;
}): { created: boolean; group: TelegramGroup } {
  return runTx((tx) => {
    const existing = tx
      .prepare('SELECT * FROM groups WHERE chat_id = ?')
      .get(params.chatId) as unknown as GroupRow | undefined;

    if (existing) {
      tx.prepare(
        `UPDATE groups SET title = ?, username = COALESCE(?, username), type = ?, last_error = ? WHERE chat_id = ?`
      ).run(
        params.title || existing.title,
        params.username ?? null,
        params.type,
        params.lastError !== undefined ? params.lastError : null,
        params.chatId
      );
      const updated = tx
        .prepare('SELECT * FROM groups WHERE chat_id = ?')
        .get(params.chatId) as unknown as GroupRow;
      return { created: false, group: mapGroupRow(updated) };
    }

    const created: TelegramGroup = {
      id: `grp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      chatId: params.chatId,
      title: params.title,
      username: params.username,
      type: params.type,
      enabled: params.defaultEnabled,
      postCount: 0,
      lastPostedAt: null,
      lastError: params.lastError ?? null,
      addedVia: params.addedVia,
      addedAt: new Date().toISOString(),
    };
    tx.prepare(
      `INSERT INTO groups (
        id, chat_id, title, username, type, enabled, post_count, last_posted_at, last_error, added_via, added_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`
    ).run(
      created.id,
      created.chatId,
      created.title,
      created.username ?? null,
      created.type,
      created.enabled ? 1 : 0,
      created.lastError,
      created.addedVia,
      created.addedAt
    );
    return { created: true, group: created };
  });
}

export function markGroupRemoved(chatId: string, reason: string): void {
  requireDb()
    .prepare('UPDATE groups SET enabled = 0, last_error = ? WHERE chat_id = ?')
    .run(reason, chatId);
}

export function updateGroup(
  id: string,
  patch: { enabled?: boolean; title?: string }
): TelegramGroup | null {
  return runTx((tx) => {
    const row = tx
      .prepare('SELECT * FROM groups WHERE id = ?')
      .get(id) as unknown as GroupRow | undefined;
    if (!row) return null;
    const nextEnabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : row.enabled;
    const nextTitle = patch.title !== undefined ? patch.title.trim() || row.title : row.title;
    tx.prepare('UPDATE groups SET enabled = ?, title = ? WHERE id = ?').run(
      nextEnabled,
      nextTitle,
      id
    );
    const updated = tx.prepare('SELECT * FROM groups WHERE id = ?').get(id) as unknown as GroupRow;
    return mapGroupRow(updated);
  });
}

export function deleteGroup(id: string): void {
  requireDb().prepare('DELETE FROM groups WHERE id = ?').run(id);
}

export function listLogs(limit = 200): PostLog[] {
  const rows = requireDb()
    .prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as unknown as LogRow[];
  return rows.map(mapLogRow);
}

export function clearLogs(): void {
  requireDb().prepare('DELETE FROM logs').run();
}

export function recordSendResult(params: {
  productId: string;
  productName: string;
  groupId: string;
  groupTitle: string;
  status: PostLog['status'];
  message: string;
  telegramMessageId?: number;
}): void {
  runTx((tx) => {
    const nowIso = new Date().toISOString();
    if (params.status === 'success') {
      tx.prepare(
        'UPDATE products SET post_count = post_count + 1, last_posted_at = ? WHERE id = ?'
      ).run(nowIso, params.productId);
      tx.prepare(
        'UPDATE groups SET post_count = post_count + 1, last_posted_at = ?, last_error = NULL WHERE id = ?'
      ).run(nowIso, params.groupId);
    } else if (params.status === 'error') {
      tx.prepare('UPDATE groups SET last_error = ? WHERE id = ?').run(
        params.message,
        params.groupId
      );
    }

    const logId = `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    tx.prepare(
      `INSERT INTO logs (
        id, timestamp, product_id, product_name, group_id, group_title, status, message, telegram_message_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      logId,
      nowIso,
      params.productId,
      params.productName,
      params.groupId,
      params.groupTitle,
      params.status,
      params.message,
      params.telegramMessageId ?? null
    );

    tx.prepare(
      `DELETE FROM logs WHERE id NOT IN (
        SELECT id FROM logs ORDER BY timestamp DESC LIMIT 200
      )`
    ).run();
  });
}

export function toggleScheduler(desiredEnabled: boolean): {
  error?: string;
  config: SchedulerConfig;
} {
  return runTx((tx) => {
    const activeRow = tx
      .prepare('SELECT COUNT(*) AS cnt FROM products WHERE active = 1')
      .get() as { cnt?: number } | undefined;
    const activeCount = Number(activeRow?.cnt) || 0;
    const curRow = tx.prepare('SELECT * FROM config WHERE id = 1').get() as unknown as ConfigRow;
    const current = mapConfigRow(curRow);

    if (desiredEnabled && activeCount === 0) {
      tx.prepare("UPDATE config SET enabled = 0, scheduler_run_id = '' WHERE id = 1").run();
      return {
        error:
          'কোনো সক্রিয় পোস্ট তৈরি করা নেই! আগে "পোস্ট" ট্যাব থেকে অন্তত ১টি পোস্ট তৈরি করুন, তারপর Start দিন।',
        config: { ...stripRuntimeFields(current), enabled: false },
      };
    }

    if (!desiredEnabled) {
      tx.prepare("UPDATE config SET enabled = 0, scheduler_run_id = '' WHERE id = 1").run();
      const updated = tx.prepare('SELECT * FROM config WHERE id = 1').get() as unknown as ConfigRow;
      return { config: stripRuntimeFields(mapConfigRow(updated)) };
    }

    const newRunId = crypto.randomBytes(8).toString('hex');
    const intervalMs = Math.max(5, current.intervalMinutes) * 60 * 1000;
    const lastRunMs = current.lastRunAt ? Date.parse(current.lastRunAt) : 0;
    const now = Date.now();

    // If never posted yet OR last round was >= interval ago, run first round in 5s instead of waiting another full interval
    const nextRunMs =
      !lastRunMs || Number.isNaN(lastRunMs) || now - lastRunMs >= intervalMs
        ? now + 5000
        : lastRunMs + intervalMs;
    const nextRunIso = new Date(nextRunMs).toISOString();

    tx.prepare('UPDATE config SET enabled = 1, scheduler_run_id = ?, next_run_at = ? WHERE id = 1').run(
      newRunId,
      nextRunIso
    );
    const updated = tx.prepare('SELECT * FROM config WHERE id = 1').get() as unknown as ConfigRow;
    return { config: stripRuntimeFields(mapConfigRow(updated)) };
  });
}

export function updateConfigSettings(body: Partial<SchedulerConfig>): SchedulerConfig {
  return runTx((tx) => {
    const curRow = tx.prepare('SELECT * FROM config WHERE id = 1').get() as unknown as ConfigRow;
    const current = mapConfigRow(curRow);
    const activeRow = tx
      .prepare('SELECT COUNT(*) AS cnt FROM products WHERE active = 1')
      .get() as { cnt?: number } | undefined;
    const activeCount = Number(activeRow?.cnt) || 0;

    // Never allow settings save to turn enabled ON; only explicit Stop or 0 active posts turns it OFF
    const nextEnabled =
      body.enabled === false || activeCount === 0 ? false : current.enabled;
    const nextRunId = nextEnabled ? current.schedulerRunId : '';

    const postingMode =
      body.postingMode === 'bot'
        ? 'bot'
        : body.postingMode === 'userbot'
        ? 'userbot'
        : current.postingMode;
    const intervalMinutes = Math.max(
      5,
      Number(body.intervalMinutes ?? current.intervalMinutes) || 150
    );
    const delayBetweenGroupsSec = Math.max(
      1,
      Math.min(180, Number(body.delayBetweenGroupsSec ?? current.delayBetweenGroupsSec) || 60)
    );
    const activeHoursEnabled =
      body.activeHoursEnabled !== undefined
        ? Boolean(body.activeHoursEnabled)
        : current.activeHoursEnabled;
    const activeStartHour = Math.max(
      0,
      Math.min(23, Number(body.activeStartHour ?? current.activeStartHour))
    );
    const activeEndHour = Math.max(
      0,
      Math.min(23, Number(body.activeEndHour ?? current.activeEndHour))
    );
    const rotationMode =
      body.rotationMode === 'all_active' || body.rotationMode === 'random' || body.rotationMode === 'sequential'
        ? body.rotationMode
        : current.rotationMode;
    const sellerContactUrl =
      body.sellerContactUrl !== undefined ? String(body.sellerContactUrl) : current.sellerContactUrl;
    const buttonText =
      body.buttonText !== undefined ? String(body.buttonText) : current.buttonText;
    const appendFooterTag =
      body.appendFooterTag !== undefined
        ? Boolean(body.appendFooterTag)
        : current.appendFooterTag;
    const footerText =
      body.footerText !== undefined ? String(body.footerText) : current.footerText;

    let nextRunAt = current.nextRunAt;
    const now = Date.now();
    if (!nextRunAt) {
      nextRunAt = new Date(now + intervalMinutes * 60 * 1000).toISOString();
    } else if (intervalMinutes !== current.intervalMinutes) {
      const lastRunMs = current.lastRunAt ? Date.parse(current.lastRunAt) : 0;
      const candidate = lastRunMs
        ? lastRunMs + intervalMinutes * 60 * 1000
        : now + intervalMinutes * 60 * 1000;
      nextRunAt = new Date(Math.max(now + 5000, candidate)).toISOString();
    } else if (current.activeHoursEnabled && !activeHoursEnabled && nextEnabled) {
      // User just turned OFF active-hours restriction while enabled -> allow overdue round right away
      const lastRunMs = current.lastRunAt ? Date.parse(current.lastRunAt) : 0;
      if (!lastRunMs || now - lastRunMs >= intervalMinutes * 60 * 1000) {
        nextRunAt = new Date(now + 5000).toISOString();
      }
    }

    tx.prepare(
      `UPDATE config SET
        enabled = ?, scheduler_run_id = ?, posting_mode = ?, interval_minutes = ?,
        delay_between_groups_sec = ?, active_hours_enabled = ?, active_start_hour = ?,
        active_end_hour = ?, rotation_mode = ?, seller_contact_url = ?, button_text = ?,
        append_footer_tag = ?, footer_text = ?, next_run_at = ?
       WHERE id = 1`
    ).run(
      nextEnabled ? 1 : 0,
      nextRunId,
      postingMode,
      intervalMinutes,
      delayBetweenGroupsSec,
      activeHoursEnabled ? 1 : 0,
      activeStartHour,
      activeEndHour,
      rotationMode,
      sellerContactUrl,
      buttonText,
      appendFooterTag ? 1 : 0,
      footerText,
      nextRunAt
    );

    const updated = tx.prepare('SELECT * FROM config WHERE id = 1').get() as unknown as ConfigRow;
    return stripRuntimeFields(mapConfigRow(updated));
  });
}

export function setNextRunAt(nextRunIso: string): void {
  requireDb().prepare('UPDATE config SET next_run_at = ? WHERE id = 1').run(nextRunIso);
}

export function disableSchedulerInDb(): void {
  requireDb().prepare("UPDATE config SET enabled = 0, scheduler_run_id = '' WHERE id = 1").run();
}

export function setRotationIndex(nextIndex: number): void {
  requireDb().prepare('UPDATE config SET rotation_index = ? WHERE id = 1').run(nextIndex);
}

export function finishBroadcastTimestamps(lastRunIso: string, intervalMinutes: number): void {
  runTx((tx) => {
    const row = tx.prepare('SELECT enabled FROM config WHERE id = 1').get() as
      | { enabled?: number }
      | undefined;
    if (row?.enabled === 1) {
      const nextIso = new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
      tx.prepare('UPDATE config SET last_run_at = ?, next_run_at = ? WHERE id = 1').run(
        lastRunIso,
        nextIso
      );
    } else {
      tx.prepare('UPDATE config SET last_run_at = ? WHERE id = 1').run(lastRunIso);
    }
  });
}

export function isRunStillActive(expectedRunId: string, productId: string): boolean {
  const database = requireDb();
  const cfg = database
    .prepare('SELECT enabled, scheduler_run_id FROM config WHERE id = 1')
    .get() as { enabled?: number; scheduler_run_id?: string } | undefined;
  if (!cfg || cfg.enabled !== 1) return false;
  if (expectedRunId && cfg.scheduler_run_id !== expectedRunId) return false;

  const prod = database
    .prepare('SELECT active FROM products WHERE id = ?')
    .get(productId) as { active?: number } | undefined;
  return Boolean(prod && prod.active === 1);
}

export function getFullState(): {
  products: ProductItem[];
  groups: TelegramGroup[];
  config: SchedulerConfig;
  logs: PostLog[];
} {
  return {
    products: listProducts(),
    groups: listGroups(),
    config: getConfig(),
    logs: listLogs(200),
  };
}

export function resetDatabase(scope: 'posts' | 'groups' | 'all'): void {
  runTx((tx) => {
    if (scope === 'posts' || scope === 'all') {
      tx.exec('DELETE FROM products; DELETE FROM deleted_products; DELETE FROM logs;');
      tx.prepare(
        "UPDATE config SET enabled = 0, scheduler_run_id = '', last_run_at = NULL, rotation_index = 0 WHERE id = 1"
      ).run();
    }
    if (scope === 'groups' || scope === 'all') {
      tx.exec('DELETE FROM groups;');
    }
    if (scope === 'all') {
      tx.prepare("DELETE FROM kv_meta WHERE key = 'user_session_string'").run();
      const def = defaultConfigValues();
      tx.prepare(
        `UPDATE config SET
          enabled = 0, scheduler_run_id = '', posting_mode = ?, interval_minutes = ?,
          delay_between_groups_sec = ?, active_hours_enabled = ?, active_start_hour = ?,
          active_end_hour = ?, rotation_mode = ?, seller_contact_url = ?, button_text = ?,
          append_footer_tag = ?, footer_text = ?, next_run_at = ?, last_run_at = NULL, rotation_index = 0
         WHERE id = 1`
      ).run(
        def.postingMode,
        def.intervalMinutes,
        def.delayBetweenGroupsSec,
        def.activeHoursEnabled ? 1 : 0,
        def.activeStartHour,
        def.activeEndHour,
        def.rotationMode,
        def.sellerContactUrl,
        def.buttonText,
        def.appendFooterTag ? 1 : 0,
        def.footerText,
        def.nextRunAt
      );
    }
  });
}

export function tryAcquireSchedulerLease(ownerId: string, ttlMs = 120_000): boolean {
  return runTx((tx) => {
    const now = Date.now();
    const row = tx
      .prepare("SELECT value FROM kv_meta WHERE key = 'scheduler_lease'")
      .get() as { value?: string } | undefined;
    if (row?.value) {
      try {
        const parsed = JSON.parse(row.value) as { owner?: string; expiresAt?: number };
        if (parsed.owner && parsed.owner !== ownerId && (parsed.expiresAt ?? 0) > now) {
          return false;
        }
      } catch {
        // overwrite malformed lease
      }
    }
    tx.prepare("INSERT OR REPLACE INTO kv_meta (key, value) VALUES ('scheduler_lease', ?)").run(
      JSON.stringify({ owner: ownerId, expiresAt: now + ttlMs })
    );
    return true;
  });
}

export function renewSchedulerLease(ownerId: string, ttlMs = 120_000): void {
  runTx((tx) => {
    const now = Date.now();
    const row = tx
      .prepare("SELECT value FROM kv_meta WHERE key = 'scheduler_lease'")
      .get() as { value?: string } | undefined;
    if (!row?.value) return;
    try {
      const parsed = JSON.parse(row.value) as { owner?: string };
      if (parsed.owner === ownerId) {
        tx.prepare("INSERT OR REPLACE INTO kv_meta (key, value) VALUES ('scheduler_lease', ?)").run(
          JSON.stringify({ owner: ownerId, expiresAt: now + ttlMs })
        );
      }
    } catch {
      // ignore
    }
  });
}

export function releaseSchedulerLease(ownerId: string): void {
  runTx((tx) => {
    const row = tx
      .prepare("SELECT value FROM kv_meta WHERE key = 'scheduler_lease'")
      .get() as { value?: string } | undefined;
    if (!row?.value) return;
    try {
      const parsed = JSON.parse(row.value) as { owner?: string };
      if (parsed.owner === ownerId) {
        tx.prepare("DELETE FROM kv_meta WHERE key = 'scheduler_lease'").run();
      }
    } catch {
      tx.prepare("DELETE FROM kv_meta WHERE key = 'scheduler_lease'").run();
    }
  });
}
