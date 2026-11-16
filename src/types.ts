export interface ProductItem {
  id: string;
  name: string;
  caption: string;
  link?: string;
  images: string[];
  active: boolean;
  postCount: number;
  lastPostedAt: string | null;
  createdAt: string;
}

export interface TelegramGroup {
  id: string;
  chatId: string;
  title: string;
  username?: string;
  type: 'group' | 'supergroup' | 'channel';
  enabled: boolean;
  postCount: number;
  lastPostedAt: string | null;
  lastError: string | null;
  addedVia: 'auto' | 'manual' | 'userbot_sync';
  addedAt: string;
}

export type RotationMode = 'sequential' | 'all_active' | 'random';
export type PostingMode = 'userbot' | 'bot';

export interface SchedulerConfig {
  enabled: boolean;
  postingMode: PostingMode;
  intervalMinutes: number;
  delayBetweenGroupsSec: number;
  activeHoursEnabled: boolean;
  activeStartHour: number;
  activeEndHour: number;
  rotationMode: RotationMode;
  sellerContactUrl: string;
  buttonText: string;
  appendFooterTag: boolean;
  footerText: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  rotationIndex: number;
}

export interface PostLog {
  id: string;
  timestamp: string;
  productId: string;
  productName: string;
  groupId: string;
  groupTitle: string;
  status: 'success' | 'error' | 'dry_run';
  message: string;
  telegramMessageId?: number;
}

export interface BotInfo {
  id: number;
  first_name: string;
  username: string;
}

export interface BotStatus {
  tokenConfigured: boolean;
  connected: boolean;
  botInfo: BotInfo | null;
  pollingActive: boolean;
  lastPollError: string | null;
}

export type UserbotAuthStep = 'idle' | 'code_sent' | 'password_required' | 'connected';

export interface UserbotUserInfo {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone?: string;
}

export interface UserbotStatus {
  apiConfigured: boolean;
  connected: boolean;
  authStep: UserbotAuthStep;
  pendingPhone: string | null;
  user: UserbotUserInfo | null;
  lastError: string | null;
}

export interface AppStateResponse {
  botStatus: BotStatus;
  userbotStatus: UserbotStatus;
  products: ProductItem[];
  groups: TelegramGroup[];
  config: SchedulerConfig;
  logs: PostLog[];
  isBroadcasting: boolean;
}
