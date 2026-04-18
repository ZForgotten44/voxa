// src/modules/memory/callers.ts
import { query, queryOne } from '../../db';
import type { Caller, Session, Mode } from '../../types';

export async function findOrCreateCaller(phoneNumber: string): Promise<Caller> {
  const existing = await queryOne<Caller>(
    'SELECT * FROM callers WHERE phone_number = $1', [phoneNumber]
  );
  if (existing) {
    await query('UPDATE callers SET last_seen_at = NOW() WHERE id = $1', [existing.id]);
    return existing;
  }
  const [created] = await query<Caller>(
    `INSERT INTO callers (phone_number) VALUES ($1) RETURNING *`, [phoneNumber]
  );
  return created;
}

export async function getCaller(id: string): Promise<Caller | null> {
  return queryOne<Caller>('SELECT * FROM callers WHERE id = $1', [id]);
}

export async function createSession(callerId: string, callSid: string, mode: Mode, language: string): Promise<Session> {
  const [session] = await query<Session>(
    `INSERT INTO sessions (caller_id, call_sid, mode, detected_language, selected_language)
     VALUES ($1, $2, $3, $4, $4) RETURNING *`,
    [callerId, callSid, mode, language]
  );
  return session;
}

export async function endSession(callSid: string, summary: string, durationSeconds: number): Promise<void> {
  // rough cost: $0.013/min voice + $0.006/min STT + $0.02/1K tokens estimate
  const mins = durationSeconds / 60;
  const estimatedCost = (mins * 0.013) + (mins * 0.006) + 0.04;
  await query(
    `UPDATE sessions SET ended_at = NOW(), duration_seconds = $1, summary = $2,
     estimated_cost = $3, success_status = 'completed'
     WHERE call_sid = $4`,
    [durationSeconds, summary, estimatedCost.toFixed(4), callSid]
  );
}

export async function saveTurn(
  sessionId: string, speaker: 'ai' | 'caller',
  transcript: string, language: string,
  latencyMs?: number
): Promise<void> {
  await query(
    `INSERT INTO turns (session_id, speaker, transcript, language, latency_ms)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, speaker, transcript, language, latencyMs ?? null]
  );
}

export async function getRecentSummary(callerId: string): Promise<string | null> {
  const row = await queryOne<{ summary: string; ended_at: Date }>(
    `SELECT summary, ended_at FROM sessions
     WHERE caller_id = $1 AND summary IS NOT NULL
     ORDER BY ended_at DESC LIMIT 1`,
    [callerId]
  );
  return row?.summary ?? null;
}
