// src/config/index.ts
import 'dotenv/config';

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  publicUrl: required('PUBLIC_URL'),

  twilio: {
    accountSid: required('TWILIO_ACCOUNT_SID'),
    authToken: required('TWILIO_AUTH_TOKEN'),
    phoneNumber: required('TWILIO_PHONE_NUMBER'),
  },

  openai: {
    apiKey: required('OPENAI_API_KEY'),
    sttModel: 'whisper-1',
    chatModel: 'gpt-4o',
    ttsModel: 'tts-1',
    // Available voices: alloy, echo, fable, onyx, nova, shimmer
    ttsVoice: 'nova',
  },

  db: {
    url: required('DATABASE_URL'),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  defaults: {
    language: process.env.DEFAULT_LANGUAGE || 'en',
    maxCallSeconds: parseInt(process.env.MAX_CALL_SECONDS || '1800'),
  },
};
