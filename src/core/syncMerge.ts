/**
 * Per-entity merge (2026-08-17) — path "E" of the sync.
 *
 * Replaces the global last-write-wins with a non-destructive merge:
 * - Collections (tasks, diary, conversations) do LWW per ITEM (id/date): an item
 *   created on only one side ALWAYS enters; for the same entity, the newest
 *   version wins (updatedAt ?? createdAt). Ties go to the "base" side.
 * - The merge is COMMUTATIVE on collections (merge(A,B) == merge(B,A)) — the
 *   order only decides character/settings (non-granular objects).
 * - No global overwrite: items from distinct sides never get lost.
 */
import type { AppData, Task, DiaryEntry, Conversation, LogEvent } from './tipos'

const tsOf = (x: { updatedAt?: string; createdAt?: string }): string => x.updatedAt ?? x.createdAt ?? ''

interface Keyed {
  id?: string
  date?: string
}

function mergeByKey<T extends Keyed>(a: T[], b: T[], keyOf: (x: T) => string, ts: (x: T) => string): T[] {
  const m = new Map<string, T>()
  const add = (it: T) => {
    const k = keyOf(it)
    if (!k) return
    const ex = m.get(k)
    if (!ex) return void m.set(k, it)
    if (ts(ex) >= ts(it)) return // tie → the first (base) wins
    m.set(k, it)
  }
  for (const it of a) add(it)
  for (const it of b) add(it)
  return [...m.values()]
}

function mergeLog(a: LogEvent[], b: LogEvent[]): LogEvent[] {
  const m = new Map<string, LogEvent>()
  // b first so b wins identical; dedup by id
  for (const it of [...b, ...a]) if (it.id) m.set(it.id, it)
  return [...m.values()].sort((x, y) => (y.ts < x.ts ? -1 : y.ts > x.ts ? 1 : 0))
}

/**
 * Merges `local` and `cloud`. The first argument is the "BASE" (character,
 * settings and the tie-break). Collections always merge commutatively.
 */
export function mergeData(local: AppData, cloud: AppData): AppData {
  const tasks = mergeByKey<Task>(local.tasks, cloud.tasks, (t) => t.id, tsOf)
  const diary = mergeByKey<DiaryEntry>(local.diary ?? [], cloud.diary ?? [], (e) => e.date, tsOf)
  const conversations = mergeByKey<Conversation>(local.conversations ?? [], cloud.conversations ?? [], (c) => c.id, (c) => c.updatedAt)
  const log = mergeLog(local.log ?? [], cloud.log ?? [])

  // Deletion tombstone: a task deleted on ANY side disappears from the merge.
  // `alive` = ids present in some raw array (the other side still has the
  // task → keeps the tombstone); ids outside both → settles (clears).
  const deleted = { ...(local.deletedTasks ?? {}), ...(cloud.deletedTasks ?? {}) }
  const deletedIds = new Set(Object.keys(deleted))
  const alive = new Set([...local.tasks, ...cloud.tasks].map((t) => t.id))
  const settledDeleted: Record<string, string> = {}
  for (const [tid, ts] of Object.entries(deleted)) {
    if (alive.has(tid)) settledDeleted[tid] = ts // the other side still has it → keeps the tombstone
  }
  const tasksWithDeletion = tasks.filter((t) => !deletedIds.has(t.id))

  return {
    ...local,
    tasks: tasksWithDeletion,
    diary,
    conversations,
    log,
    deletedTasks: settledDeleted,
    diaryXp: { ...(cloud.diaryXp ?? {}), ...(local.diaryXp ?? {}) },
    diaryLogXp: { ...(cloud.diaryLogXp ?? {}), ...(local.diaryLogXp ?? {}) },
  }
}
