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
      <h1>${t('sheet.title')}</h1>
      <p class="view-sub">${char.exhausted ? `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${t('sheet.depletedSub')}` : t('sheet.sub')}</p>
    </header>

    <div class="settings-section">
      <h3>${t('sheet.howItWorks')}</h3>
      <ul class="rules-list">
        <li>${t('sheet.rule1')}</li>
        <li>${t('sheet.rule2')}</li>
        <li>${t('sheet.rule3')}</li>
        <li>${t('sheet.rule4')}</li>
        <li>${t('sheet.rule5')}</li>
        <li>${t('sheet.rule6')}</li>
        <li>${t('sheet.rule7')}</li>
        <li><b>${t('sheet.relaxedMode')}${relaxedMode ? t('sheet.activated') : ''}:</b> ${t('sheet.rule8')}</li>
      </ul>
    </div>

    <div class="game-tables-grid">
      <div class="settings-section">
        <h3>${t('sheet.xpEarned')}</h3>
        <p>${t('sheet.xpEarnedSub')}</p>
        <table class="game-table">
          <thead>
            <tr>
              <th scope="col">${t('sheet.colDifficulty')}</th>
              <th scope="col">${t('sheet.colMult')}</th>
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
        <p class="settings-hint">${t('sheet.levelUpHint')}</p>
      </div>

      <div class="settings-section">
        <h3>${t('sheet.damage')}</h3>
        <p>${t('sheet.damageSub')}</p>
        <table class="game-table">
          <thead>
            <tr>
              <th scope="col">${t('sheet.colSource')}</th>
              <th scope="col">${t('sheet.colDif')}</th>
              <th scope="col">${t('sheet.colHealth')}</th>
            </tr>
          </thead>
          <tbody>
            ${DIFFICULTIES.map((d) => `
              <tr>
                <th scope="row">${t('sheet.missedRecurring')}</th>
                <td>${difficultyMeta(d.id).label}</td>
                <td><b>−${damageFor(d.id)}</b></td>
              </tr>
            `).join('')}
            <tr>
              <th scope="row">${t('sheet.negativeHabit')}</th>
              <td>${difficultyMeta(DIFFICULTIES[0].id).label} a ${difficultyMeta(DIFFICULTIES[DIFFICULTIES.length - 1].id).label}</td>
              <td><b>−${damageFor(DIFFICULTIES[0].id)} a −${damageFor(DIFFICULTIES[DIFFICULTIES.length - 1].id)}</b></td>
            </tr>
          </tbody>
        </table>
        <p class="settings-hint">${relaxedMode ? t('sheet.relaxedActive') : t('sheet.zeroHealth')}</p>
      </div>
    </div>

    <div class="settings-section">
      <h3>${t('sheet.progression')}</h3>
      <p>${t('sheet.progressionSub', {max: MAX_LEVEL_CHART, lv: char.level})}</p>

      <div class="chart-grid">
        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:var(--accent-gold)"></span> ${t('sheet.xpPerLevel')}</div>
          ${progressionChart({ label: t('sheet.xp'), color: 'var(--accent-gold)', values: xpPerLevel, format: (v) => `${v}` }, char.level)}
          <p class="chart-legend">${t('sheet.nextXpLegend', {lv: char.level, xp: xpNextFor(char.level)})}</p>
        </div>

        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:#c83030"></span> ${t('sheet.maxHealthPerLevel')}</div>
          ${progressionChart({ label: t('sheet.health'), color: '#c83030', values: hpPerLevel, format: (v) => `${v}` }, char.level)}
          <p class="chart-legend">${t('sheet.healthLegend', {max: hpMaxFor(char.level)})}</p>
        </div>

        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:#2868d0"></span> ${t('sheet.maxManaPerLevel')}</div>
          ${progressionChart({ label: t('sheet.mana'), color: '#2868d0', values: manaPerLevel, format: (v) => `${v}` }, char.level)}
          <p class="chart-legend">${t('sheet.manaLegend', {max: manaMaxFor(char.level)})}</p>
        </div>

        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:#9fd17c"></span> ${t('sheet.cumulativeXp')}</div>
          ${progressionChart({ label: t('sheet.cumXpShort'), color: '#9fd17c', values: xpCumulative, format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`) }, char.level)}
          <p class="chart-legend">${t('sheet.cumXpLegend', { xp: xpCumulative.at(-1) ?? 0 })}</p>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>${t('sheet.deck')}</h3>
      <p>${t('sheet.deckSub')}</p>
      <div class="sheet-bar" title="${t('sheet.deckTitle')}">
        <span class="sheet-bar-label">${t('sheet.deck')}</span>
        <div class="sheet-bar-track"><div class="sheet-bar-fill sheet-bar--xp" style="width:${collectionPct}%"></div></div>
        <span class="sheet-bar-value">${char.cards.length}/65</span>
      </div>
      <p class="settings-hint">${t('sheet.deckHint', {lv: fullDeckLevel()})}</p>
    </div>
  `
}
