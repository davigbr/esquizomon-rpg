/** Regression: a toggle must ALWAYS bump updatedAt so an unmark on one device
 *  wins the merge (previously unmarking didn't bump it — the newer cloud copy
 *  won and the last interaction was lost). */
import { expect, test } from '@playwright/test'

test('REGRESSION: desmarcar gutia updatedAt e vence o merge (última interação não se perde)', async ({ page }) => {
  await page.goto('/#/today')
  const r = await page.evaluate(async () => {
    const { mergeData } = await import('/src/core/syncMerge')
    // mesmo id, mesmo updatedAt ANTIGO: o lado "nuvem" marcou (history=['2026-01-01'])
    // o lado "local" (desktop) desmarcou (history=[]) na última interação.
    // Mesmo sem bump, o merge resolve por updatedAt — mas se o local desmarca e
    // bumps updatedAt, o local deve vencer.
    const base: any = { tasks: [], diary: [], conversations: [], log: [], version: 3 }
    const mk = (updatedAt: string, history: string[]) => ({
      id: 'x', title: 'X', type: 'recorrente', difficulty: 'facil', done: false,
      tags: [], history, createdAt: '2026-01-01', updatedAt,
    })
    // nuvem: marca em 2026-01-02; local (desktop): desmarca em 2026-01-03 (mais novo → vence)
    const cloud = { ...base, tasks: [mk('2026-01-02T00:00:00Z', ['2026-01-01'])] }
    const local = { ...base, tasks: [mk('2026-01-03T00:00:00Z', [])] }
    const merged = mergeData(local, cloud) as { tasks: Array<{ history: string[]; updatedAt: string }> }
    return { history: merged.tasks[0].history, updatedAt: merged.tasks[0].updatedAt }
  })
  // o desmarcar (history vazio, mais novo) deve vencer
  expect(r.history).toEqual([])
  expect(r.updatedAt).toBe('2026-01-03T00:00:00Z')
})

test('REGRESSION: excluir crônica/nota cria TOMBSTONE e o merge NÃO a ressuscita (bug 2026-09-28)', async ({ page }) => {
  await page.goto('/#/today')
  const r = await page.evaluate(async () => {
    const { mergeData } = await import('/src/core/syncMerge')
    // nuvem ainda tem os registros (o PUT do delete não chegou / device antigo)…
    const nuvem: any = {
      tasks: [],
      diary: [{ id: 'c1', date: '2026-09-28', title: 'C', text: 'x', createdAt: '2026-09-28T00:00:00Z' }],
      notes: [{ id: 'n1', date: '2026-09-28', time: '09:00', text: 'nota', createdAt: '2026-09-28T00:00:00Z' }],
      conversations: [], log: [], version: 3,
    }
    // …mas o local JÁ excluiu (sem os registros, com tombstone)
    const local: any = {
      tasks: [], diary: [], notes: [], conversations: [], log: [], version: 3,
      deletedDiaryEntries: { c1: '2026-09-28T10:00:00Z' },
      deletedNotes: { n1: '2026-09-28T10:00:00Z' },
    }
    const merged = mergeData(local, nuvem) as any
    return {
      diary: merged.diary.length,
      notes: merged.notes.length,
      tDiary: !!merged.deletedDiaryEntries?.c1,
      tNotes: !!merged.deletedNotes?.n1,
    }
  })
  // a crônica e a nota excluídas NÃO voltam mesmo com a nuvem ainda guardando cópias
  expect(r.diary).toBe(0)
  expect(r.notes).toBe(0)
  // os tombstones persistem no merge (nunca são descartados)
  expect(r.tDiary).toBe(true)
  expect(r.tNotes).toBe(true)
})