/** Visão Jogo — como o jogo funciona e o progresso do baralho. */

import type { AppData } from '../../core/tipos'
import { nivelBaralhoCompleto } from '../../core/jogo'

export function montarFicha(raiz: HTMLElement, dados: AppData): void {
  const p = dados.personagem
  const pctColecao = Math.round((p.cartas.length / 65) * 100)
  const modoRelaxado = dados.configuracao.modoRelaxado === true

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Jogo</h1>
      <p class="view-sub">${p.esgotado ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Esgotado — sem regeneração de mana até o próximo dia.' : 'Regras, coleção e progresso.'}</p>
    </header>

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
