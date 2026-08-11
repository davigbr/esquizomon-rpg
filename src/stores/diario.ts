/** Domínio do diário (1 entrada por dia). */

import type { EntradaDiario } from '../core/tipos'
import { novoId } from '../core/jogo'
import { appStore } from './base'
import type { Resultado } from './base'

export function diarioAtual(): EntradaDiario[] {
  return appStore.get().diario ?? []
}

function salvarDiario(diario: EntradaDiario[]): void {
  appStore.set({ ...appStore.get(), diario })
}

/** Busca a entrada de uma data específica (YYYY-MM-DD). Retorna undefined se não houver. */
export function entradaDoDia(data: string): EntradaDiario | undefined {
  return diarioAtual().find((e) => e.data === data)
}

/** Cria ou atualiza a entrada de uma data (idempotente na data — 1/dia). */
export function salvarEntrada(data: string, campos: { titulo?: string; texto: string }): EntradaDiario {
  const atual = entradaDoDia(data)
  if (atual) {
    const patch: Partial<EntradaDiario> = {
      texto: campos.texto,
      editadaEm: new Date().toISOString(),
    }
    if (campos.titulo !== undefined) patch.titulo = campos.titulo
    const atualizada: EntradaDiario = { ...atual, ...patch }
    salvarDiario(diarioAtual().map((e) => (e.id === atual.id ? atualizada : e)))
    return atualizada
  }
  const nova: EntradaDiario = {
    id: novoId(),
    data,
    titulo: campos.titulo ?? '',
    texto: campos.texto,
    criadaEm: new Date().toISOString(),
  }
  salvarDiario([nova, ...diarioAtual()])
  return nova
}

export function excluirEntrada(id: string): void {
  salvarDiario(diarioAtual().filter((e) => e.id !== id))
}

/** Move uma entrada para outra data (respeitando 1/dia). Retorna resultado. */
export function moverEntrada(id: string, novaData: string): Resultado {
  const entrada = diarioAtual().find((e) => e.id === id)
  if (!entrada) return { ok: false, motivo: 'Entrada não encontrada.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { ok: false, motivo: 'Data inválida.' }
  if (entrada.data === novaData) return { ok: true }
  const conflito = diarioAtual().find((e) => e.data === novaData && e.id !== id)
  if (conflito) return { ok: false, motivo: `Já existe uma crônica em ${novaData}.` }
  const movida: EntradaDiario = { ...entrada, data: novaData, editadaEm: new Date().toISOString() }
  salvarDiario(diarioAtual().map((e) => (e.id === id ? movida : e)))
  return { ok: true }
}

/* ---------- tools da IA (acessadas pelo chat) ---------- */

/** Lista entradas do diário em ordem decrescente. Usado pelo system prompt e pela tool. */
export function listarDiario(opts?: { limite?: number; desde?: string; ate?: string }): EntradaDiario[] {
  let lista = diarioAtual()
  if (opts?.desde) lista = lista.filter((e) => e.data >= opts.desde!)
  if (opts?.ate) lista = lista.filter((e) => e.data <= opts.ate!)
  const limite = opts?.limite ?? lista.length
  return lista.slice(0, limite)
}
