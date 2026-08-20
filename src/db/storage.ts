/** Versioned persistence + safe wrapper (in-memory fallback when localStorage is blocked). */

import type { AiConfig, AiMessage, AiProvider, AppData, Character, CompletionReward, Conversation, DiaryEntry, LogEvent, LogType, Settings, Task, Theme } from '../core/tipos'
import { DATA_VERSION, STORAGE_KEY, THEME_KEY } from '../core/tipos'
import { hpMaxFor, initialCharacter, manaMaxFor, xpNextFor } from '../core/jogo'

const memory = new Map<string, string>()

/* ---------- persistence failure warning ----------
 * When localStorage fails (quota full, private mode, blocked storage),
 * the write falls to the in-memory backup: the app keeps "working" but
 * the data vanishes on reload WITHOUT warning (real bug 2026-08-12). The
 * UI registers a callback here to turn the silent loss into an alert. */

let warnFailure: (reason: string) => void = () => {}
let alreadyWarned = false

/** The UI (main.ts) registers here to warn the user when persistence fails. */
export function onPersistFailure(cb: (reason: string) => void): void {
  warnFailure = cb
}

function persistenceFailed(reason: string): void {
  console.error(`[storage] persistence failed (${reason}) — data in memory only; lost on reload`)
  if (alreadyWarned) return
  alreadyWarned = true
  warnFailure(reason)
}

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      persistenceFailed('Storage full — data may not survive reload. Export a backup in Settings.')
    } else {
      persistenceFailed('Browser blocked storage (private mode?) — data may not survive reload.')
    }
    memory.set(key, value)
  }
}

export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    memory.delete(key)
  }
}

/* ---------- theme ---------- */

export function initialTheme(): Theme {
  const t = storageGet(THEME_KEY)
  return t === 'light' || t === 'dark' ? t : 'sistema'
}

export function saveTheme(theme: Theme): void {
  storageSet(THEME_KEY, theme)
}

/* ---------- validation and normalization ---------- */

/** Migration frontier: reads the EN field first, falls back to the legacy PT field,
 *  and returns the value. The app always stores EN, so old PT blobs load transparently
 *  and get rewritten to EN on the next save (idempotent, no separate migration step). */
function field<T = unknown>(obj: Record<string, unknown>, en: string, pt: string): T {
  const v = obj[en] !== undefined ? obj[en] : obj[pt]
  return v as T
}

/** `field` but returns the value only if it's a non-null string; else undefined.
 *  Collapses the old `typeof f(x)==='string' ? f(x) : X` pattern into one typed value. */
function str(obj: Record<string, unknown>, en: string, pt: string): string | undefined {
  const v = obj[en] !== undefined ? obj[en] : obj[pt]
  return typeof v === 'string' ? v : undefined
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isTask(v: unknown): v is Task {
  if (!isObject(v)) return false
  const t = v as Record<string, unknown>
  return (
    typeof field(t, 'id', 'id') === 'string' &&
    (field(t, 'type', 'tipo') === 'recorrente' || field(t, 'type', 'tipo') === 'unica' || field(t, 'type', 'tipo') === 'habito') &&
    typeof field(t, 'title', 'titulo') === 'string' &&
    ['facil', 'media', 'dificil', 'extrema'].includes(String(field(t, 'difficulty', 'dificuldade'))) &&
    Array.isArray(field(t, 'tags', 'tags')) &&
    Array.isArray(field(t, 'history', 'historico'))
  )
}

function normalizeTask(v: unknown): Task | null {
  if (!isTask(v)) return null
  const t = v as unknown as Record<string, unknown>
  const rawAgenda = field<unknown>(t, 'agenda', 'agenda')
  const agenda =
    rawAgenda && isObject(rawAgenda) && Array.isArray(field(rawAgenda, 'days', 'dias'))
      ? {
          days: (field(rawAgenda, 'days', 'dias') as unknown[]).filter((d): d is number => typeof d === 'number'),
          daysOfMonth: Array.isArray(field(rawAgenda, 'daysOfMonth', 'diasDoMes'))
            ? (field(rawAgenda, 'daysOfMonth', 'diasDoMes') as unknown[]).filter((d): d is number => typeof d === 'number' && d >= 1 && d <= 31)
            : undefined,
        }
      : undefined
  const rawCounter = field<unknown>(t, 'counter', 'contador')
  const counter =
    rawCounter && isObject(rawCounter)
      ? {
          today: typeof field(rawCounter, 'today', 'hoje') === 'number' ? (field(rawCounter, 'today', 'hoje') as number) : 0,
          todayNeg: typeof field(rawCounter, 'todayNeg', 'hojeNeg') === 'number' ? (field(rawCounter, 'todayNeg', 'hojeNeg') as number) : 0,
          totalPositive:
            typeof field(rawCounter, 'totalPositive', 'totalPositivo') === 'number'
              ? (field(rawCounter, 'totalPositive', 'totalPositivo') as number)
              : 0,
          totalNegative:
            typeof field(rawCounter, 'totalNegative', 'totalNegativo') === 'number'
              ? (field(rawCounter, 'totalNegative', 'totalNegativo') as number)
              : 0,
        }
      : undefined
  const sign = (
    field(t, 'sign', 'sinal') === 'positivo' || field(t, 'sign', 'sinal') === 'negativo' || field(t, 'sign', 'sinal') === 'ambos'
      ? field(t, 'sign', 'sinal')
      : field(t, 'type', 'tipo') === 'habito'
        ? 'positivo'
        : undefined
  ) as 'positivo' | 'negativo' | 'ambos' | undefined
  const dueDate =
    typeof field(t, 'dueDate', 'dueDate') === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(field(t, 'dueDate', 'dueDate') as string)
      ? field(t, 'dueDate', 'dueDate')
      : undefined
  let rewards: Record<string, CompletionReward> | undefined
  const rawRewards = field<unknown>(t, 'rewards', 'recompensas')
  if (rawRewards && isObject(rawRewards)) {
    const rec: Record<string, CompletionReward> = {}
    for (const [date, r] of Object.entries(rawRewards)) {
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      if (!r || !isObject(r)) continue
      const rr = r as Record<string, unknown>
      if (typeof field(rr, 'xp', 'xp') !== 'number') continue
      rec[date] = {
        xp: field(rr, 'xp', 'xp') as number,
        leveledUp: field(rr, 'leveledUp', 'subiu') === true,
        level: typeof field(rr, 'level', 'nivel') === 'number' ? field(rr, 'level', 'nivel') : undefined,
        xpBefore: typeof field(rr, 'xpBefore', 'xpAntes') === 'number' ? field(rr, 'xpBefore', 'xpAntes') : undefined,
        levelBefore: typeof field(rr, 'levelBefore', 'nivelAntes') === 'number' ? field(rr, 'levelBefore', 'nivelAntes') : undefined,
        xpNextBefore: typeof field(rr, 'xpNextBefore', 'xpProximoAntes') === 'number' ? field(rr, 'xpNextBefore', 'xpProximoAntes') : undefined,
        hpMaxBefore: typeof field(rr, 'hpMaxBefore', 'hpMaxAntes') === 'number' ? field(rr, 'hpMaxBefore', 'hpMaxAntes') : undefined,
        manaMaxBefore: typeof field(rr, 'manaMaxBefore', 'manaMaxAntes') === 'number' ? field(rr, 'manaMaxBefore', 'manaMaxAntes') : undefined,
        cards: Array.isArray(field(rr, 'cards', 'cartas')) ? (field(rr, 'cards', 'cartas') as unknown[]).filter((c): c is string => typeof c === 'string') : undefined,
      }
    }
    if (Object.keys(rec).length > 0) rewards = rec
  }
  return {
    id: field(t, 'id', 'id') as string,
    type: field(t, 'type', 'tipo') as Task['type'],
    title: field(t, 'title', 'titulo') as string,
    difficulty: field(t, 'difficulty', 'dificuldade') as Task['difficulty'],
    tags: (field(t, 'tags', 'tags') as unknown[]).filter((x): x is string => typeof x === 'string'),
    dueDate: dueDate as string | undefined,
    notes: str(t, 'notes', 'notas'),
    agenda,
    sign,
    counter,
    done: field(t, 'done', 'concluida') === true,
    history: (field(t, 'history', 'historico') as unknown[]).filter((x): x is string => typeof x === 'string'),
    rewards,
    createdAt: str(t, 'createdAt', 'criadaEm') ?? new Date().toISOString(),
    updatedAt: str(t, 'updatedAt', 'editadaEm') ?? str(t, 'createdAt', 'criadaEm'),
  }
}

function normalizeCharacter(v: unknown): Character {
  const initial = initialCharacter()
  if (!isObject(v)) return initial
  const p = v as Record<string, unknown>
  const level = typeof field(p, 'level', 'nivel') === 'number' && (field(p, 'level', 'nivel') as number) >= 1 ? Math.floor(field(p, 'level', 'nivel') as number) : initial.level
  const hpMax = hpMaxFor(level)
  const manaMax = manaMaxFor(level)
  const cards = Array.isArray(field(p, 'cards', 'cartas')) ? (field(p, 'cards', 'cartas') as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const invocations: Record<string, number> = {}
  const rawInvocations = field<unknown>(p, 'invocations', 'invocacoes')
  if (isObject(rawInvocations)) {
    for (const [k, val] of Object.entries(rawInvocations)) {
      if (typeof k === 'string' && typeof val === 'number' && val > 0) invocations[k] = Math.floor(val)
    }
  }
  return {
    level,
    xp: typeof field(p, 'xp', 'xp') === 'number' && (field(p, 'xp', 'xp') as number) >= 0 ? Math.floor(field(p, 'xp', 'xp') as number) : 0,
    xpNext: typeof field(p, 'xpNext', 'xpProximo') === 'number' && (field(p, 'xpNext', 'xpProximo') as number) > 0 ? field(p, 'xpNext', 'xpProximo') as number : xpNextFor(level),
    hp: typeof field(p, 'hp', 'hp') === 'number' ? Math.min(Math.max(0, Math.floor(field(p, 'hp', 'hp') as number)), hpMax) : hpMax,
    hpMax,
    mana: typeof field(p, 'mana', 'mana') === 'number' ? Math.min(Math.max(0, Math.floor(field(p, 'mana', 'mana') as number)), manaMax) : manaMax,
    manaMax,
    exhausted: field(p, 'exhausted', 'esgotado') === true,
    lastDay: str(p, 'lastDay', 'ultimoDia') ?? '',
    cards,
    invocations,
    avatar:
      typeof field(p, 'avatar', 'avatar') === 'string' && (field(p, 'avatar', 'avatar') as string).startsWith('data:image/') && (field(p, 'avatar', 'avatar') as string).length < 200_000
        ? field(p, 'avatar', 'avatar')
        : undefined,
    monsterName:
      typeof field(p, 'monsterName', 'nomeMonstruoso') === 'string' && (field(p, 'monsterName', 'nomeMonstruoso') as string).trim()
        ? (field(p, 'monsterName', 'nomeMonstruoso') as string).trim().slice(0, 40)
        : undefined,
  }
}

function normalizeSettings(v: unknown): Settings {
  const theme: Theme = (isObject(v) && (field(v, 'theme', 'tema') === 'light' || field(v, 'theme', 'tema') === 'dark' || field(v, 'theme', 'tema') === 'sistema')) ? field(v, 'theme', 'tema') as Theme : 'sistema'
  const relaxedMode = isObject(v) && field(v, 'relaxedMode', 'modoRelaxado') === true
  const ai = isObject(v) ? normalizeAiConfig(field<unknown>(v, 'ai', 'ia')) : undefined
  const out: Settings = { theme, relaxedMode }
  if (ai) out.ai = ai
  const summary = isObject(v) ? field(v, 'summary', 'resumo') : undefined
  if (isObject(v) && typeof summary === 'string' && summary.trim()) out.summary = summary
  const sound = isObject(v) ? field(v, 'sound', 'sons') : undefined
  if (typeof sound === 'boolean') out.sound = sound
  return out
}

const PROVIDERS: ReadonlySet<string> = new Set(['nenhum', 'deepseek', 'opencode'])

function normalizeAiConfig(v: unknown): AiConfig | undefined {
  if (!isObject(v)) return undefined
  const rawProvider = field<unknown>(v, 'provider', 'provider')
  const provider: AiProvider = typeof rawProvider === 'string' && PROVIDERS.has(rawProvider) ? rawProvider as AiProvider : 'nenhum'
  if (provider === 'nenhum') return undefined // no provider configured → do not create config
  // Migration v2 → v3: presets became free text. If the user had
  // `preset === 'custom'` + `systemPromptCustom`, copy; otherwise keep empty
  // (= use the canonical). The legacy `preset` field is ignored.
  let systemPrompt = ''
  if (typeof field(v, 'systemPrompt', 'systemPrompt') === 'string') {
    systemPrompt = field(v, 'systemPrompt', 'systemPrompt') as string
  } else if (field(v, 'preset', 'preset') === 'custom' && typeof field(v, 'systemPromptCustom', 'systemPromptCustom') === 'string') {
    systemPrompt = field(v, 'systemPromptCustom', 'systemPromptCustom') as string
  }
  return {
    provider,
    model: str(v, 'model', 'modelo') ?? '',
    apiKey: str(v, 'apiKey', 'apiKey') ?? '',
    systemPrompt,
  }
}

/** Message limit per conversation (keeps localStorage from inflating). */
const MAX_MSGS_PER_CONVERSATION = 200
/** Limit of stored conversations. */
export const MAX_CONVERSATIONS = 30
/** Limit of stored diary entries (~1 year if writing 1/day). */
const MAX_DIARY = 730

function normalizeConversation(v: unknown): Conversation | null {
  if (!isObject(v)) return null
  const id = str(v, 'id', 'id')
  if (!id) return null
  const rawTitle = str(v, 'title', 'titulo')
  const title = rawTitle && rawTitle.trim() ? rawTitle.trim().slice(0, 80) : 'Conversa'
  const updatedAt = str(v, 'updatedAt', 'atualizadaEm') ?? new Date(0).toISOString()
  const msgs: AiMessage[] = []
  const rawMessages = field<unknown>(v, 'messages', 'mensagens')
  if (Array.isArray(rawMessages)) {
    for (const m of rawMessages) {
      if (!isObject(m)) continue
      if (field(m, 'role', 'role') !== 'user' && field(m, 'role', 'role') !== 'assistant') continue
      if (typeof field(m, 'content', 'content') !== 'string' || !field(m, 'content', 'content')) continue
      msgs.push({
        role: field(m, 'role', 'role') as AiMessage['role'],
        content: str(m, 'content', 'content') ?? '',
        reasoning: str(m, 'reasoning', 'reasoning'),
        ts: str(m, 'ts', 'ts') ?? new Date().toISOString(),
      })
      if (msgs.length >= MAX_MSGS_PER_CONVERSATION) break
    }
  }
  return { id, title, messages: msgs, updatedAt }
}

function normalizeConversations(v: unknown): Conversation[] {
  if (!Array.isArray(v)) return []
  const out: Conversation[] = []
  for (const c of v) {
    const conv = normalizeConversation(c)
    if (conv) out.push(conv)
  }
  // Keeps only the MAX_CONVERSATIONS most recent.
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return out.slice(0, MAX_CONVERSATIONS)
}

function normalizeDiaryEntry(v: unknown): DiaryEntry | null {
  if (!isObject(v)) return null
  const id = str(v, 'id', 'id')
  const rawDate = field<unknown>(v, 'date', 'data')
  const date = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null
  if (!id || !date) return null
  return {
    id,
    date,
    title: str(v, 'title', 'titulo') ?? '',
    text: str(v, 'text', 'texto') ?? '',
    createdAt: str(v, 'createdAt', 'criadaEm') ?? new Date(date).toISOString(),
    updatedAt: str(v, 'updatedAt', 'editadaEm'),
  }
}

function normalizeDiary(v: unknown): DiaryEntry[] {
  if (!Array.isArray(v)) return []
  const out: DiaryEntry[] = []
  const seen = new Set<string>()
  for (const e of v) {
    const entry = normalizeDiaryEntry(e)
    if (!entry) continue
    // Guarantees uniqueness by date (1 entry/day): if duplicate comes, keep the most recent.
    if (seen.has(entry.date)) continue
    seen.add(entry.date)
    out.push(entry)
    if (out.length >= MAX_DIARY) break
  }
  // Sorts most recent first.
  out.sort((a, b) => b.date.localeCompare(a.date))
  return out
}

/** Validates and normalizes raw data (from localStorage or import). Null if irreparable. */
export function normalizeData(raw: unknown): AppData | null {
  if (!isObject(raw)) return null
  const b = raw as Record<string, unknown>
  const rawTasks = Array.isArray(field<unknown>(b, 'tasks', 'tarefas')) ? field<unknown>(b, 'tasks', 'tarefas') as unknown[] : []
  const tasks: Task[] = []
  for (const t of rawTasks) {
    const ok = normalizeTask(t)
    if (ok) tasks.push(ok)
  }
  const log = normalizeLog(field<unknown>(b, 'log', 'log'))
  const conversations = normalizeConversations(field<unknown>(b, 'conversations', 'conversas'))
  const diary = normalizeDiary(field<unknown>(b, 'diary', 'diario'))
  return {
    version: DATA_VERSION,
    tasks,
    character: normalizeCharacter(field<unknown>(b, 'character', 'personagem')),
    settings: normalizeSettings(field<unknown>(b, 'settings', 'configuracao')),
    log,
    conversations,
    diary,
    deletedTasks: normalizeStringMap(field<unknown>(b, 'deletedTasks', 'tarefasExcluidas')),
    diaryXp: normalizeDiaryXp(field<unknown>(b, 'diaryXp', 'diarioXp')),
    diaryLogXp: normalizeDiaryLogXp(field<unknown>(b, 'diaryLogXp', 'diarioRegistroXp')),
  }
}

/** Normalizes a string→string map (e.g. deletedTasks). */
function normalizeStringMap(x: unknown): Record<string, string> {
  if (!x || typeof x !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(x)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

/** `diaryLogXp`: date → true (already yielded diary-log XP). Filters junk. */
function normalizeDiaryLogXp(x: unknown): Record<string, boolean> {
  if (!x || typeof x !== 'object') return {}
  const out: Record<string, boolean> = {}
  for (const [date, ok] of Object.entries(x)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && ok) out[date] = true
  }
  return out
}

/** `diaryXp`: date → card ids already awarded (filters import junk). */
function normalizeDiaryXp(x: unknown): Record<string, string[]> {
  if (!x || typeof x !== 'object') return {}
  const out: Record<string, string[]> = {}
  for (const [date, ids] of Object.entries(x)) {
    if (Array.isArray(ids)) {
      const clean = ids.filter((i): i is string => typeof i === 'string')
      if (clean.length > 0) out[date] = clean
    }
  }
  return out
}

/** Limit of stored history events (keeps localStorage from inflating). */
export const MAX_LOG = 400

const LOG_TYPES: ReadonlySet<string> = new Set(['tarefa', 'habito', 'invocacao', 'carta', 'nivel', 'dano', 'sistema'])

function normalizeLog(v: unknown): LogEvent[] {
  if (!Array.isArray(v)) return []
  const log: LogEvent[] = []
  for (const item of v) {
    if (!isObject(item)) continue
    const rawType = field<unknown>(item, 'type', 'tipo')
    const type: LogType = typeof rawType === 'string' && LOG_TYPES.has(rawType) ? rawType as LogType : 'sistema'
    if (typeof field(item, 'text', 'texto') !== 'string' || !field(item, 'text', 'texto')) continue
    log.push({
      id: str(item, 'id', 'id') ?? String(Math.random()).slice(2),
      ts: str(item, 'ts', 'ts') ?? new Date().toISOString(),
      type,
      text: str(item, 'text', 'texto') ?? '',
    })
  }
  return log.slice(0, MAX_LOG)
}

/** Default first-run state. */
export function emptyState(): AppData {
  return {
    version: DATA_VERSION,
    tasks: [],
    character: initialCharacter(),
    settings: { theme: initialTheme() },
    log: [],
    conversations: [],
    diary: [],
    deletedTasks: {},
    diaryXp: {},
    diaryLogXp: {},
  }
}

export function load(): AppData {
  const raw = storageGet(STORAGE_KEY)
  if (!raw) return emptyState()
  try {
    const normalized = normalizeData(JSON.parse(raw))
    return normalized ?? emptyState()
  } catch {
    return emptyState()
  }
}

export function save(data: AppData): void {
  storageSet(STORAGE_KEY, JSON.stringify(data))
}

export function wipeAll(): void {
  storageRemove(STORAGE_KEY)
}
