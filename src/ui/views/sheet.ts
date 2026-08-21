/** Game view — how the game works, progression and deck progress. */

import type { AppData } from '../../core/tipos'
import { damageFor, DIFFICULTIES, difficultyMeta, fullDeckLevel, hpMaxFor, manaMaxFor, xpFor, xpNextFor } from '../../core/jogo'
import { progressionChart } from '../graficos'
import { t } from '../../i18n'

/** Levels shown in the charts (up to the full deck). */
const MAX_LEVEL_CHART = 30

export function mountSheet(root: HTMLElement, data: AppData): void {
  const char = data.character
  const collectionPct = Math.round((char.cards.length / 65) * 100)
  const relaxedMode = data.settings.relaxedMode === true

  const levels = Array.from({ length: MAX_LEVEL_CHART }, (_, i) => i + 1)
  const xpPerLevel = levels.map((n) => xpNextFor(n))
  const hpPerLevel = levels.map((n) => hpMaxFor(n))
  const manaPerLevel = levels.map((n) => manaMaxFor(n))
  const xpCumulative = xpPerLevel.reduce((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], [] as number[])

  root.innerHTML = `
    <header class="view-header">
      <h1>${t('ficha.titulo')}</h1>
      <p class="view-sub">${char.exhausted ? `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${t('ficha.esgotadoSalvar')}` : t('ficha.sub')}</p>
    </header>

    <div class="settings-section">
      <h3>${t('ficha.comoFunciona')}</h3>
      <ul class="rules-list">
        <li>${t('ficha.regra1')}</li>
        <li>${t('ficha.regra2')}</li>
        <li>${t('ficha.regra3')}</li>
        <li>${t('ficha.regra4')}</li>
        <li>${t('ficha.regra5')}</li>
        <li>${t('ficha.regra6')}</li>
        <li>${t('ficha.regra7')}</li>
        <li><b>${t('ficha.modoRelaxado')}${relaxedMode ? t('ficha.ativado') : ''}:</b> ${t('ficha.regra8')}</li>
      </ul>
    </div>

    <div class="game-tables-grid">
      <div class="settings-section">
        <h3>${t('ficha.xpGanho')}</h3>
        <p>${t('ficha.xpGanhoSub')}</p>
        <table class="game-table">
          <thead>
            <tr>
              <th scope="col">${t('ficha.colDificuldade')}</th>
              <th scope="col">${t('ficha.colMult')}</th>
              <th scope="col">XP</th>
            </tr>
          </thead>
          <tbody>
            ${DIFFICULTIES.map((d) => `
              <tr>
                <th scope="row">${difficultyMeta(d.id).label}</th>
                <td>×${d.multiplier}</td>
                <td><b>+${xpFor(d.id)}</b></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p class="settings-hint">${t('ficha.subirNivelHint')}</p>
      </div>

      <div class="settings-section">
        <h3>${t('ficha.dano')}</h3>
        <p>${t('ficha.danoSub')}</p>
        <table class="game-table">
          <thead>
            <tr>
              <th scope="col">${t('ficha.colOrigem')}</th>
              <th scope="col">${t('ficha.colDif')}</th>
              <th scope="col">${t('ficha.colVida')}</th>
            </tr>
          </thead>
          <tbody>
            ${DIFFICULTIES.map((d) => `
              <tr>
                <th scope="row">${t('ficha.recorrentePerdida')}</th>
                <td>${difficultyMeta(d.id).label}</td>
                <td><b>−${damageFor(d.id)}</b></td>
              </tr>
            `).join('')}
            <tr>
              <th scope="row">${t('ficha.habitoNegativo')}</th>
              <td>${difficultyMeta(DIFFICULTIES[0].id).label} a ${difficultyMeta(DIFFICULTIES[DIFFICULTIES.length - 1].id).label}</td>
              <td><b>−${damageFor(DIFFICULTIES[0].id)} a −${damageFor(DIFFICULTIES[DIFFICULTIES.length - 1].id)}</b></td>
            </tr>
          </tbody>
        </table>
        <p class="settings-hint">${relaxedMode ? t('ficha.relaxadoAtivo') : t('ficha.vidaZerada')}</p>
      </div>
    </div>

    <div class="settings-section">
      <h3>${t('ficha.progressao')}</h3>
      <p>${t('ficha.progressaoSub', {max: MAX_LEVEL_CHART, lv: char.level})}</p>

      <div class="chart-grid">
        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:var(--accent-gold)"></span> ${t('ficha.xpPorNivel')}</div>
          ${progressionChart({ label: t('ficha.xp'), color: 'var(--accent-gold)', values: xpPerLevel, format: (v) => `${v}` }, char.level)}
          <p class="chart-legend">${t('ficha.legXpProximo', {lv: char.level, xp: xpNextFor(char.level)})}</p>
        </div>

        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:#c83030"></span> ${t('ficha.vidaMaxPorNivel')}</div>
          ${progressionChart({ label: t('ficha.vida'), color: '#c83030', values: hpPerLevel, format: (v) => `${v}` }, char.level)}
          <p class="chart-legend">${t('ficha.legVida', {max: hpMaxFor(char.level)})}</p>
        </div>

        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:#2868d0"></span> ${t('ficha.manaMaxPorNivel')}</div>
          ${progressionChart({ label: t('ficha.mana'), color: '#2868d0', values: manaPerLevel, format: (v) => `${v}` }, char.level)}
          <p class="chart-legend">${t('ficha.legMana', {max: manaMaxFor(char.level)})}</p>
        </div>

        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:#9fd17c"></span> ${t('ficha.xpAcumulado')}</div>
          ${progressionChart({ label: t('ficha.xpAcumuladoCurto'), color: '#9fd17c', values: xpCumulative, format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`) }, char.level)}
          <p class="chart-legend">${t('ficha.legXpAcumulado', { xp: xpCumulative.at(-1) ?? 0 })}</p>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>${t('ficha.baralho')}</h3>
      <p>${t('ficha.baralhoSub')}</p>
      <div class="sheet-bar" title="${t('ficha.baralhoTitle')}">
        <span class="sheet-bar-label">${t('ficha.baralho')}</span>
        <div class="sheet-bar-track"><div class="sheet-bar-fill sheet-bar--xp" style="width:${collectionPct}%"></div></div>
        <span class="sheet-bar-value">${char.cards.length}/65</span>
      </div>
      <p class="settings-hint">${t('ficha.baralhoHint', {lv: fullDeckLevel()})}</p>
    </div>
  `
}
