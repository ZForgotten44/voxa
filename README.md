# Global Dial-In AI

A phone-call-based multilingual AI assistant. Users call a normal phone number, speak in their native language, and get real-time AI responses spoken back to them.

## How it works

```
Caller dials number
      ↓
Twilio answers the call
      ↓
WebSocket streams audio to this server
      ↓
OpenAI Whisper transcribes speech (any language)
      ↓
GPT-4o generates a response (in the caller's language)
      ↓
OpenAI TTS speaks the response
      ↓
Audio streams back into the call
      ↓
Caller hears the AI response (~1.5s latency)
```

## Quick start

```bash
npm install
cp .env.example .env
# fill in your API keys
npm run db:migrate
npm run dev
```

See DEPLOY.md for full production deployment to Railway.

## Project structure

```
src/
  modules/
    telephony/      Twilio webhook handlers + WebSocket route
    media-bridge/   Real-time audio streaming (core of the call)
    stt/            Whisper speech-to-text
    tts/            OpenAI text-to-speech + mulaw conversion
    orchestrator/   GPT-4o + mode routing + language detection
    memory/
      callers.ts    Postgres: caller profiles, sessions, turns
      redis.ts      Redis: live call state
    sms/            Post-call SMS via Twilio
  prompts/          Modular prompt templates per mode
  db/               Postgres connection
  config/           Environment variables
  types/            TypeScript interfaces
scripts/
  migrate.ts        Database setup
```

## Supported modes

| # | Mode | What it does |
|---|------|-------------|
| A | General AI | Answers any question in the caller's language |
| B | Tutor | Teaches topics step by step with comprehension checks |
| C | Language Practice | Bilingual speaking coach |
| D | Translation | Translates phrases and explains meaning |

## Environment variables

See `.env.example` for all required variables.

## Stack

- **Backend**: Node.js + TypeScript + Fastify
- **Telephony**: Twilio Voice + Media Streams
- **STT**: OpenAI Whisper
- **LLM**: OpenAI GPT-4o
- **TTS**: OpenAI TTS (nova voice)
- **Database**: PostgreSQL (Supabase)
- **Cache**: Redis (Railway)
- **Deploy**: Railway
