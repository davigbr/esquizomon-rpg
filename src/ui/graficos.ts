/** Gráficos SVG de progressão (XP por nível, HP máximo, mana máxima) — sem dependências. */

export interface SerieGrafico {
  rotulo: string
  cor: string
  /** Valor por nível (índice 0 = nível 1). */
  valores: number[]
  /** Formata o valor do eixo Y. */
  formatar: (v: number) => string
}

const LARGURA = 520
const ALTURA = 160
const MARGEM = { topo: 14, direita: 12, base: 26, esquerda: 44 }

/**
 * Gera um gráfico de linha/área em SVG para a série dada.
 * `nivelAtual` (1-based) ganha um marcador vertical destacado.
 */
export function graficoProgressao(serie: SerieGrafico, nivelAtual: number): string {
  const { valores, cor } = serie
  const n = valores.length
  const larg = LARGURA - MARGEM.esquerda - MARGEM.direita
  const alt = ALTURA - MARGEM.topo - MARGEM.base
  const max = Math.max(...valores, 1)
  const min = Math.min(...valores)
  const faixa = max - min || 1

  const x = (i: number) => MARGEM.esquerda + (i / (n - 1)) * larg
  const y = (v: number) => MARGEM.topo + alt - ((v - min) / faixa) * alt

  const pontos = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `M ${MARGEM.esquerda},${MARGEM.topo + alt} L ${pontos.replace(/ /g, ' L ')} L ${MARGEM.esquerda + larg},${MARGEM.topo + alt} Z`

  // marca o nível atual (índice 0-based)
  const idx = Math.max(0, Math.min(n - 1, nivelAtual - 1))
  const xAtual = x(idx)
  const yAtual = y(valores[idx])

  // 5 marcas no eixo X (níveis) e 4 no Y
  const xs = Array.from({ length: 5 }, (_, i) => Math.round((i / 4) * (n - 1)) + 1)
  const ys = Array.from({ length: 4 }, (_, i) => Math.round(min + (faixa / 3) * i))

  return `
    <svg class="grafico" viewBox="0 0 ${LARGURA} ${ALTURA}" role="img" aria-label="Progressão de ${serie.rotulo.toLowerCase()} por nível">
      <defs>
        <linearGradient id="grad-${serie.rotulo.toLowerCase().replace(/\s+/g, '-')}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${cor}" stop-opacity="0.35" />
          <stop offset="100%" stop-color="${cor}" stop-opacity="0.04" />
        </linearGradient>
      </defs>
      ${ys
        .map(
          (v) => `
        <line class="grafico-grade" x1="${MARGEM.esquerda}" y1="${y(v)}" x2="${MARGEM.esquerda + larg}" y2="${y(v)}" />
        <text class="grafico-rotulo-y" x="${MARGEM.esquerda - 6}" y="${y(v) + 4}" text-anchor="end">${serie.formatar(v)}</text>`,
        )
        .join('')}
      ${xs
        .map(
          (lv) => `
        <text class="grafico-rotulo-x" x="${x(lv - 1)}" y="${ALTURA - 8}" text-anchor="middle">${lv}</text>`,
        )
        .join('')}
      <path d="${area}" fill="url(#grad-${serie.rotulo.toLowerCase().replace(/\s+/g, '-')})" />
      <polyline class="grafico-linha" points="${pontos}" fill="none" stroke="${cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <line class="grafico-atual" x1="${xAtual}" y1="${MARGEM.topo}" x2="${xAtual}" y2="${MARGEM.topo + alt}" />
      <circle class="grafico-ponto-atual" cx="${xAtual}" cy="${yAtual}" r="4" fill="${cor}" />
      <text class="grafico-rotulo-atual" x="${xAtual}" y="${yAtual - 8}" text-anchor="middle">${serie.formatar(valores[idx])}</text>
    </svg>
  `
}
