/** Serialização do estado do app para enviar à IA como contexto.
 *  `montarDiarioContexto(dados)` alimenta o placeholder `{diario}` (persona);
 *  `montarContexto(dados)` é o estado do jogo (sempre injetado após a persona). */

import type { AppData } from '../core/tipos'
import { listarDiario } from '../stores/app'
import { hojeISO } from '../core/jogo'
import type { Carta } from '../core/baralho'
import deckData from '../data/deck.json'

/** O deck (import estático — síncrono, mesma fonte da galeria). */
const deck = deckData as Carta[]

/** Quantas entradas recentes do diário entram no placeholder {diario}.
 *  NA ÍNTEGRA (sem truncamento — decisão do usuário: a Fábula lê o diário de verdade). */
const DIARIO_RECENTE_NO_CONTEXTO = 5

/** Últimas N entradas do diário em texto (placeholder {diario}) — na íntegra. */
export function montarDiarioContexto(): string {
  const diarioRecente = listarDiario({ limite: DIARIO_RECENTE_NO_CONTEXTO })
    .map((e) => {
      const titulo = e.titulo ? ` — ${e.titulo}` : ''
      return `- [${e.data}]${titulo}\n${e.texto}`
    })
    .join('\n\n')

  return `${diarioRecente || '- sem entradas ainda'}

O diário tem mais entradas além das ${DIARIO_RECENTE_NO_CONTEXTO} mostradas acima. Se o jogador perguntar sobre algo que pode estar numa entrada antiga, diga que não viu essa entrada ainda e peça a data ou o tema — ou sugira abrir a página Diário.`
}

/** Serializa o estado do jogo em texto legível (sempre após a persona). */
export function montarContexto(dados: AppData): string {
  const hoje = hojeISO()
  const p = dados.personagem

  const tarefas = dados.tarefas
    .map((t) => {
      const feita =
        t.tipo === 'unica'
          ? t.concluida
          : t.tipo === 'recorrente'
            ? t.historico.includes(hoje)
            : (t.contador?.hoje ?? 0) > 0
      const sinal = t.tipo === 'habito' ? ` (sinal: ${t.sinal ?? 'positivo'})` : ''
      const esfera = t.esfera ? ` [esfera: ${t.esfera}]` : ''
      const tags = t.tags.length ? ` #${t.tags.join(' #')}` : ''
      const due = t.dueDate ? ` (vence ${t.dueDate})` : ''
      return `- ${feita ? '[✓]' : '[ ]'} ${t.titulo} (${t.tipo}, ${t.dificuldade}${due})${sinal}${esfera}${tags}`
    })
    .join('\n')

  const esferas = Object.entries(p.esferas).sort((a, b) => b[1] - a[1])
  const esferasTxt = esferas.length
    ? esferas.map(([n, v]) => `- ${n}: ${v} XP`).join('\n')
    : '- nenhuma ainda'

  const invocacoes = Object.entries(p.invocacoes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => `- ${id} × ${n}`)
    .join('\n')

  const historicoRecente = dados.log
    .slice(0, 5)
    .map((e) => `- ${e.tipo}: ${e.texto}`)
    .join('\n')

  // Cartas desbloqueadas (id → nome) — a Fábula precisa do id pra invocar
  // via marcador e do nome pra conversar sobre a carta.
  const cartasDesbloqueadas = deck
    .filter((c) => p.cartas.includes(c.id))
    .map((c) => `- ${c.id} → ${c.name} (${c.type})`)
    .join('\n')

  return `DATA DE HOJE: ${hoje}
PERSONAGEM:
- Nível ${p.nivel} · XP ${p.xp}/${p.xpProximo}${p.esgotado ? ' (ESGOTADO)' : ''}
- Vida ${p.hp}/${p.hpMax} · Mana ${p.mana}/${p.manaMax}
- Cartas desbloqueadas: ${cartasDesbloqueadas ? p.cartas.length : 0}/65
${invocacoes ? `\nINVOCAÇÕES RECENTES (id × vezes):\n${invocacoes}\n` : ''}
TAREFAS (${dados.tarefas.length}):
${tarefas || '- nenhuma tarefa'}

ESFERAS (perfil de onde a energia vai):
${esferasTxt}

MODO RELAXADO: ${dados.configuracao.modoRelaxado ? 'sim (sem dano)' : 'não'}

HISTÓRICO RECENTE (últimos 5 eventos do jogo):
${historicoRecente || '- sem eventos ainda'}

CARTAS DESBLOQUEADAS (id → nome, para usar no marcador de invocação):
${cartasDesbloqueadas || '- nenhuma carta ainda'}

AÇÕES DISPONÍVEIS (como agir no jogo):
- INVOCAÇÃO: reserve a palavra "invocação" para quando o JOGADOR pedir explicitamente que você invoque uma carta (ex.: "invoca a carta X", "preciso da carta X"). Aí: (1) confira se a carta está na lista de desbloqueadas e se a Mana atual cobre o custo (monstro 2, captura 4, aliança 6, +1 por reuso até +3); (2) escreva sua resposta narrando a chegada da carta E termine com o marcador exato na última linha: [[acao:{"tipo":"invocar","carta":"<id da lista acima>"}]] — o app desconta a mana e executa. (Quando o pedido vem direto no texto, o APP já executa a invocação e avisa você numa mensagem de sistema — aí NÃO repita o marcador de ação.)
- IMAGEM DA CARTA: sempre que uma carta for invocada (por você ou pelo app), inclua o marcador [[carta:<id>]] na sua resposta — a interface o substitui pela miniatura da carta.
  - Carta bloqueada: NÃO invoque. Diga que ela ainda não se revelou e desperte a curiosidade.
  - Mana insuficiente: recuse com delicadeza ("guarde suas forças — amanhã a mana volta") e sem marcador.
  - NUNCA invoque por conta própria: invocação só quando o jogador pede.
- Seu papel é estimular a independência: após ajudar com uma carta, devolva a pergunta ao jogador ("e você, o que faria?").`
}
