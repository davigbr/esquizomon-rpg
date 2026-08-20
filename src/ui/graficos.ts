/** SVG progression charts (XP per level, max HP, max mana) — no dependencies.
 *  Discrete levels: one point per level, with native tooltip (Level N — value). */

export interface ChartSeries {
  label: string
  color: string
  /** Value per level (index 0 = level 1). */
  values: number[]
  /** Formats the Y-axis value and the tooltip. */
  format: (v: number) => string
}

const WIDTH = 520
const HEIGHT = 170
const MARGIN = { top: 16, right: 14, bottom: 26, left: 48 }

/**
 * Generates a line chart with discrete points in SVG for the given series.
 * `currentLevel` (1-based) gets a highlighted vertical marker.
 * Each point has a native tooltip: "Nível N — value".
 */
export function progressionChart(series: ChartSeries, currentLevel: number): string {
  const { values, color } = series
  const n = values.length
  const w = WIDTH - MARGIN.left - MARGIN.right
  const h = HEIGHT - MARGIN.top - MARGIN.bottom
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const range = max - min || 1

  const x = (i: number) => MARGIN.left + (i / (n - 1)) * w
  const y = (v: number) => MARGIN.top + h - ((v - min) / range) * h

  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `M ${MARGIN.left},${MARGIN.top + h} L ${points.replace(/ /g, ' L ')} L ${MARGIN.left + w},${MARGIN.top + h} Z`

  // marks the current level (0-based index)
  const idx = Math.max(0, Math.min(n - 1, currentLevel - 1))
  const xCurrent = x(idx)
  const yCurrent = y(values[idx])

  // 5 marks on the X axis (levels) and 4 on the Y
  const xs = Array.from({ length: 5 }, (_, i) => Math.round((i / 4) * (n - 1)) + 1)
  const ys = Array.from({ length: 4 }, (_, i) => Math.round(min + (range / 3) * i))
  const slug = series.label.toLowerCase().replace(/\s+/g, '-')

  return `
    <svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Progressão de ${series.label.toLowerCase()} por nível">
      <defs>
        <linearGradient id="grad-${slug}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0.04" />
        </linearGradient>
      </defs>
      ${ys
        .map(
          (v) => `
        <line class="chart-grid" x1="${MARGIN.left}" y1="${y(v)}" x2="${MARGIN.left + w}" y2="${y(v)}" />
        <text class="chart-label-y" x="${MARGIN.left - 6}" y="${y(v) + 4}" text-anchor="end">${series.format(v)}</text>`,
        )
        .join('')}
      ${xs
        .map(
          (lv) => `
        <text class="chart-label-x" x="${x(lv - 1)}" y="${HEIGHT - 8}" text-anchor="middle">${lv}</text>`,
        )
        .join('')}
      <path d="${area}" fill="url(#grad-${slug})" />
      <polyline class="chart-row" points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <line class="chart-current" x1="${xCurrent}" y1="${MARGIN.top}" x2="${xCurrent}" y2="${MARGIN.top + h}" />
      ${values
        .map(
          (v, i) => `
        <circle class="chart-dot${i === idx ? ' chart-dot--current' : ''}" cx="${x(i)}" cy="${y(v)}" r="${i === idx ? 5 : 3.5}" fill="${color}">
          <title>Nível ${i + 1} — ${series.format(v)}</title>
        </circle>`,
        )
        .join('')}
      <text class="chart-label-current" x="${xCurrent}" y="${yCurrent - 10}" text-anchor="middle">${series.format(values[idx])}</text>
    </svg>
  `
}
