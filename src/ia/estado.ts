/** Serialization of the app state to send to the AI as context.
 *  `buildDiaryContext(dados)` feeds the `{diario}` placeholder (persona);
 *  `buildContext(dados)` is the game state (always injected after the persona). */

import type { AppData, DiaryEntry, DiaryNote } from '../core/tipos'
import { appStore } from '../stores/app'
import { todayISO } from '../core/jogo'
import type { Card } from '../core/baralho'
import deckData from '../data/deck.json'

/** The deck (static import — synchronous, same source as the gallery). */
const deck = deckData as Card[]

/** How many recent diary entries go into the {diario} placeholder.
 *  IN FULL (no truncation — the user's decision: the Fable really reads the diary). */
const RECENT_DIARY_IN_CONTEXT = 5

/** Last N diary days as text ({diario} placeholder) — in full. The chronicle
 *  and the quick notes of the same day are grouped together. */
export function buildDiaryContext(): string {
  const d = appStore.get()
  const byDate = new Map<string, { chronicle?: DiaryEntry; notes: DiaryNote[] }>()
  for (const e of d.diary ?? []) {
    const g = byDate.get(e.date) ?? { notes: [] }
    g.chronicle = e
    byDate.set(e.date, g)
  }
  for (const n of d.notes ?? []) {
    const g = byDate.get(n.date) ?? { notes: [] }
    g.notes.push(n)
    byDate.set(n.date, g)
  }
  const dates = [...byDate.keys()].sort().reverse().slice(0, RECENT_DIARY_IN_CONTEXT)

  if (dates.length === 0) {
    return `- sem entradas ainda

O diário tem mais entradas além das ${RECENT_DIARY_IN_CONTEXT} mostradas acima. Se o jogador perguntar sobre algo que pode estar numa entrada antiga, diga que não viu essa entrada ainda e peça a data ou o tema — ou sugira abrir a página Diário.`
  }

  const recentDiary = dates
    .map((date) => {
      const g = byDate.get(date)!
      const parts: string[] = []
      if (g.chronicle) {
        const title = g.chronicle.title ? ` — ${g.chronicle.title}` : ''
        const cidade = g.chronicle.cidade ? ` (em ${g.chronicle.cidade})` : ''
        parts.push(`Crônica:${title}${cidade}\n${g.chronicle.text}`)
      }
      const noteLines = g.notes
        .slice()
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((n) => `- (${n.time})${n.cidade ? ` em ${n.cidade}` : ''} ${n.text}`)
      if (noteLines.length > 0) parts.push(`Notas do dia:\n${noteLines.join('\n')}`)
      return `[${date}]\n${parts.join('\n\n')}`
    })
    .join('\n\n')

  return `${recentDiary}

O diário tem mais entradas além das ${RECENT_DIARY_IN_CONTEXT} mostradas acima. Se o jogador perguntar sobre algo que pode estar numa entrada antiga, diga que não viu essa entrada ainda e peça a data ou o tema — ou sugira abrir a página Diário.`
}

/** Serializes the game state into readable text (always after the persona). */
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

  // Unlocked cards (id → name) — the Fable needs the id to invoke
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
