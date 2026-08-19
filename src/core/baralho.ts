/** Baralho Esquizomon — `src/data/deck.json` (65 cartas), fonte única importada
 *  estaticamente (galeria, contexto da IA, detecção de citações). */

import deck from '../data/deck.json'

// Gancho de diagnóstico: expõe o deck para scripts de console (correção de
// dados em produção — 2026-08-12). Inofensivo.
if (typeof window !== 'undefined') {
  ;(window as unknown as { esquizomonDeck?: Carta[] }).esquizomonDeck = deck as Carta[]
}

export type TipoCarta = 'monstro' | 'captura' | 'alianca'

export interface Carta {
  id: string
  name: string
  type: TipoCarta
}

/** O deck completo, já carregado (import estático). Mantém a assinatura async
 *  para não quebrar quem chama `await carregarDeck()`. */
export async function carregarDeck(): Promise<Carta[]> {
  return deck as Carta[]
}

/** O deck completo, síncrono (mesmo import estático — usado pelo autocomplete). */
export function todasAsCartas(): Carta[] {
  return deck as Carta[]
}

/** Sorteia N ids distintos entre as cartas disponíveis (excluindo as já escolhidas). */
export function sortearIds(cartas: Carta[], n: number, excluir: string[] = []): string[] {
  const disponiveis = cartas.map((c) => c.id).filter((id) => !excluir.includes(id))
  const embaralhado = [...disponiveis].sort(() => Math.random() - 0.5)
  return embaralhado.slice(0, Math.min(n, embaralhado.length))
}

/** Peso de raridade por tipo: monstro é 6× mais comum que aliança; captura 2×
 *  (2026-08-17 — subido de 3× para 6× para sair mais monstros). */
export function pesoDeRaridade(c: Carta): number {
  return c.type === 'monstro' ? 6 : c.type === 'captura' ? 2 : 1
}

/** Sorteia N ids com pesos de raridade, sem repetir as já escolhidas —
 *  usado nos desbloqueios por nível (2026-08-12). */
export function sortearIdsPonderado(cartas: Carta[], n: number, excluir: string[] = []): string[] {
  const disponiveis = cartas.filter((c) => !excluir.includes(c.id))
  const escolhidos: string[] = []
  const sorteiaUm = (): Carta | undefined => {
    const total = disponiveis.reduce((s, c) => s + pesoDeRaridade(c), 0)
    if (total <= 0) return undefined
    let r = Math.random() * total
    for (const c of disponiveis) {
      r -= pesoDeRaridade(c)
      if (r < 0) return c
    }
    return disponiveis[disponiveis.length - 1]
  }
  while (escolhidos.length < Math.min(n, disponiveis.length)) {
    const c = sorteiaUm()
    if (!c) break
    escolhidos.push(c.id)
    disponiveis.splice(disponiveis.indexOf(c), 1)
  }
  return escolhidos
}

/** Sorteia as cartas iniciais: exatamente 5 monstros + 1 captura + 1 aliança. */
export function sortearIniciais(cartas: Carta[]): string[] {
  const de = (tipo: TipoCarta) => cartas.filter((c) => c.type === tipo)
  const monstros = sortearIds(de('monstro'), 5)
  const capturas = sortearIds(de('captura'), 1)
  const aliancas = sortearIds(de('alianca'), 1)
  return [...monstros, ...capturas, ...aliancas]
}

export function tipoDe(carta: Carta | undefined): TipoCarta {
  return carta?.type ?? 'monstro'
}

/** Rótulo do tipo de carta. */
export function rotuloTipo(tipo: TipoCarta): string {
  switch (tipo) {
    case 'monstro':
      return 'Monstro'
    case 'captura':
      return 'Captura'
    case 'alianca':
      return 'Aliança'
  }
}

/** Cartas desbloqueadas cujo NOME aparece no texto (detecção de citações no
 *  diário). Case-insensitive; retorna ids distintos, na ordem do deck. */
export function cartasCitadasNoTexto(texto: string, desbloqueadas: Set<string>): string[] {
  const min = texto.toLocaleLowerCase('pt-BR')
  return (deck as Carta[])
    .filter((c) => desbloqueadas.has(c.id))
    .filter((c) => min.includes(c.name.toLocaleLowerCase('pt-BR')))
    .map((c) => c.id)
}

/** Resolve o termo que a Fábula usou no marcador: id (slug) ou nome da carta. */
export function resolverCartaId(termo: string): string | null {
  const t = termo.trim().toLocaleLowerCase('pt-BR')
  const carta = (deck as Carta[]).find((c) => c.id === t || c.name.toLocaleLowerCase('pt-BR') === t)
  return carta?.id ?? null
}

/** Nome da carta pelo id (para notas/toasts). */
export function nomeDaCarta(id: string): string {
  return (deck as Carta[]).find((c) => c.id === id)?.name ?? id
}

/** Tipo da carta pelo id (para calcular custo de invocação). */
export function tipoDaCarta(id: string): TipoCarta {
  return (deck as Carta[]).find((c) => c.id === id)?.type ?? 'monstro'
}
