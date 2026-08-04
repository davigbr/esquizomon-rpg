/** Visão Ficha — nível, XP, HP, mana, esferas e regras do jogo. */

import type { AppData } from '../../core/tipos'
import { nivelBaralhoCompleto } from '../../core/jogo'
import { escapar } from '../formTarefa'

export function montarFicha(raiz: HTMLElement, dados: AppData): void {
  const p = dados.personagem
  const pctHp = Math.round((p.hp / p.hpMax) * 100)
  const pctMana = Math.round((p.mana / p.manaMax) * 100)
  const pctXp = Math.round((p.xp / p.xpProximo) * 100)
  const pctColecao = Math.round((p.cartas.length / 65) * 100)

  const esferas = Object.entries(p.esferas).sort((a, b) => b[1] - a[1])
  const totalEsferas = esferas.reduce((soma, [, v]) => soma + v, 0)
  const modoRelaxado = dados.configuracao.modoRelaxado === true

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Ficha</h1>
      <p class="view-sub">Nível ${p.nivel}${p.esgotado ? ' — <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> esgotado' : ''}</p>
    </header>

    <div class="ficha-card">
      <div class="ficha-linha-grande">
        <div class="ficha-barra ficha-barra--grande" title="Vida">
          <span class="ficha-barra-rotulo">Vida</span>
          <div class="ficha-barra-trilho"><div class="ficha-barra-preenchimento ficha-barra--hp" style="width:${pctHp}%"></div></div>
          <span class="ficha-barra-valor">${p.hp}/${p.hpMax}</span>
        </div>
        <div class="ficha-barra ficha-barra--grande" title="Mana">
          <span class="ficha-barra-rotulo">Mana</span>
          <div class="ficha-barra-trilho"><div class="ficha-barra-preenchimento ficha-barra--mana" style="width:${pctMana}%"></div></div>
          <span class="ficha-barra-valor">${p.mana}/${p.manaMax}</span>
        </div>
      </div>
      <div class="ficha-barra ficha-barra--grande" title="Experiência">
        <span class="ficha-barra-rotulo">Experiência</span>
        <div class="ficha-barra-trilho"><div class="ficha-barra-preenchimento ficha-barra--xp" style="width:${pctXp}%"></div></div>
        <span class="ficha-barra-valor">${p.xp}/${p.xpProximo}</span>
      </div>
    </div>

    <div class="config-secao">
      <h3>Esferas</h3>
      <p>Onde sua energia está indo — o perfil se forma conforme você conclui tarefas com esfera.</p>
      ${esferas.length === 0
        ? '<div class="vazio"><strong>Nenhuma esfera ainda.</strong> Ao criar uma tarefa, escolha uma esfera (ex.: Estudo, Corpo, Criação).</div>'
        : `
        <div class="esferas-lista">
          ${esferas
            .map(([nome, valor]) => {
              const pct = totalEsferas > 0 ? Math.round((valor / totalEsferas) * 100) : 0
              return `
                <div class="esfera-item">
                  <span class="esfera-nome"><i class="fa-solid fa-atom" aria-hidden="true"></i> ${escapar(nome)}</span>
                  <div class="esfera-trilho"><div class="esfera-preenchimento" style="width:${pct}%"></div></div>
                  <span class="esfera-valor">${valor} XP · ${pct}%</span>
                </div>
              `
            })
            .join('')}
        </div>`
      }
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

    <div class="config-secao">
      <h3>Como o jogo funciona</h3>
      <ul class="regras-lista">
        <li><b>Concluir tarefas</b> dá XP conforme a dificuldade (Fácil ×1 · Média ×1,5 · Difícil ×2 · Extrema ×2,5).</li>
        <li><b>Subir de nível</b> restaura vida e mana, e aumenta os máximos.</li>
        <li><b>Recorrentes perdidas</b> causam dano no dia seguinte, proporcional à dificuldade.</li>
        <li><b>Hábitos negativos</b> causam dano pequeno; positivos dão XP.</li>
        <li><b>Morte não-destrutiva:</b> com vida zerada você fica <b>esgotado</b> — sem regeneração de mana — até o próximo dia.</li>
        <li><b>Modo relaxado${modoRelaxado ? ' (ativado)' : ''}:</b> desliga todo dano — o jogo vira só bônus. Alternar em Config.</li>
      </ul>
    </div>
  `
}
