// src/types/index.ts

export type Mode = 'general' | 'tutor' | 'practice' | 'translate';
export type Speaker = 'ai' | 'caller';

export interface Caller {
  id: string;
  phone_number: string;
  nickname: string | null;
  default_language: string;
  preferred_mode: Mode;
  consent_memory: boolean;
  consent_sms: boolean;
  created_at: Date;
  last_seen_at: Date;
}

export interface Session {
  id: string;
  caller_id: string;
  call_sid: string;
  mode: Mode;
  detected_language: string;
  selected_language: string;
  started_at: Date;
  ended_at: Date | null;
  duration_seconds: number | null;
  summary: string | null;
  estimated_cost: number;
}

export interface Turn {
  id: string;
  session_id: string;
  speaker: Speaker;
  transcript: string;
  language: string;
  timestamp: Date;
  confidence_score: number | null;
  latency_ms: number | null;
}

// Live call state kept in Redis
export interface CallState {
  callSid: string;
  callerId: string;
  sessionId: string;
  language: string;
  mode: Mode;
  turnCount: number;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  startedAt: number;
  nickname: string | null;
  // set to true once caller has gone through welcome
  welcomed: boolean;
}
