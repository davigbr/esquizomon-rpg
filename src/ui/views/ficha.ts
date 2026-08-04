/** Visão Jogo — como o jogo funciona, progressão e o progresso do baralho. */

import type { AppData } from '../../core/tipos'
import { nivelBaralhoCompleto, xpProximoDe, hpMaxDe, manaMaxDe } from '../../core/jogo'
import { graficoProgressao } from '../graficos'

/** Níveis exibidos nos gráficos (até o baralho completo). */
const NIVEL_MAX_GRAFICO = 30

export function montarFicha(raiz: HTMLElement, dados: AppData): void {
  const p = dados.personagem
  const pctColecao = Math.round((p.cartas.length / 65) * 100)
  const modoRelaxado = dados.configuracao.modoRelaxado === true

  const niveis = Array.from({ length: NIVEL_MAX_GRAFICO }, (_, i) => i + 1)
  const xpPorNivel = niveis.map((n) => xpProximoDe(n))
  const hpPorNivel = niveis.map((n) => hpMaxDe(n))
  const manaPorNivel = niveis.map((n) => manaMaxDe(n))
  const xpAcumulado = xpPorNivel.reduce((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], [] as number[])

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Jogo</h1>
      <p class="view-sub">${p.esgotado ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Esgotado — sem regeneração de mana até o próximo dia.' : 'Regras, coleção e progressão.'}</p>
    </header>

    <div class="config-secao">
      <h3>Como o jogo funciona</h3>
      <ul class="regras-lista">
        <li><b>Concluir tarefas</b> dá XP conforme a dificuldade (Fácil ×1 · Média ×1,5 · Difícil ×2 · Extrema ×2,5).</li>
        <li><b>Subir de nível</b> restaura vida e mana, e aumenta os máximos.</li>
        <li><b>Recorrentes perdidas</b> causam dano no dia seguinte, proporcional à dificuldade.</li>
        <li><b>Hábitos negativos</b> causam dano pequeno; positivos dão XP.</li>
        <li><b>Morte não-destrutiva:</b> com vida zerada você fica <b>esgotado</b> — sem regeneração de mana — até o próximo dia. A queda custa uma carta do baralho.</li>
        <li><b>Modo relaxado${modoRelaxado ? ' (ativado)' : ''}:</b> desliga todo dano — o jogo vira só bônus. Alternar em Config.</li>
      </ul>
    </div>

    <div class="config-secao">
      <h3>Progressão</h3>
      <p>A curva até o nível ${NIVEL_MAX_GRAFICO} (baralho completo). A linha vertical marca o seu nível atual (${p.nivel}).</p>

      <div class="grafico-bloco">
        <div class="grafico-titulo"><span class="grafico-bolinha" style="background:var(--accent-gold)"></span> XP por nível</div>
        ${graficoProgressao({ rotulo: 'XP', cor: 'var(--accent-gold)', valores: xpPorNivel, formatar: (v) => `${v}` }, p.nivel)}
        <p class="grafico-legenda">Cada nível exige mais XP: nível ${p.nivel} precisa de ${xpProximoDe(p.nivel)} XP para o próximo.</p>
      </div>

      <div class="grafico-bloco">
        <div class="grafico-titulo"><span class="grafico-bolinha" style="background:#c83030"></span> Vida máxima por nível</div>
        ${graficoProgressao({ rotulo: 'Vida', cor: '#c83030', valores: hpPorNivel, formatar: (v) => `${v}` }, p.nivel)}
        <p class="grafico-legenda">Vida máxima cresce 5 por nível: no seu nível é ${hpMaxDe(p.nivel)}.</p>
      </div>

      <div class="grafico-bloco">
        <div class="grafico-titulo"><span class="grafico-bolinha" style="background:#2868d0"></span> Mana máxima por nível</div>
        ${graficoProgressao({ rotulo: 'Mana', cor: '#2868d0', valores: manaPorNivel, formatar: (v) => `${v}` }, p.nivel)}
        <p class="grafico-legenda">Mana máxima cresce 2 por nível: no seu nível é ${manaMaxDe(p.nivel)} — invocar monstros custa 2, capturas 4, alianças 6.</p>
      </div>

      <div class="grafico-bloco">
        <div class="grafico-titulo"><span class="grafico-bolinha" style="background:#9fd17c"></span> XP acumulado até cada nível</div>
        ${graficoProgressao({ rotulo: 'XP acumulado', cor: '#9fd17c', valores: xpAcumulado, formatar: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`) }, p.nivel)}
        <p class="grafico-legenda">Total de XP somando todos os níveis até ali: ir do nível 1 ao 30 exige ${xpAcumulado.at(-1)} XP.</p>
      </div>
    </div>

    <div class="config-secao">
      <h3>Baralho</h3>
      <p>Coleção desbloqueada conforme você sobe de nível — 2 cartas por nível, a partir de 7 iniciais (~10%).</p>
      <div class="ficha-barra" title="Coleção">
        <span class="ficha-barra-rotulo">BAL.</span>
        <div class="ficha-barra-trilho"><div class="ficha-barra-preenchimento ficha-barra--xp" style="width:${pctColecao}%"></div></div>
        <span class="ficha-barra-valor">${p.cartas.length}/65</span>
      </div>
      <p class="config-dica">Nível ${nivelBaralhoCompleto()} completa o baralho. A mana é o recurso de invocação: monstros custam menos, alianças custam mais; reusar a mesma carta encarece até um teto.</p>
    </div>
  `
}
