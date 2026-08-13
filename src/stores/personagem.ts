/** Domínio do personagem: XP, nível, cartas, mana, dano e morte. */

import type { Personagem } from '../core/tipos'
import { cartasPorNivel, custoInvocacao, hpMaxDe, manaMaxDe, xpProximoDe } from '../core/jogo'
import type { Carta } from '../core/baralho'
import { sortearIds, sortearIniciais } from '../core/baralho'
import { appStore, registrarLog } from './base'
import type { Resultado } from './base'
import { tocarSom } from '../ui/sons'

/* Deck carregado + fila de desbloqueio (o deck chega assíncrono no boot). */
export let deckCarregado: Carta[] | null = null
let desbloqueioPendente = 0
/** Evento de morte pendente de ser exibido pela UI (carta perdida). */
let mortePendente: { cartaId: string; cartaNome: string } | null = null

/** Consome o evento de morte (uma vez) — a UI mostra a tela de esgotado e a carta perdida. */
export function consumirMorte(): { cartaId: string; cartaNome: string } | null {
  const m = mortePendente
  mortePendente = null
  return m
}

/** Registra a morte (esgotou agora) e perde 1 carta da coleção.
 *  A ordem importa: `mortePendente` é setada ANTES do set das cartas, para o
 *  subscribe disparado pela remoção já encontrar o evento e mostrar o overlay. */
function registrarMorte(): void {
  const dados = appStore.get()
  const p = dados.personagem
  if (p.cartas.length > 0) {
    const perdida = p.cartas[Math.floor(Math.random() * p.cartas.length)]
    const carta = deckCarregado?.find((c) => c.id === perdida)
    mortePendente = { cartaId: perdida, cartaNome: carta?.name ?? perdida }
    appStore.set({ ...dados, personagem: { ...p, cartas: p.cartas.filter((id) => id !== perdida) } })
    registrarLog('carta', `Esgotou — perdeu a carta: ${carta?.name ?? perdida}`)
  } else {
    mortePendente = { cartaId: '', cartaNome: '' }
    registrarLog('dano', 'Esgotou — sem cartas para perder')
  }
  registrarLog('dano', 'Ficou esgotado (vida zerada)')
}

/** Registra o deck carregado; sorteia as cartas iniciais e processa desbloqueios pendentes. */
export function registrarDeck(cartas: Carta[]): void {
  deckCarregado = cartas
  const dados = appStore.get()
  const p = dados.personagem
  if (p.cartas.length === 0 && !p.esgotado) {
    // primeira execução: 5 monstros + 1 captura + 1 aliança
    const iniciais = sortearIniciais(cartas)
    appStore.set({ ...appStore.get(), personagem: { ...p, cartas: iniciais } })
    const nomes = cartas.filter((c) => iniciais.includes(c.id)).map((c) => c.name)
    registrarLog('carta', `Começou o jogo com ${iniciais.length} cartas: ${nomes.join(', ')}`)
  }
  if (desbloqueioPendente > 0) {
    const n = desbloqueioPendente
    desbloqueioPendente = 0
    desbloquearCartas(n)
  }
}

/** Sorteia e adiciona n cartas novas ao personagem; retorna os ids desbloqueados. */
function desbloquearCartas(n: number): string[] {
  const dados = appStore.get()
  const p = dados.personagem
  if (!deckCarregado) {
    desbloqueioPendente += n
    return []
  }
  const novos = sortearIds(deckCarregado, n, p.cartas)
  if (novos.length === 0) return []
  appStore.set({
    ...dados,
    personagem: { ...p, cartas: [...p.cartas, ...novos] },
  })
  const nomes = deckCarregado.filter((c) => novos.includes(c.id)).map((c) => c.name)
  registrarLog('carta', `Desbloqueou: ${nomes.join(', ')}`)
  return novos
}

/** Aplica XP ao personagem; retorna se subiu de nível e cartas novas. */
export function ganharXP(quantidade: number): { subiu: boolean; nivel: number; novasCartas: string[] } {
  const p = appStore.get().personagem
  let xp = p.xp + quantidade
  let { nivel } = p
  let xpProximo = p.xpProximo
  let subiu = false
  let niveis = 0
  while (xp >= xpProximo) {
    xp -= xpProximo
    nivel += 1
    xpProximo = xpProximoDe(nivel)
    subiu = true
    niveis += 1
  }
  const personagem: Personagem = {
    ...p,
    xp,
    xpProximo,
    nivel,
    hpMax: hpMaxDe(nivel),
    manaMax: manaMaxDe(nivel),
  }
  if (subiu) {
    // subir de nível restaura HP e mana
    personagem.hp = personagem.hpMax
    personagem.mana = personagem.manaMax
    personagem.esgotado = false
  }
  appStore.set({ ...appStore.get(), personagem })
  const novasCartas = subiu ? desbloquearCartas(niveis * cartasPorNivel()) : []
  if (subiu) registrarLog('nivel', `Subiu para o nível ${nivel} (máximos restaurados)`)
  if (subiu) tocarSom('nivel')
  return { subiu, nivel, novasCartas }
}

/** Invoca uma carta desbloqueada: gasta mana (custo cresce por invocação até o teto).
 *  `custoOverride` permite cobrar um custo diferente (ex.: premium da Fábula). */
export function invocarCarta(id: string, custoOverride?: number): Resultado {
  const dados = appStore.get()
  const p = dados.personagem
  const carta = deckCarregado?.find((c) => c.id === id)
  if (!carta) return { ok: false, motivo: 'Carta não encontrada.' }
  if (!p.cartas.includes(id)) return { ok: false, motivo: 'Esta carta ainda está bloqueada.' }
  const custo = custoOverride ?? custoInvocacao(carta.type, p.invocacoes[id] ?? 0)
  if (p.mana < custo) return { ok: false, motivo: `Mana insuficiente — precisa de ${custo}.` }
  appStore.set({
    ...dados,
    personagem: {
      ...p,
      mana: p.mana - custo,
      invocacoes: { ...p.invocacoes, [id]: (p.invocacoes[id] ?? 0) + 1 },
    },
  })
  registrarLog('invocacao', `Invocou: ${carta.name} (−${custo} mana)`)
  tocarSom('invocar')
  return { ok: true }
}

/** Aplica dano ao personagem (no-op no modo relaxado). Retorna se esgotou. */
export function aplicarDano(quantidade: number): { esgotou: boolean } {
  const dados = appStore.get()
  if (dados.configuracao.modoRelaxado) return { esgotou: false }
  const p = dados.personagem
  if (p.esgotado) return { esgotou: true }
  const hp = Math.max(0, p.hp - quantidade)
  const esgotou = hp <= 0
  appStore.set({
    ...dados,
    personagem: { ...p, hp, esgotado: p.esgotado || esgotou },
  })
  if (esgotou) registrarMorte()
  return { esgotou }
}
