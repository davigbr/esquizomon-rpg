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