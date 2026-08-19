/** Domínio das tarefas: CRUD, alternância (XP/recompensas) e hábitos. */

import type { AppData, Personagem, RecompensaConclusao, Tarefa, TipoTarefa } from '../core/tipos'
import { danoDe, hojeISO, novoId, xpDe, xpProximoDe, hpMaxDe, manaMaxDe } from '../core/jogo'
import { appStore, registrarLog, tarefaPorId } from './base'
import type { DadosTarefa, Resultado } from './base'
import { tocarSom } from '../ui/sons'
import { aplicarDano, ganharXP } from './personagem'

export function tagsEmUso(dados: AppData): string[] {
  const set = new Set<string>()
  for (const t of dados.tarefas) for (const tag of t.tags) set.add(tag)
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function criarTarefa(dados: DadosTarefa): Resultado {
  const titulo = dados.titulo.trim()
  if (!titulo) return { ok: false, motivo: 'Dê um nome para a tarefa.' }
  const tarefa: Tarefa = {
    id: novoId(),
    tipo: dados.tipo,
    titulo,
    dificuldade: dados.dificuldade,
    tags: dados.tags,
    notas: dados.notas?.trim() || undefined,
    dueDate: dados.tipo === 'unica' ? dados.dueDate : undefined,
    agenda: dados.tipo === 'recorrente' ? { dias: dados.agenda?.dias ?? [], diasDoMes: dados.agenda?.diasDoMes } : undefined,
    sinal: dados.tipo === 'habito' ? dados.sinal ?? 'positivo' : undefined,
    contador:
      dados.tipo === 'habito'
        ? { hoje: 0, hojeNeg: 0, totalPositivo: 0, totalNegativo: 0 }
        : undefined,
    concluida: false,
    historico: [],
    criadaEm: new Date().toISOString(),
  }
  // nova tarefa entra no TOPO da lista (a mais recente acima) — 2026-08-17
  appStore.set({ ...appStore.get(), tarefas: [tarefa, ...appStore.get().tarefas] })
  registrarLog('tarefa', `Criou: ${titulo} (${rotuloTipoTarefa(dados.tipo)})`)
  return { ok: true }
}

/** Rótulo pt-BR do tipo de tarefa para o histórico. */
function rotuloTipoTarefa(tipo: TipoTarefa): string {
  switch (tipo) {
    case 'recorrente':
      return 'recorrente'
    case 'unica':
      return 'única'
    case 'habito':
      return 'hábito'
  }
}

export function atualizarTarefa(id: string, dados: Partial<DadosTarefa>): Resultado {
  const atual = tarefaPorId(id)
  if (!atual) return { ok: false, motivo: 'Tarefa não encontrada.' }
  const titulo = dados.titulo?.trim()
  if (titulo !== undefined && !titulo) return { ok: false, motivo: 'Dê um nome para a tarefa.' }

  const proxima: Tarefa = {
    ...atual,
    titulo: titulo ?? atual.titulo,
    dificuldade: dados.dificuldade ?? atual.dificuldade,
    tags: dados.tags ?? atual.tags,
    notas: dados.notas?.trim() || undefined,
    dueDate: dados.dueDate !== undefined ? dados.dueDate : atual.dueDate,
  }
  if (dados.tipo) {
    proxima.tipo = dados.tipo
    if (dados.tipo === 'recorrente') {
      proxima.agenda = { dias: dados.agenda?.dias ?? [], diasDoMes: dados.agenda?.diasDoMes ?? atual.agenda?.diasDoMes }
    }
    if (dados.tipo === 'habito') {
      proxima.sinal = dados.sinal ?? atual.sinal ?? 'positivo'
      proxima.contador = atual.contador ?? { hoje: 0, hojeNeg: 0, totalPositivo: 0, totalNegativo: 0 }
    }
    if (dados.tipo !== 'unica') proxima.dueDate = undefined
  }
  const tarefas = appStore.get().tarefas.map((t) => (t.id === id ? proxima : t))
  appStore.set({ ...appStore.get(), tarefas })
  registrarLog('tarefa', `Editou: ${proxima.titulo}`)
  return { ok: true }
}

export function excluirTarefa(id: string): void {
  const tarefa = tarefaPorId(id)
  appStore.set({ ...appStore.get(), tarefas: appStore.get().tarefas.filter((t) => t.id !== id) })
  if (tarefa) registrarLog('tarefa', `Excluiu: ${tarefa.titulo}`)
}

/** Reordena as tarefas (drag & drop): `ids` na nova ordem, dentro do mesmo tipo. */
export function reordenarTarefas(ids: string[]): void {
  const tarefas = appStore.get().tarefas
  const mapa = new Map(tarefas.map((t) => [t.id, t]))
  const conjunto = new Set(ids)
  const reordenadas = ids.map((id) => mapa.get(id)).filter((t): t is Tarefa => t !== undefined)
  if (reordenadas.length !== ids.length) return
  const tipo = reordenadas[0]?.tipo
  if (!tipo) return
  const demais = tarefas.filter((t) => !conjunto.has(t.id) || t.tipo !== tipo)
  const resultado = [...demais, ...reordenadas]
  appStore.set({ ...appStore.get(), tarefas: resultado })
}

/** Recorrente: marca/desmarca o dia no histórico (data = dia visível; default hoje). Retorna cartas novas. */
export function alternarRecorrenteHoje(id: string, data: string = hojeISO()): string[] {
  const tarefas = appStore.get().tarefas.map((t) => {
    if (t.id !== id || t.tipo !== 'recorrente') return t
    const tem = t.historico.includes(data)
    if (tem) {
      // desmarcando: reverte a recompensa daquele dia
      reverterRecompensa(t, data)
      return { ...t, historico: t.historico.filter((d) => d !== data), recompensas: semRecompensa(t.recompensas, data) }
    }
    return { ...t, historico: [...t.historico, data] }
  })
  appStore.set({ ...appStore.get(), tarefas })
  const tarefa = tarefas.find((t) => t.id === id)
  if (tarefa) {
    const marcada = tarefa.historico.includes(data)
    if (marcada) {
      registrarLog('tarefa', `Concluiu recorrente: ${tarefa.titulo} (+${xpDe(tarefa.dificuldade)} XP)`)
      const antes = appStore.get().personagem
      const novas = ganharXP(xpDe(tarefa.dificuldade)).novasCartas
      tocarSom('tarefa')
      registrarRecompensa(tarefa.id, data, antes, novas)
      return novas
    }
    registrarLog('tarefa', `Desfez recorrente: ${tarefa.titulo} (XP revertido)`)
  }
  return []
}

/** Única: alterna concluída e registra a data (data = dia visível; default hoje). Retorna cartas novas. */
export function alternarUnica(id: string, data: string = hojeISO()): string[] {
  const tarefas = appStore.get().tarefas.map((t) => {
    if (t.id !== id || t.tipo !== 'unica') return t
    const concluida = !t.concluida
    if (!concluida) {
      // desmarcando: reverte a recompensa daquele dia
      reverterRecompensa(t, data)
      return {
        ...t,
        concluida,
        historico: t.historico.filter((d) => d !== data),
        recompensas: semRecompensa(t.recompensas, data),
      }
    }
    return {
      ...t,
      concluida,
      historico: [...new Set([...t.historico, data])],
    }
  })
  appStore.set({ ...appStore.get(), tarefas })
  const tarefa = tarefas.find((t) => t.id === id)
  if (tarefa && tarefa.concluida) {
    registrarLog('tarefa', `Concluiu: ${tarefa.titulo} (+${xpDe(tarefa.dificuldade)} XP)`)
    const antes = appStore.get().personagem
    const novas = ganharXP(xpDe(tarefa.dificuldade)).novasCartas
    tocarSom('tarefa')
    registrarRecompensa(tarefa.id, data, antes, novas)
    return novas
  }
  if (tarefa) registrarLog('tarefa', `Desfez conclusão: ${tarefa.titulo} (XP revertido)`)
  return []
}

/* ---------- recompensas por conclusão (para reverter ao desmarcar) ---------- */

/** Remove a recompensa de uma data do mapa (retorna undefined se vazio). */
function semRecompensa(rec: Record<string, RecompensaConclusao> | undefined, data: string): Record<string, RecompensaConclusao> | undefined {
  if (!rec || !rec[data]) return rec
  const { [data]: _removida, ...resto } = rec
  return Object.keys(resto).length > 0 ? resto : undefined
}

/** Guarda na tarefa o snapshot da recompensa recém-concedida: estado ANTES do
 *  ganho (restaurado ao desmarcar) + nível PÓS-ganho (guarda de reversão).
 *  Exportado para o check-in (conclusão retroativa também registra recompensa). */
export function registrarRecompensa(id: string, data: string, antes: Personagem, cartasNovas: string[]): void {
  const p = appStore.get().personagem
  const tarefas = appStore.get().tarefas.map((t) => {
    if (t.id !== id) return t
    const xp = xpDe(t.dificuldade)
    const recompensa: RecompensaConclusao = {
      xp,
      subiu: p.nivel > antes.nivel,
      nivel: p.nivel,
      xpAntes: antes.xp,
      nivelAntes: antes.nivel,
      xpProximoAntes: antes.xpProximo,
      hpMaxAntes: antes.hpMax,
      manaMaxAntes: antes.manaMax,
      cartas: cartasNovas.length > 0 ? cartasNovas : undefined,
    }
    return { ...t, recompensas: { ...t.recompensas, [data]: recompensa } }
  })
  appStore.set({ ...appStore.get(), tarefas })
}

/** Reverte XP/nível/cartas de uma conclusão desmarcada. */
function reverterRecompensa(t: Tarefa, data: string): void {
  const r = t.recompensas?.[data]
  if (!r) return
  const p = appStore.get().personagem
  const personagem: Personagem = {
    ...p,
    xp: Math.max(0, p.xp - r.xp),
  }
  // rebaixa o nível apenas se ninguém subiu depois (nível atual == nível desta conclusão)
  if (r.subiu && r.nivel !== undefined && p.nivel === r.nivel) {
    // restaura o estado exato anterior ao ganho
    const nivelAntes = r.nivelAntes ?? Math.max(1, p.nivel - 1)
    personagem.nivel = nivelAntes
    personagem.xp = r.xpAntes ?? Math.max(0, p.xp - r.xp)
    personagem.xpProximo = r.xpProximoAntes ?? xpProximoDe(nivelAntes)
    personagem.hpMax = r.hpMaxAntes ?? hpMaxDe(nivelAntes)
    personagem.manaMax = r.manaMaxAntes ?? manaMaxDe(nivelAntes)
    personagem.hp = Math.min(p.hp, personagem.hpMax)
    personagem.mana = Math.min(p.mana, personagem.manaMax)
  }
  // cartas: SEMPRE re-bloqueadas quando esta conclusão as desbloqueou —
  // mesmo que o usuário já tenha subido outro nível depois (o nível não
  // rebaixa nesse caso, mas a carta específica da ação desfeita volta a
  // ficar bloqueada).
  if (r.subiu && r.cartas?.length) {
    const atuais = p.cartas ?? []
    const removidas = new Set(r.cartas)
    personagem.cartas = atuais.filter((c) => !removidas.has(c))
    const inv = { ...(p.invocacoes ?? {}) }
    for (const c of r.cartas) delete inv[c]
    personagem.invocacoes = inv
  }
  appStore.set({ ...appStore.get(), personagem })
  registrarLog('tarefa', `Recompensa revertida (−${r.xp} XP)`)
}

/** Hábito: registra uma repetição positiva (+) ou negativa (−). Retorna cartas novas. */
export function registrarHabito(id: string, sinal: 'positivo' | 'negativo', data: string = hojeISO()): string[] {
  const tarefas = appStore.get().tarefas.map((t) => {
    if (t.id !== id || t.tipo !== 'habito') return t
    const contador = t.contador ?? { hoje: 0, hojeNeg: 0, totalPositivo: 0, totalNegativo: 0 }
    if (sinal === 'positivo') {
      const historico = t.historico.includes(data) ? t.historico : [...t.historico, data]
      return {
        ...t,
        historico,
        contador: { ...contador, hoje: contador.hoje + 1, totalPositivo: contador.totalPositivo + 1 },
      }
    }
    return {
      ...t,
      contador: { ...contador, hojeNeg: contador.hojeNeg + 1, totalNegativo: contador.totalNegativo + 1 },
    }
  })
  appStore.set({ ...appStore.get(), tarefas })
  const tarefa = tarefas.find((t) => t.id === id)
  if (tarefa) {
    if (sinal === 'positivo') {
      registrarLog('habito', `Hábito positivo: ${tarefa.titulo} (+${xpDe(tarefa.dificuldade)} XP)`)
      const novas = ganharXP(xpDe(tarefa.dificuldade)).novasCartas
      tocarSom('habito-pos')
      return novas
    }
    const dano = danoDe(tarefa.dificuldade) // escala com a dificuldade (3/5/8/12)
    aplicarDano(dano)
    tocarSom('habito-neg')
    registrarLog('habito', `Hábito negativo: ${tarefa.titulo} (−${dano} vida)`)
  }
  return []
}
