/**
 * Merge por entidade (2026-08-17) — caminho "E" da sincronização.
 *
 * Substitui o last-write-wins global por um merge não-destrutivo:
 * - Coleções (tarefas, diário, conversas) fazem LWW por ITEM (id/data): um item
 *   criado em só um dos lados SEMPRE entra; na mesma entidade, vence a versão
 *   mais nova (editadaEm ?? criadaEm). Empate fica com o lado "base".
 * - O merge é COMUTATIVO nas coleções (fundir(A,B) == fundir(B,A)) — a ordem
 *   só decide o personagem/configuração (objetos não-granulares).
 * - Nada de sobrescrita global: itens de lados distintos nunca se perdem.
 */
import type { AppData, Tarefa, EntradaDiario, Conversa, LogEvento } from './tipos'

const tsDe = (x: { editadaEm?: string; criadaEm?: string }): string => x.editadaEm ?? x.criadaEm ?? ''

interface Chaveada {
  id?: string
  data?: string
}

function fundirPorChave<T extends Chaveada>(a: T[], b: T[], chaveDe: (x: T) => string, ts: (x: T) => string): T[] {
  const m = new Map<string, T>()
  const add = (it: T) => {
    const k = chaveDe(it)
    if (!k) return
    const ex = m.get(k)
    if (!ex) return void m.set(k, it)
    if (ts(ex) >= ts(it)) return // empate → o primeiro (base) vence
    m.set(k, it)
  }
  for (const it of a) add(it)
  for (const it of b) add(it)
  return [...m.values()]
}

function fundirLog(a: LogEvento[], b: LogEvento[]): LogEvento[] {
  const m = new Map<string, LogEvento>()
  // b primeiro para b vencer idênticos; dedup por id
  for (const it of [...b, ...a]) if (it.id) m.set(it.id, it)
  return [...m.values()].sort((x, y) => (y.ts < x.ts ? -1 : y.ts > x.ts ? 1 : 0))
}

/**
 * Funde `local` e `nuvem`. O primeiro argumento é a "BASE" (personagem,
 * configuração e o desempate). As coleções sempre mesclam de forma comutativa.
 */
export function fundirDados(local: AppData, nuvem: AppData): AppData {
  const tarefas = fundirPorChave<Tarefa>(local.tarefas, nuvem.tarefas, (t) => t.id, tsDe)
  const diario = fundirPorChave<EntradaDiario>(local.diario ?? [], nuvem.diario ?? [], (e) => e.data, tsDe)
  const conversas = fundirPorChave<Conversa>(local.conversas ?? [], nuvem.conversas ?? [], (c) => c.id, (c) => c.atualizadaEm)
  const log = fundirLog(local.log ?? [], nuvem.log ?? [])

  // Tombstone de exclusão: tarefa excluída em QUALQUER lado some do merge.
  // `vivos` = ids presentes em algum dos arrays brutos (o outro lado ainda tem
  // a tarefa → mantém o tombstone); ids fora dos dois → assenta (limpa).
  const excluidas = { ...(local.tarefasExcluidas ?? {}), ...(nuvem.tarefasExcluidas ?? {}) }
  const excluidasIds = new Set(Object.keys(excluidas))
  const vivos = new Set([...local.tarefas, ...nuvem.tarefas].map((t) => t.id))
  const excluidasAssentadas: Record<string, string> = {}
  for (const [tid, ts] of Object.entries(excluidas)) {
    if (vivos.has(tid)) excluidasAssentadas[tid] = ts // o outro lado ainda tem → mantém o tombstone
  }
  const tarefasComExclusao = tarefas.filter((t) => !excluidasIds.has(t.id))

  return {
    ...local,
    tarefas: tarefasComExclusao,
    diario,
    conversas,
    log,
    tarefasExcluidas: excluidasAssentadas,
    diarioXp: { ...(nuvem.diarioXp ?? {}), ...(local.diarioXp ?? {}) },
    diarioRegistroXp: { ...(nuvem.diarioRegistroXp ?? {}), ...(local.diarioRegistroXp ?? {}) },
  }
}
