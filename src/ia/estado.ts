/** Serialização do estado do app para enviar à IA como contexto.
 *  `buildDiaryContext(dados)` alimenta o placeholder `{diario}` (persona);
 *  `buildContext(dados)` é o estado do jogo (sempre injetado após a persona). */

import type { AppData } from '../core/tipos'
import { listDiary } from '../stores/app'
import { todayISO } from '../core/jogo'
import type { Card } from '../core/baralho'
import deckData from '../data/deck.json'

/** O deck (import estático — síncrono, mesma fonte da galeria). */
const deck = deckData as Card[]

/** Quantas entradas recentes do diário entram no placeholder {diario}.
 *  NA ÍNTEGRA (sem truncamento — decisão do usuário: a Fábula lê o diário de verdade). */
const RECENT_DIARY_IN_CONTEXT = 5

/** Últimas N entradas do diário em texto (placeholder {diario}) — na íntegra. */
export function buildDiaryContext(): string {
  const recentDiary = listDiary({ limit: RECENT_DIARY_IN_CONTEXT })
    .map((e) => {
      const title = e.title ? ` — ${e.title}` : ''
      return `- [${e.date}]${title}\n${e.text}`
    })
    .join('\n\n')

  return `${recentDiary || '- sem entradas ainda'}

O diário tem mais entradas além das ${RECENT_DIARY_IN_CONTEXT} mostradas acima. Se o jogador perguntar sobre algo que pode estar numa entrada antiga, diga que não viu essa entrada ainda e peça a data ou o tema — ou sugira abrir a página Diário.`
}

/** Serializa o estado do jogo em texto legível (sempre após a persona). */
export function buildContext(data: AppData): string {
  const today = todayISO()
  const p = data.character

  const tasks = data.tasks
    .map((t) => {
      const done =
        t.type === 'unica'
          ? t.done
          : t.type === 'recorrente'
            ? t.history.includes(today)
            : (t.counter?.today ?? 0) > 0
      const sign = t.type === 'habito' ? ` (sinal: ${t.sign ?? 'positivo'})` : ''
      const tags = t.tags.length ? ` #${t.tags.join(' #')}` : ''
      const due = t.dueDate ? ` (vence ${t.dueDate})` : ''
      return `- ${done ? '[✓]' : '[ ]'} ${t.title} (${t.type}, ${t.difficulty}${due})${sign}${tags}`
    })
    .join('\n')

  const invocations = Object.entries(p.invocations)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => `- ${id} × ${n}`)
    .join('\n')

  const recentHistory = data.log
    .slice(0, 5)
    .map((e) => `- ${e.type}: ${e.text}`)
    .join('\n')

  // Cartas desbloqueadas (id → nome) — a Fábula precisa do id pra invocar
  // via marcador e do nome pra conversar sobre a carta.
  const unlockedCards = deck
    .filter((c) => p.cards.includes(c.id))
    .map((c) => `- ${c.id} → ${c.name} (${c.type})`)
    .join('\n')

  return `DATA DE HOJE: ${today}
PERSONAGEM:
${p.monsterName?.trim() ? `NOME MONSTRUOSO: ${p.monsterName.trim()} (é como você chama o jogador)` : ''}
- Nível ${p.level} · XP ${p.xp}/${p.xpNext}${p.exhausted ? ' (ESGOTADO)' : ''}
- Vida ${p.hp}/${p.hpMax} · Mana ${p.mana}/${p.manaMax}
- Cartas desbloqueadas: ${unlockedCards ? p.cards.length : 0}/65
${invocations ? `\nINVOCAÇÕES RECENTES (id × vezes):\n${invocations}\n` : ''}
TAREFAS (${data.tasks.length}):
${tasks || '- nenhuma tarefa'}

MODO RELAXADO: ${data.settings.relaxedMode ? 'sim (sem dano)' : 'não'}

HISTÓRICO RECENTE (últimos 5 eventos do jogo):
${recentHistory || '- sem eventos ainda'}

CARTAS DESBLOQUEADAS (id → nome, para usar no marcador de invocação):
${unlockedCards || '- nenhuma carta ainda'}

AÇÕES DISPONÍVEIS (como agir no jogo):
- INVOCAÇÃO É DO APP, NÃO SUA: você NUNCA invoca cartas e NUNCA usa marcador de ação. Quando o jogador quiser invocar, ele usa o VERBO explicitamente ("invoca a carta X", "pode invocar X?") — o APP detecta, desconta a mana e te avisa numa mensagem de sistema. Você então escreve a resposta EXTENSA e compreensiva sobre a carta (efeitos possíveis na vida dele — o que torna visível, o que observar, como compor com ela), narrando a chegada dela.
- MENCIONAR NÃO É INVOCAR: se o jogador apenas citar, comentar ou elogiar uma carta (ex.: "essa carta me visitou", "gosto do Ninho Enclausurado", "o que você acha da carta X?"), NÃO invoque e NÃO trate como invocação — comente a carta como conceito vivo, analise, componha, mas sem gastar nada. Só o verbo invocar dispara o app.
- IMAGEM DA CARTA: quando uma carta for invocada (o app avisa na mensagem de sistema), inclua o marcador [[carta:<id>]] na sua resposta — a interface o substitui pela miniatura.
- Carta bloqueada pedida (com o verbo): diga que ela ainda não se revelou e desperte a curiosidade. Mana insuficiente: recuse com delicadeza ("guarde suas forças — amanhã a mana volta"). Ambas as recusas vêm do app; respeite.
- Seu papel é estimular a independência: após ajudar com uma carta, devolva a pergunta ao jogador ("e você, o que faria?").`
}
