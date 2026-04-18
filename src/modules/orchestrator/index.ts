// src/modules/orchestrator/index.ts
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { config } from '../../config';
import { buildSystemPrompt, buildMenuMessage, getLanguageName } from '../../prompts';
import type { CallState, Mode } from '../../types';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export interface OrchestratorResult {
  reply: string;
  updatedState: CallState;
  latencyMs: number;
}

const DTMF_MODES: Record<string, Mode> = {
  '1': 'general',
  '2': 'tutor',
  '3': 'practice',
  '4': 'general',
};

export async function orchestrate(
  userInput: string,
  state: CallState,
  detectedLanguage: string,
): Promise<OrchestratorResult> {
  const start = Date.now();

  const digit = userInput.trim();
  if (/^[1-4]$/.test(digit)) {
    return handleDtmf(digit, state, start);
  }

  let lang = state.language;
  if (detectedLanguage && detectedLanguage !== 'en' && detectedLanguage !== state.language) {
    lang = detectedLanguage;
  }

  const mode = await detectModeIfNeeded(userInput, state);

  const updatedState: CallState = {
    ...state,
    language: lang,
    mode,
    turnCount: state.turnCount + 1,
    history: [
      ...state.history,
      { role: 'user', content: userInput },
    ].slice(-20),
  };

  const systemPrompt = buildSystemPrompt({
    language: lang,
    languageName: getLanguageName(lang),
    mode,
    nickname: state.nickname,
    recentSummary: null,
    turnCount: state.turnCount,
  });

  try {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...updatedState.history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: config.openai.chatModel,
      max_tokens: 120,
      temperature: 0.7,
      messages,
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? buildFallback(lang);

    updatedState.history.push({ role: 'assistant', content: reply });

    return { reply, updatedState, latencyMs: Date.now() - start };
  } catch (err: any) {
    console.error('[Orchestrator] GPT error:', err.message);
    return {
      reply: buildFallback(lang),
      updatedState,
      latencyMs: Date.now() - start,
    };
  }
}

function handleDtmf(digit: string, state: CallState, start: number): OrchestratorResult {
  if (digit === '4') {
    return {
      reply: 'To change your language, just speak to me in the language you prefer and I will switch automatically.',
      updatedState: state,
      latencyMs: Date.now() - start,
    };
  }
  const newMode = DTMF_MODES[digit] ?? state.mode;
  const modeNames: Record<Mode, string> = {
    general: 'General AI assistant',
    tutor: 'Tutoring mode',
    practice: 'Language practice mode',
    translate: 'Translation mode',
  };
  return {
    reply: `Switching to ${modeNames[newMode]}. ${getModeIntro(newMode)}`,
    updatedState: { ...state, mode: newMode },
    latencyMs: Date.now() - start,
  };
}

function getModeIntro(mode: Mode): string {
  switch (mode) {
    case 'general': return 'Ask me anything. I\'m here to help.';
    case 'tutor': return 'Tell me what topic you would like to learn about today.';
    case 'practice': return 'Tell me which language you want to practice and I will get started.';
    case 'translate': return 'Say the word or phrase you want translated and I will help.';
  }
}

async function detectModeIfNeeded(input: string, state: CallState): Promise<Mode> {
  if (state.turnCount > 3) return state.mode;
  if (state.mode !== 'general') return state.mode;

  const lower = input.toLowerCase();
  if (/translat|how do (i|you) say|what does .* mean in|في اللغة|ترجم/.test(lower)) return 'translate';
  if (/teach|learn|lesson|explain|tutor|study|quiz|homework|درس|تعلم/.test(lower)) return 'tutor';
  if (/practice|speak|pronunciation|my english|help me speak|répéter|repetir/.test(lower)) return 'practice';
  return 'general';
}

function buildFallback(lang: string): string {
  const fallbacks: Record<string, string> = {
    ar: 'عذراً، لم أفهم ذلك. هل يمكنك إعادة المحاولة؟',
    bn: 'দুঃখিত, বুঝতে পারিনি। আবার বলুন?',
    hi: 'माफ़ करें, समझ नहीं आया। क्या आप फिर से कहेंगे?',
    ha: 'Yi hakuri, ban fahimce ba. Za ka sake faɗi?',
    sw: 'Samahani, sikuelewa. Unaweza kurudia?',
  };
  return fallbacks[lang] ?? 'Sorry, I didn\'t catch that. Could you repeat that slowly?';
}

export async function generateSummary(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  language: string
): Promise<string> {
  if (history.length < 2) return 'Short session.';
  try {
    const completion = await openai.chat.completions.create({
      model: config.openai.chatModel,
      max_tokens: 80,
      messages: [
        {
          role: 'system',
          content: `Summarize this call session in 1-2 short sentences in English (regardless of the call language). Focus on what the caller asked about or learned. Be specific and brief.`,
        },
        {
          role: 'user',
          content: history.slice(-10).map(h => `${h.role}: ${h.content}`).join('\n'),
        },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() ?? 'Session completed.';
  } catch {
    return 'Session completed.';
  }
}
