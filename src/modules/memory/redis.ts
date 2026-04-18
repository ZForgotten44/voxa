// src/modules/memory/redis.ts
import Redis from 'ioredis';
import { config } from '../../config';
import type { CallState } from '../../types';

export const redis = new Redis(config.redis.url, { lazyConnect: true, maxRetriesPerRequest: 3 });

const TTL = 7200; // 2 hours — covers any call

export async function saveCallState(callSid: string, state: CallState): Promise<void> {
  await redis.set(`call:${callSid}`, JSON.stringify(state), 'EX', TTL);
}

export async function getCallState(callSid: string): Promise<CallState | null> {
  const raw = await redis.get(`call:${callSid}`);
  return raw ? JSON.parse(raw) : null;
}

export async function deleteCallState(callSid: string): Promise<void> {
  await redis.del(`call:${callSid}`);
}

export async function updateCallState(callSid: string, patch: Partial<CallState>): Promise<CallState | null> {
  const state = await getCallState(callSid);
  if (!state) return null;
  const updated = { ...state, ...patch };
  await saveCallState(callSid, updated);
  return updated;
}
