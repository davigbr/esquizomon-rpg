/** Auto-title for untitled chronicles — ONE word via AI, or the date when the
 *  AI is off / fails. Triggered on save (views/diary.ts). */

import type { AiConfig } from '../core/tipos'
import { appStore } from '../stores/app'
import { chatOnce } from './cliente'

/** Whether the Fable AI is configurada to work (provider + key). */
export function aiEnabled(ai?: AiConfig): boolean {
  return !!ai && ai.provider !== 'nenhum' && !!ai.apiKey?.trim()
}

const TITLE_SYSTEM =
  'Você sugere títulos para crônicas de diário. Responda SOMENTE com UMA única palavra em português que capture a essência do texto do dia. Sem pontuação, sem aspas, sem explicação, sem maiúsculas. Se o texto for vazio, responda "dia".'

/** One-word title via the configured AI, or null when the AI is off or returns
 *  nothing usable. On a FAILED call the AiError from the client propagates (with
 *  the real reason — HTTP status, timeout, model/key) so the UI can show it
 *  instead of a generic toast; ensureTitle (save-time) catches and falls to the
 *  date. Timeout is generous (40s) because reasoning models (deepseek-reasoner)
 *  can be slow to answer in one word — bug 2026-09-28. */
export async function suggestChronicleTitle(text: string): Promise<string | null> {
  const ai = appStore.get().settings.ai
  if (!aiEnabled(ai)) return null
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 600)
  const content = await chatOnce(
    ai!,
    [
      { role: 'system', content: TITLE_SYSTEM },
      { role: 'user', content: clean || 'Dia sem texto.' },
    ],
    40_000,
  )
  const word = content
    .split(/\s+/)
    .map((w) => w.replace(/[.,;:!?"'`´¨^()\[\]{}…\-\u2013\u2014]/g, ''))
    .find((w) => w.length >= 2 && /^[a-zA-ZÀ-ÿ0-9]+$/.test(w))
  return word ?? null
}