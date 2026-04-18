// src/modules/tts/index.ts
import OpenAI from 'openai';
import { config } from '../../config';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// Map language codes to voices that sound most natural for that language
const VOICE_MAP: Record<string, string> = {
  ar: 'nova',    // Arabic — warm female
  bn: 'shimmer', // Bengali
  hi: 'nova',    // Hindi
  ha: 'alloy',   // Hausa
  sw: 'alloy',   // Swahili
  id: 'shimmer', // Indonesian
  fil: 'nova',   // Filipino
  en: 'nova',    // English
  fr: 'nova',    // French
  pt: 'shimmer', // Portuguese
  es: 'nova',    // Spanish
  ur: 'nova',    // Urdu
};

function getVoice(language: string): string {
  return VOICE_MAP[language] ?? config.openai.ttsVoice;
}

/**
 * Convert text to speech using OpenAI TTS.
 * Returns a Buffer containing raw mulaw audio at 8kHz
 * (Twilio expects mulaw 8-bit 8kHz mono).
 */
export async function synthesizeSpeech(text: string, language: string): Promise<Buffer> {
  if (!text.trim()) return Buffer.alloc(0);

  const voice = getVoice(language) as any;

  // OpenAI TTS returns mp3 by default — we request pcm for easier conversion
  const response = await openai.audio.speech.create({
    model: config.openai.ttsModel,
    voice,
    input: text,
    response_format: 'pcm', // 24kHz signed 16-bit PCM
  });

  const pcm24k = Buffer.from(await response.arrayBuffer());

  // Downsample 24kHz 16-bit PCM → 8kHz 8-bit mulaw for Twilio
  return convertPcmToMulaw8k(pcm24k);
}

/**
 * Downsample 24kHz 16-bit PCM to 8kHz 8-bit mulaw.
 * Simple drop-every-3rd-sample downsampling (good enough for voice).
 */
function convertPcmToMulaw8k(pcm24k: Buffer): Buffer {
  // 24000 / 8000 = 3 — take every 3rd sample
  const ratio = 3;
  const sampleCount24k = Math.floor(pcm24k.length / 2); // 16-bit samples
  const outCount = Math.floor(sampleCount24k / ratio);
  const mulaw = Buffer.alloc(outCount);

  for (let i = 0; i < outCount; i++) {
    const srcIdx = i * ratio * 2; // byte offset in pcm24k
    const sample = pcm24k.readInt16LE(srcIdx);
    mulaw[i] = linearToMulaw(sample);
  }

  return mulaw;
}

/**
 * ITU-T G.711 linear PCM to mulaw encoding.
 */
function linearToMulaw(sample: number): number {
  const MULAW_BIAS = 33;
  const MULAW_MAX = 0x1FFF;

  let sign = 0;
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }
  sample += MULAW_BIAS;
  if (sample > MULAW_MAX) sample = MULAW_MAX;

  let exponent = 7;
  for (let expMask = 0x1000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }
  const mantissa = (sample >> (exponent + 1)) & 0x0F;
  return ~(sign | (exponent << 4) | mantissa) & 0xFF;
}
