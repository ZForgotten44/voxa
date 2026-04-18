// src/modules/stt/index.ts
import OpenAI from 'openai';
import { Readable } from 'stream';
import { config } from '../../config';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export interface TranscriptionResult {
  text: string;
  language: string; // detected BCP-47 language code
  confidence: number;
  durationMs: number;
}

/**
 * Transcribe raw audio buffer (mulaw 8kHz from Twilio) using Whisper.
 * Twilio sends 8-bit mulaw. We send it as a .wav with the right header.
 */
export async function transcribeAudio(audioBuffer: Buffer, hintLanguage?: string): Promise<TranscriptionResult> {
  const start = Date.now();

  // Build a minimal WAV header for 8kHz mulaw mono
  const wavBuffer = buildMulawWav(audioBuffer);
  const file = new File([wavBuffer], 'audio.wav', { type: 'audio/wav' });

  const params: any = {
    model: config.openai.sttModel,
    file,
    response_format: 'verbose_json',
  };
  // Give Whisper a hint if we know the language
  if (hintLanguage && hintLanguage !== 'auto') {
    params.language = hintLanguage;
  }

  try {
    const result = await (openai.audio.transcriptions.create as any)(params) as any;
    const text = (result.text ?? '').trim();
    const detectedLang = result.language ?? hintLanguage ?? 'en';
    const avgLogprob = result.segments?.[0]?.avg_logprob ?? -0.5;
    // Convert log probability to 0-1 confidence
    const confidence = Math.min(1, Math.max(0, Math.exp(avgLogprob)));

    return {
      text,
      language: normalizeLangCode(detectedLang),
      confidence,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    console.error('[STT] Whisper error:', err.message);
    return { text: '', language: hintLanguage ?? 'en', confidence: 0, durationMs: Date.now() - start };
  }
}

// Whisper returns full language names like "arabic" — map to BCP-47
function normalizeLangCode(lang: string): string {
  const map: Record<string, string> = {
    arabic: 'ar', bengali: 'bn', hindi: 'hi', hausa: 'ha',
    swahili: 'sw', indonesian: 'id', tagalog: 'fil', filipino: 'fil',
    english: 'en', french: 'fr', portuguese: 'pt', spanish: 'es',
    urdu: 'ur', amharic: 'am', yoruba: 'yo', somali: 'so',
    persian: 'fa', turkish: 'tr', chinese: 'zh', russian: 'ru',
  };
  const lower = lang.toLowerCase();
  return map[lower] ?? (lower.length <= 3 ? lower : 'en');
}

/**
 * Build a WAV file from raw mulaw 8kHz mono data.
 * Twilio Media Streams sends 8-bit mulaw, 8000 Hz, mono.
 */
function buildMulawWav(pcmData: Buffer): Buffer {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 8;
  const audioFormat = 7; // PCM mulaw
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;

  const buffer = Buffer.alloc(headerSize + dataSize);
  let offset = 0;

  const write = (str: string) => { buffer.write(str, offset, 'ascii'); offset += str.length; };
  const writeUInt16 = (v: number) => { buffer.writeUInt16LE(v, offset); offset += 2; };
  const writeUInt32 = (v: number) => { buffer.writeUInt32LE(v, offset); offset += 4; };

  write('RIFF');
  writeUInt32(36 + dataSize);
  write('WAVE');
  write('fmt ');
  writeUInt32(16);
  writeUInt16(audioFormat);
  writeUInt16(numChannels);
  writeUInt32(sampleRate);
  writeUInt32(byteRate);
  writeUInt16(blockAlign);
  writeUInt16(bitsPerSample);
  write('data');
  writeUInt32(dataSize);
  pcmData.copy(buffer, headerSize);

  return buffer;
}
