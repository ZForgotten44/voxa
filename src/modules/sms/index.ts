// src/modules/sms/index.ts
import twilio from 'twilio';
import { config } from '../../config';
import { query } from '../../db';
import type { CallState } from '../../types';

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

export async function sendFollowUpSms(
  phoneNumber: string,
  callerId: string,
  sessionId: string,
  summary: string,
  state: CallState
): Promise<void> {
  const body = buildSmsBody(summary, state);

  try {
    const msg = await client.messages.create({
      body,
      from: config.twilio.phoneNumber,
      to: phoneNumber,
    });

    await query(
      `INSERT INTO followup_messages (caller_id, session_id, sms_body, status, sent_at, twilio_sid)
       VALUES ($1, $2, $3, 'sent', NOW(), $4)`,
      [callerId, sessionId, body, msg.sid]
    );
  } catch (err: any) {
    console.error('[SMS] Failed to send:', err.message);
    await query(
      `INSERT INTO followup_messages (caller_id, session_id, sms_body, status)
       VALUES ($1, $2, $3, 'failed')`,
      [callerId, sessionId, body]
    );
  }
}

function buildSmsBody(summary: string, state: CallState): string {
  const modeHints: Record<string, string> = {
    general: 'Call back anytime to continue the conversation.',
    tutor: 'Great session! Keep practicing and call back to continue your lesson.',
    practice: 'Keep practicing! Try using a new phrase today.',
    translate: 'Save this number for quick translations anytime.',
  };

  const lines = [
    `📞 Global Dial-In AI`,
    `Session: ${summary}`,
    '',
    modeHints[state.mode] ?? 'Thank you for calling.',
    '',
    'Reply STOP to opt out of messages.',
  ];

  return lines.join('\n');
}
