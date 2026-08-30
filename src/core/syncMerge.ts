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
  // We keep the FULL UNION of tombstones indefinitely and NEVER "settle" one
  // away based on the two sides present here. Settling was the resurrection bug
  // (2026-08-30): once both current sides lacked the task, the tombstone was
  // dropped — and then a stale/offline device that STILL held a live copy of
  // that task re-uploaded it (no tombstone left to filter it), spreading it to
  // every device again. Because we cannot see all devices, a tombstone must
  // persist as the durable record of "this task was deleted".
  const deleted = { ...(local.deletedTasks ?? {}), ...(cloud.deletedTasks ?? {}) }
  const deletedIds = new Set(Object.keys(deleted))
  const settledDeleted: Record<string, string> = deleted // keep every tombstone
  const tasksWithDeletion = tasks.filter((t) => !deletedIds.has(t.id))

  // Same tombstone for conversations (mirrors tasks): a conversation deleted
  // on any side never comes back. The tombstone union is also kept forever —
  // never settled away (see comment above: settling allows stale devices to
  // resurrect).
  const deletedConv = { ...(local.deletedConversations ?? {}), ...(cloud.deletedConversations ?? {}) }
  const deletedConvIds = new Set(Object.keys(deletedConv))
  const settledDeletedConv: Record<string, string> = deletedConv
  const conversationsWithDeletion = conversations.filter((c) => !deletedConvIds.has(c.id))

  return {
    ...local,
    tasks: tasksWithDeletion,
    diary,
    conversations: conversationsWithDeletion,
    log,
    deletedTasks: settledDeleted,
    deletedConversations: settledDeletedConv,
    diaryXp: { ...(cloud.diaryXp ?? {}), ...(local.diaryXp ?? {}) },
    diaryLogXp: { ...(cloud.diaryLogXp ?? {}), ...(local.diaryLogXp ?? {}) },
  }
}
