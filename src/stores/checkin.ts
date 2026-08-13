/** Domínio do ciclo diário: renovação do dia e check-in (estilo Habitica). */

import type { Tarefa } from '../core/tipos'
import { danoDe, diaDaSemana, diaDoMes, hojeISO, somarDias, xpDe } from '../core/jogo'
import { appStore, registrarLog } from './base'
import { aplicarDano, ganharXP } from './personagem'
import { registrarRecompensa } from './tarefas'
import { tocarSom } from '../ui/sons'

/** Pendências de ontem aguardando decisão do check-in (modal estilo Habitica). */
export let checkinPendente: { data: string; ids: string[] } | null = null

/** Marca o dia processado e regenera mana (fim do ciclo diário). */
function finalizarDia(hoje: string): void {
  const atual = appStore.get().personagem
  appStore.set({
    ...appStore.get(),
    personagem: {
      ...atual,
      ultimoDia: hoje,
      mana: !atual.esgotado ? atual.manaMax : atual.mana,
    },
  })
}

/** Aplica o dano diário das recorrentes perdidas (não marcadas no check-in).
 *  Únicas vencidas NUNCA dão dano diário — só recorrentes. */
function aplicarDanoDiario(ids: string[]): void {
  if (ids.length === 0) return
  const dados = appStore.get()
  if (dados.configuracao.modoRelaxado || dados.personagem.esgotado) return
  const perdidas = ids
    .map((id) => dados.tarefas.find((x) => x.id === id))
    .filter((t): t is Tarefa => !!t && t.tipo === 'recorrente')
  if (perdidas.length === 0) return
  const danoTotal = perdidas.reduce((soma, t) => soma + danoDe(t.dificuldade), 0)
  aplicarDano(danoTotal)
  registrarLog('dano', `Dano diário: ${perdidas.length} recorrente(s) perdida(s) (−${danoTotal} vida)`)
}

/** Reset diário (uma vez por dia). Se há tarefas de ontem pendentes, NÃO cobra
 *  dano ainda — deixa pendente o check-in (modal estilo Habitica) para o
 *  usuário decidir quais quer marcar retroativamente. */
export function renovarDia(): void {
  const dados = appStore.get()
  const hoje = hojeISO()
  if (dados.personagem.ultimoDia === hoje) return

  const ontem = somarDias(hoje, -1)
  const diaOntem = diaDaSemana(new Date(ontem + 'T12:00:00'))
  const diaMesOntem = diaDoMes(new Date(ontem + 'T12:00:00'))

  // 1. zera contador de "hoje" dos hábitos (positivos e negativos)
  const tarefas = dados.tarefas.map((t) => {
    if (t.tipo !== 'habito') return t
    const contador = t.contador ?? { hoje: 0, hojeNeg: 0, totalPositivo: 0, totalNegativo: 0 }
    const precisaReset = (contador.hoje > 0 || contador.hojeNeg > 0) && !t.historico.includes(hoje)
    return precisaReset ? { ...t, contador: { ...contador, hoje: 0, hojeNeg: 0 } } : t
  })
  appStore.set({ ...dados, tarefas })

  const p = appStore.get().personagem
  const primeiraVez = p.ultimoDia === ''

  // 2. pendencias de ontem: recorrentes válidas não concluídas + únicas vencidas ontem
  const pendentes = dados.tarefas.filter((t) => {
    if (t.tipo === 'recorrente' && valeNaData(t, diaOntem, diaMesOntem) && !t.historico.includes(ontem)) return true
    if (t.tipo === 'unica' && t.dueDate === ontem && !t.concluida) return true
    return false
  })

  if (!primeiraVez && !p.esgotado && !dados.configuracao.modoRelaxado && pendentes.length > 0) {
    // deixa o check-in decidir — sem dano por enquanto
    checkinPendente = { data: ontem, ids: pendentes.map((t) => t.id) }
    return
  }

  // 3. sem pendentes (ou primeira vez/relaxado): cobra dano das não feitas (nenhuma) e finaliza
  const perdidas = pendentes.filter((t) => t.tipo === 'recorrente').map((t) => t.id)
  if (!primeiraVez && !p.esgotado && !dados.configuracao.modoRelaxado) {
    aplicarDanoDiario(perdidas)
  }
  finalizarDia(hoje)
}

/** Check-in: marca em ONTEM as tarefas selecionadas (XP retroativo) e aplica o
 *  dano apenas nas recorrentes que ficaram sem marcação. */
export function concluirCheckin(idsMarcados: string[]): void {
  const pend = checkinPendente
  if (!pend) return
  checkinPendente = null
  const hoje = hojeISO()
  const marcadosSet = new Set(idsMarcados)

  // marca as selecionadas em ONTEM
  const tarefas = appStore.get().tarefas.map((t) => {
    if (!marcadosSet.has(t.id)) return t
    if (t.tipo === 'unica') {
      return { ...t, concluida: true, historico: [...new Set([...t.historico, pend.data])] }
    }
    if (t.tipo === 'recorrente' && !t.historico.includes(pend.data)) {
      return { ...t, historico: [...t.historico, pend.data] }
    }
    return t
  })
  appStore.set({ ...appStore.get(), tarefas })

  // XP retroativo das marcadas
  for (const id of idsMarcados) {
    const t = appStore.get().tarefas.find((x) => x.id === id)
    if (!t) continue
    registrarLog('tarefa', `Check-in: ${t.titulo} concluída em ${pend.data} (+${xpDe(t.dificuldade)} XP)`)
    const antes = appStore.get().personagem
    const novas = ganharXP(xpDe(t.dificuldade)).novasCartas
    registrarRecompensa(t.id, pend.data, antes, novas)
  }
  if (idsMarcados.length > 0) tocarSom('tarefa')

  // dano das recorrentes pendentes NÃO marcadas
  const danoIds = pend.ids.filter((id) => !marcadosSet.has(id))
  aplicarDanoDiario(danoIds)
  finalizarDia(hoje)
}

function valeNaData(t: Tarefa, dia: number, diaMes: number): boolean {
  if (t.agenda?.diasDoMes && t.agenda.diasDoMes.length > 0) return t.agenda.diasDoMes.includes(diaMes)
  return !t.agenda || t.agenda.dias.length === 0 || t.agenda.dias.includes(dia)
}
