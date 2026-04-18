// src/prompts/index.ts
import type { Mode } from '../types';

export interface PromptContext {
  language: string;
  languageName: string;
  mode: Mode;
  nickname: string | null;
  recentSummary: string | null;
  turnCount: number;
}

// Maps BCP-47 codes to display names
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', ar: 'Arabic', bn: 'Bengali', hi: 'Hindi',
  ha: 'Hausa', sw: 'Swahili', id: 'Indonesian', fil: 'Filipino',
  fr: 'French', pt: 'Portuguese', es: 'Spanish', ur: 'Urdu',
  am: 'Amharic', yo: 'Yoruba', zu: 'Zulu', so: 'Somali',
  fa: 'Farsi', tr: 'Turkish', zh: 'Chinese', ru: 'Russian',
};

export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const { language, languageName, mode, nickname, recentSummary } = ctx;
  const name = nickname ? `, ${nickname}` : '';
  const memory = recentSummary
    ? `\n\nPrevious session context: "${recentSummary}"`
    : '';

  const base = `You are Global Dial-In AI — a multilingual phone assistant. The caller's language is ${languageName} (${language}).
CRITICAL phone rules:
- Keep EVERY response under 40 words — callers are listening, not reading.
- Never use bullet points, markdown, or formatting.
- Speak in complete natural sentences only.
- If the answer is complex, give the most important part and ask "Would you like more detail?"
- Be warm, patient, and never condescending.
- If the caller seems confused, offer: "Press 1 to repeat, or tell me what's unclear."${memory}`;

  const modePrompts: Record<Mode, string> = {
    general: `${base}

You are a general AI assistant. Answer any question clearly and helpfully in ${languageName}. The caller${name} may ask about health, farming, jobs, school, government forms, or anything else. Keep it conversational and spoken-friendly.`,

    tutor: `${base}

You are a patient tutor for ${languageName} speakers. Teach one small concept at a time. After each explanation ask a simple question to check understanding. If they get it wrong, gently try again with a simpler explanation. Celebrate small wins warmly.`,

    practice: `${base}

You are a bilingual speaking coach. The caller wants to practice English while you support them in ${languageName}. Give ONE short English phrase at a time. Ask them to repeat it. Respond in ${languageName} for support and explanation. Gently correct. Praise effort every time.`,

    translate: `${base}

You are a translation assistant for ${languageName} speakers. When the caller says something, translate it to English and explain the meaning simply in ${languageName}. Also answer "How do I say X?" questions. Keep translations short and practical.`,
  };

  return modePrompts[mode];
}

// What the AI says when the call first connects
export function buildWelcomeMessage(isReturning: boolean, nickname: string | null, recentSummary: string | null): string {
  if (isReturning && nickname) {
    const hint = recentSummary ? ` Last time: ${recentSummary.slice(0, 80)}.` : '';
    return `Welcome back, ${nickname}!${hint} What can I help you with today? Or press 2 for tutoring, 3 for language practice.`;
  }
  return `Hello! Welcome to Global Dial-In AI. I can help with questions, learning, translation, or conversation. What do you need today? For a menu, press any key.`;
}

// DTMF menu
export function buildMenuMessage(): string {
  return `Press 1 for general AI help. Press 2 for tutoring and lessons. Press 3 for language practice. Press 4 to change language. Or just speak — I'm listening.`;
}

// Low-confidence fallback
export function buildFallbackMessage(): string {
  return `I didn't catch that clearly. Could you repeat that slowly? Or press 1 for the menu.`;
}
