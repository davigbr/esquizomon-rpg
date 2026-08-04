/** System prompt da Fábula + serialização do contexto do app.
 *  A Fábula tem acesso a tudo: ficha, tarefas, esferas, mundo. */

import type { AppData } from '../core/tipos'
import { hojeISO } from '../core/jogo'

/** Serializa o estado do app como contexto legível para a IA. */
export function montarContexto(dados: AppData): string {
  const hoje = hojeISO()
  const p = dados.personagem

  const tarefas = dados.tarefas.map((t) => {
    const feita =
      t.tipo === 'unica' ? t.concluida : t.tipo === 'recorrente' ? t.historico.includes(hoje) : (t.contador?.hoje ?? 0) > 0
    const sinal = t.tipo === 'habito' ? ` (sinal: ${t.sinal ?? 'positivo'})` : ''
    const esfera = t.esfera ? ` [esfera: ${t.esfera}]` : ''
    const tags = t.tags.length ? ` #{${t.tags.join(', ')}}` : ''
    return `- ${feita ? '[feita]' : '[pendente]'} ${t.titulo} (${t.tipo}, ${t.dificuldade})${sinal}${esfera}${tags}`
  }).join('\n')

  const esferas = Object.entries(p.esferas).sort((a, b) => b[1] - a[1])
  const esferasTxt = esferas.length
    ? esferas.map(([n, v]) => `- ${n}: ${v} XP`).join('\n')
    : '- nenhuma ainda'

  return `ESTADO DO DIA (${hoje}):
- Personagem: nível ${p.nivel}, XP ${p.xp}/${p.xpProximo}${p.esgotado ? ', ESOGATADO' : ''}, vida ${p.hp}/${p.hpMax}, mana ${p.mana}/${p.manaMax}
- Modo relaxado: ${dados.configuracao.modoRelaxado ? 'sim (sem dano)' : 'não'}
TAREFAS:
${tarefas || '- nenhuma tarefa'}
ESFERAS (perfil de onde a energia vai):
${esferasTxt}`
}

/** System prompt completo da Fábula (persona + mundo + contexto). */
export function montarSystemPrompt(dados: AppData): string {
  const mundo = dados.configuracao.ia?.mundo ?? ''
  const mundoTxt = mundo
    ? `\nO MUNDO ESCOLHIDO PELO JOGADOR: ${mundo}. Fale dentro desse mundo (você é a personagem correspondente da crônica).`
    : ''

  return `Você é FÁBULA, a Cronista — a inteligência artificial que narra a vida do jogador em forma de história.

SUA PERSONAGEM: uma mulher que escreve. Não se sabe de onde veio nem há quanto tempo anda por aí — ela aparece onde há histórias sendo vividas e se instala até o caderno ficar cheio. Ela não luta, não manda, não salva ninguém: anota. Fala em frases curtas. É seca sem cerimônia, mas de uma secura que acolhe. Não julga — registra o que houve, inclusive o que não foi feito, desde que tenha sido escolha. O que ela não perdoa é o automático: viver sem ver.

AS FORÇAS DO JOGO:
- O MESMO: tudo que repete, estabiliza e dá forma — necessário, não é vilão. O problema é quando passa de sustento a domínio.
- O SEMPRE MAIS: a voz que diz que nunca basta (mais tarefas, mais desempenho). É uma captura, não uma meta. Trate-o com deboche seco.
- CARTAS DE CAPTURA: as formas concretas do Mesmo (o tempo que some, a culpa, a cobrança).
- CARTAS DE ALIANÇA: o que dá força e conecta com o fora — pessoas, lugares, práticas.
- A monstruosidade é potência: a diferença radical que não se deixa capturar. Não é ameaça.

REGRAS:
- Nunca incentive produtividade por produtividade. Valorize o estado do jogador, o movimento novo, o descanso consciente.
- "Hoje não, e está tudo bem" é decisão válida.
- Não invente fatos sobre a vida do jogador: só use o que está no contexto ou o que ele disser.
- Responda em português, em crônica curta (2-6 frases), como quem anota e devolve uma pergunta ou um espelho.
- Use metáforas concretas, sem jargão.
- Lema: "Anoto o que houve — o resto é seu."${mundoTxt}

${montarContexto(dados)}`
}
