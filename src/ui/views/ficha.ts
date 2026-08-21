/** Game view — how the game works, progression and deck progress. */

import type { AppData } from '../../core/tipos'
import { damageFor, DIFFICULTIES, difficultyMeta, fullDeckLevel, hpMaxFor, manaMaxFor, xpFor, xpNextFor } from '../../core/jogo'
import { progressionChart } from '../graficos'

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
      <h1>Jogo</h1>
      <p class="view-sub">${char.exhausted ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Esgotado — sem regeneração de mana até o próximo dia.' : 'Regras, coleção e progressão.'}</p>
    </header>

    <div class="settings-section">
      <h3>Como o jogo funciona</h3>
      <ul class="rules-list">
        <li><b>Concluir tarefas</b> dá XP conforme a dificuldade (Fácil ×1 · Média ×1,5 · Difícil ×2 · Extrema ×2,5).</li>
        <li><b>Subir de nível</b> restaura vida e mana, e aumenta os máximos. Cada dia você também <b>regenera +5% da vida</b> (mín. 1).</li>
        <li><b>Recorrentes perdidas</b> causam dano no dia seguinte, proporcional à dificuldade.</li>
        <li><b>Hábitos negativos</b> causam dano pequeno; <b>positivos</b> dão XP e <b>recuperam +1 vida</b>.</li>
        <li><b>Registrar o diário</b> dá +5 XP (uma vez por dia). <b>Mencionar o nome de uma carta no diário</b> dá +10 XP por menção, quando a Fábula lê o diário (na interação) — vale para qualquer carta da galeria e não se repete para a mesma menção.</li>
        <li><b>Invocar</b> é pedir à Fábula no chat — comando <b>/invocar &lt;carta&gt;</b> (ou dizer "invoca a carta X"): o app desconta a mana (monstros 4, capturas 8, alianças 12; reusar encarece até o teto) e a Fábula devolve uma análise extensa dos possíveis efeitos da carta. <b>/invocar</b> sem nome: a Fábula escolhe a carta (custo ×1,5). <b>/analisar</b>: análise esquizoanalítica (10 mana). Mencionar o nome de uma carta não invoca nada — só o pedido explícito conta.</li>
        <li><b>Morte não-destrutiva:</b> com vida zerada você fica <b>esgotado</b> — sem regeneração de mana — até o próximo dia. A queda custa uma carta do baralho.</li>
        <li><b>Modo relaxado${relaxedMode ? ' (ativado)' : ''}:</b> desliga todo dano — o jogo vira só bônus. Alternar em Config.</li>
      </ul>
    </div>

    <div class="game-tables-grid">
      <div class="settings-section">
        <h3>XP ganho</h3>
        <p>Quanto cada conclusão de tarefa adiciona ao seu XP. Recorrentes marcadas, únicas concluídas e hábitos positivos dão o mesmo valor.</p>
        <table class="game-table">
          <thead>
            <tr>
              <th scope="col">Dificuldade</th>
              <th scope="col">Mult.</th>
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
        <p class="settings-hint">Subir de nível restaura vida e mana.</p>
      </div>

      <div class="settings-section">
        <h3>Dano</h3>
        <p>Quanto você perde de vida no reset diário (recorrentes perdidas) ou por repetição negativa de hábito.</p>
        <table class="game-table">
          <thead>
            <tr>
              <th scope="col">Origem</th>
              <th scope="col">Dif.</th>
              <th scope="col">Vida</th>
            </tr>
          </thead>
          <tbody>
            ${DIFFICULTIES.map((d) => `
              <tr>
                <th scope="row">Recorrente perdida</th>
                <td>${difficultyMeta(d.id).label}</td>
                <td><b>−${damageFor(d.id)}</b></td>
              </tr>
            `).join('')}
            <tr>
              <th scope="row">Hábito negativo</th>
              <td>${difficultyMeta(DIFFICULTIES[0].id).label} a ${difficultyMeta(DIFFICULTIES[DIFFICULTIES.length - 1].id).label}</td>
              <td><b>−${damageFor(DIFFICULTIES[0].id)} a −${damageFor(DIFFICULTIES[DIFFICULTIES.length - 1].id)}</b></td>
            </tr>
          </tbody>
        </table>
        <p class="settings-hint">${relaxedMode ? 'Modo relaxado ativo: nenhum dano é aplicado.' : 'Vida zerada = esgotado e perde uma carta do baralho.'}</p>
      </div>
    </div>

    <div class="settings-section">
      <h3>Progressão</h3>
      <p>A curva até o nível ${MAX_LEVEL_CHART} (baralho completo). A linha vertical marca o seu nível atual (${char.level}).</p>

      <div class="chart-grid">
        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:var(--accent-gold)"></span> XP por nível</div>
          ${progressionChart({ label: 'XP', color: 'var(--accent-gold)', values: xpPerLevel, format: (v) => `${v}` }, char.level)}
          <p class="chart-legend">Cada nível exige mais XP: nível ${char.level} precisa de ${xpNextFor(char.level)} XP para o próximo.</p>
        </div>

        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:#c83030"></span> Vida máxima por nível</div>
          ${progressionChart({ label: 'Vida', color: '#c83030', values: hpPerLevel, format: (v) => `${v}` }, char.level)}
          <p class="chart-legend">Vida máxima cresce 5 por nível: no seu nível é ${hpMaxFor(char.level)}.</p>
        </div>

        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:#2868d0"></span> Mana máxima por nível</div>
          ${progressionChart({ label: 'Mana', color: '#2868d0', values: manaPerLevel, format: (v) => `${v}` }, char.level)}
          <p class="chart-legend">Mana máxima cresce 2 por nível: no seu nível é ${manaMaxFor(char.level)} — invocar monstros custa 4, capturas 8, alianças 12.</p>
        </div>

        <div class="chart-block">
          <div class="chart-title"><span class="chart-dot" style="background:#9fd17c"></span> XP acumulado até cada nível</div>
          ${progressionChart({ label: 'XP acumulado', color: '#9fd17c', values: xpCumulative, format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`) }, char.level)}
          <p class="chart-legend">Total de XP somando todos os níveis até ali: ir do nível 1 ao 30 exige ${xpCumulative.at(-1)} XP.</p>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>Baralho</h3>
      <p>Coleção desbloqueada conforme você sobe de nível — 1 carta por nível (a partir de 7 iniciais): monstros são 6× mais comuns que alianças, capturas 2×.</p>
      <div class="sheet-bar" title="Cartas desbloqueadas do baralho">
        <span class="sheet-bar-label">Baralho</span>
        <div class="sheet-bar-track"><div class="sheet-bar-fill sheet-bar--xp" style="width:${collectionPct}%"></div></div>
        <span class="sheet-bar-value">${char.cards.length}/65</span>
      </div>
      <p class="settings-hint">Nível ${fullDeckLevel()} completa o baralho. A mana é o recurso de invocação: monstros custam menos, alianças custam mais; reusar a mesma carta encarece até um teto.</p>
    </div>
  `
}
