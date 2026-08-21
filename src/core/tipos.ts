/** Esquizomon RPG data types — pure domain, no UI dependency.
 *  NOTE: the VALUES of discriminated/tagged literals (e.g. 'recorrente', 'facil',
 *  'dark', log tag values) are PERSISTED data and intentionally remain in PT
 *  so existing save blobs migrate transparently. Only field/type names are EN. */

export type TaskType = 'recorrente' | 'unica' | 'habito'
export type Difficulty = 'facil' | 'media' | 'dificil' | 'extrema'
/** Theme: 'sistema' follows the OS preference (user preference 2026-08-12). */
export type Theme = 'dark' | 'light' | 'sistema'

/** Schedule of a recurring task.
 *  `days` = weekdays 0-6 (Sunday = 0); empty = every day.
 *  `daysOfMonth` = days of the month 1-31; when present and not empty, the task
 *  applies on those days (monthly). */
export interface Agenda {
  days: number[]
  daysOfMonth?: number[]
}

/** Counter of a habit. `today`/`todayNeg` = repetitions (pos/neg) of today;
 *  streaks derived from the history. */
export interface HabitCounter {
  today: number
  todayNeg: number
  totalPositive: number
  totalNegative: number
}

/** Player character — level, XP, HP, mana and deck. */
export interface Character {
  level: number
  xp: number
  xpNext: number
  hp: number
  hpMax: number
  mana: number
  manaMax: number
  /** Non-destructive death: HP ≤ 0 leaves the character depleted until next reset. */
  exhausted: boolean
  /** ISO date of the last processed daily reset (avoids repeated damage same day). */
  lastDay: string
  /** Ids of unlocked deck cards (gallery). */
  cards: string[]
  /** Player avatar: compressed JPEG data URL (~5KB), shown in the status bar. */
  avatar?: string
  /** Monster name of the character — bold next to the avatar (desktop only). */
  monsterName?: string
  /** Count of invocations per card (mana cost grows up to a cap). */
  invocations: Record<string, number>
}

export interface Task {
  id: string
  type: TaskType
  title: string
  difficulty: Difficulty
  tags: string[]
  /** One-off: due date (YYYY-MM-DD). */
  dueDate?: string
  notes?: string
  /** Recurring: which weekdays it applies (empty = all). */
  agenda?: Agenda
  /** Habit: sign. 'positivo' | 'negativo' | 'ambos'. */
  sign?: 'positivo' | 'negativo' | 'ambos'
  counter?: HabitCounter
  /** One-off: completed or not. */
  done?: boolean
  /** ISO dates (YYYY-MM-DD) of completions — recurring: completed days; habits: positive-repetition days. */
  history: string[]
  /** ISO dates (YYYY-MM-DD) of NEGATIVE habit repetitions — lets the UI show a
   *  negative habit as active on a past day when navigating the date selector. */
  negativeHistory?: string[]
  /** Rewards granted per completion date (to revert when unchecking). */
  rewards?: Record<string, CompletionReward>
  createdAt: string
  /** ISO of last edit (sync: per-item LWW merge). */
  updatedAt?: string
}

/** Snapshot of the reward of ONE completion — lets you revert XP/level/cards when unchecking.
 *  Stores the state BEFORE the gain (to restore) and the POST-gain level (for the reversal guard). */
export interface CompletionReward {
  xp: number
  /** true if this completion leveled up. */
  leveledUp?: boolean
  /** Level reached by this completion (reverts only if nobody leveled up after). */
  level?: number
  /** Character state BEFORE the gain (restored when unchecking). */
  xpBefore?: number
  levelBefore?: number
  xpNextBefore?: number
  hpMaxBefore?: number
  manaMaxBefore?: number
  /** Cards unlocked by leveling up (to remove when reverting). */
  cards?: string[]
}

export interface Settings {
  theme: Theme
  /** Relaxed mode: disables damage (game becomes bonus-only). */
  relaxedMode?: boolean
  /** Fable (AI chat) configuration. */
  ai?: AiConfig
  /** User life summary ("About you") — the Fable uses it to know you. */
  summary?: string
  /** Sound effects (Web Audio, synthesized) — default on. */
  sound?: boolean
}

/** AI provider. MVP: deepseek and opencode Zen Go (both OpenAI-compatible). */
export type AiProvider = 'nenhum' | 'deepseek' | 'opencode'

/** Fable (chat) configuration. Persisted in `settings.ai`. */
export interface AiConfig {
  provider: AiProvider
  /** Model to use (empty = provider default). */
  model: string
  /** User API key (BYOK — stays in localStorage). */
  apiKey: string
  /** User-editable system prompt. Empty = canonical one (Fable from NARRATIVA.md). */
  systemPrompt: string
}

/** Message of an AI conversation (OpenAI-compatible format). */
export interface AiMessage {
  role: 'user' | 'assistant'
  /** Visible text. */
  content: string
  /** Model reasoning (DeepSeek R1, OpenAI o-series, Gemini thinking) — collapsible. */
  reasoning?: string
  /** ISO timestamp. */
  ts: string
}

/** AI conversation. Multiple conversations persisted. */
export interface Conversation {
  id: string
  /** Auto title (first 3-5 words of the 1st user message) or edited. */
  title: string
  /** Messages in chronological order. */
  messages: AiMessage[]
  /** ISO of last activity. */
  updatedAt: string
}

/** Type of history event (defines icon and color in listing). */
export type LogType = 'tarefa' | 'habito' | 'invocacao' | 'carta' | 'nivel' | 'dano' | 'sistema'

/** Event of the game action history. */
export interface LogEvent {
  id: string
  /** ISO datetime (with time). */
  ts: string
  type: LogType
  text: string
}

export interface AppData {
  version: number
  tasks: Task[]
  character: Character
  settings: Settings
  /** Extensive action history (most recent first). */
  log: LogEvent[]
  /** Fable conversations (AI chat). Multiple, persisted. */
  conversations?: Conversation[]
  /** Deleted tasks (id → date): tombstone so the merge doesn't re-add
   *  a task a device already deleted. */
  deletedTasks?: Record<string, string>
  /** Ship log (1 entry per day, text/voice). Persisted. */
  diary?: DiaryEntry[]
  /** Mentions of cards already rewarded per day (date → card ids).
   *  Avoids granting XP twice for the same mention. */
  diaryXp?: Record<string, string[]>
  /** Days where logging the diary already yielded XP (date → true, 1×/day). */
  diaryLogXp?: Record<string, boolean>
}

export const DATA_VERSION = 3

/** Diary entry. One per day (key = date YYYY-MM-DD). */
export interface DiaryEntry {
  id: string
  /** Entry date (YYYY-MM-DD) — uniqueness key. */
  date: string
  /** Short title (optional, user may leave blank). */
  title: string
  /** Entry text (markdown-lite, like task notes). */
  text: string
  /** ISO creation timestamp. */
  createdAt: string
  /** ISO of last edit (undefined if never edited). */
  updatedAt?: string
}
export const STORAGE_KEY = 'esquizomon-rpg:v1'
export const THEME_KEY = 'esquizomon-rpg:tema'
