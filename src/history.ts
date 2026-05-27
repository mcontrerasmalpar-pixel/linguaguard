import type { Context } from '@devvit/public-api';
import type { ModDecision } from './types.js';

const HISTORY_KEY = (subreddit: string, author: string) =>
  `history:${subreddit}:${author}`;

const MAX_ENTRIES = 10;
const HISTORY_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export async function recordDecision(
  redis: Context['redis'],
  subreddit: string,
  author: string,
  decision: ModDecision
) {
  const key = HISTORY_KEY(subreddit, author);
  const existing = await redis.get(key);
  const entries: ModDecision[] = existing ? (JSON.parse(existing) as ModDecision[]) : [];
  entries.unshift(decision); // newest first
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  await redis.set(key, JSON.stringify(entries), {
    expiration: new Date(Date.now() + HISTORY_TTL_MS),
  });
}

export async function getAuthorHistory(
  redis: Context['redis'],
  subreddit: string,
  author: string
): Promise<ModDecision[]> {
  const raw = await redis.get(HISTORY_KEY(subreddit, author));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ModDecision[];
  } catch {
    return [];
  }
}

export function countRemovals(history: ModDecision[]): number {
  return history.filter(d => d.action === 'remove' || d.action === 'remove_dm').length;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
