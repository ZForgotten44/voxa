// scripts/migrate.ts
import 'dotenv/config';
import { db } from '../src/db';

const SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS callers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number      VARCHAR(20) UNIQUE NOT NULL,
  nickname          VARCHAR(80),
  default_language  CHAR(10) NOT NULL DEFAULT 'en',
  preferred_mode    VARCHAR(20) NOT NULL DEFAULT 'general',
  consent_memory    BOOLEAN NOT NULL DEFAULT false,
  consent_sms       BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id          UUID NOT NULL REFERENCES callers(id),
  call_sid           VARCHAR(64) UNIQUE NOT NULL,
  mode               VARCHAR(20) NOT NULL DEFAULT 'general',
  detected_language  CHAR(10),
  selected_language  CHAR(10),
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at           TIMESTAMPTZ,
  duration_seconds   INTEGER,
  summary            TEXT,
  estimated_cost     NUMERIC(10,4) DEFAULT 0,
  success_status     VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS turns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES sessions(id),
  speaker          VARCHAR(10) NOT NULL,
  transcript       TEXT NOT NULL,
  language         CHAR(10),
  timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence_score FLOAT,
  latency_ms       INTEGER
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id       UUID NOT NULL REFERENCES callers(id),
  lesson_type     VARCHAR(40),
  topic           VARCHAR(120),
  level           INTEGER DEFAULT 1,
  mastery_score   FLOAT DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  next_topic      VARCHAR(120),
  UNIQUE(caller_id, topic)
);

CREATE TABLE IF NOT EXISTS followup_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id   UUID NOT NULL REFERENCES callers(id),
  session_id  UUID NOT NULL REFERENCES sessions(id),
  sms_body    TEXT NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending',
  sent_at     TIMESTAMPTZ,
  twilio_sid  VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS preferences (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id           UUID NOT NULL UNIQUE REFERENCES callers(id),
  speech_rate         FLOAT DEFAULT 1.0,
  verbosity           VARCHAR(20) DEFAULT 'normal',
  correction_style    VARCHAR(20) DEFAULT 'gentle',
  bilingual_support   BOOLEAN DEFAULT true,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_caller ON sessions(caller_id);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_callsid ON sessions(call_sid);
`;

async function migrate() {
  console.log('Running migrations...');
  await db.query(SQL);
  console.log('✓ All tables created');
  await db.end();
}

migrate().catch(err => { console.error(err); process.exit(1); });
