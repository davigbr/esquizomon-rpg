/** Baralho Esquizomon — carrega `public/deck.json` (65 cartas) e resolve coleção/desbloqueio. */

export type TipoCarta = 'monstro' | 'captura' | 'alianca'

export interface Carta {
  id: string
  name: string
  type: TipoCarta
}

let deckCache: Carta[] | null = null

/** Carrega o deck.json (uma vez) e devolve as 65 cartas. */
export async function carregarDeck(): Promise<Carta[]> {
  if (deckCache) return deckCache
  const res = await fetch('/deck.json')
  if (!res.ok) throw new Error('Não consegui carregar o baralho.')
  deckCache = (await res.json()) as Carta[]
  return deckCache
}

/** Sorteia N ids distintos entre as cartas disponíveis (excluindo as já escolhidas). */
export function sortearIds(cartas: Carta[], n: number, excluir: string[] = []): string[] {
  const disponiveis = cartas.map((c) => c.id).filter((id) => !excluir.includes(id))
  const embaralhado = [...disponiveis].sort(() => Math.random() - 0.5)
  return embaralhado.slice(0, Math.min(n, embaralhado.length))
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
