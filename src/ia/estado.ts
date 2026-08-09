/** Serialização do estado do app para enviar à IA como contexto.
 *  A função principal é `montarContexto(dados)` — texto que vai no system prompt. */

import type { AppData } from '../core/tipos'
import { listarDiario } from '../stores/app'
import { hojeISO } from '../core/jogo'

/** Quantas entradas recentes do diário entram automaticamente no system prompt. */
const DIARIO_RECENTE_NO_CONTEXTO = 3
/** Tamanho máximo de cada entrada no contexto (chars). */
const DIARIO_RECENTE_TRUNCAR = 600

/** Serializa o estado do app em texto legível. */
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

  const cartasTotal = dados.personagem.cartas.length
  const invocacoes = Object.entries(p.invocacoes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => `- ${id} × ${n}`)
    .join('\n')

  const historicoRecente = dados.log
    .slice(0, 5)
    .map((e) => `- ${e.tipo}: ${e.texto}`)
    .join('\n')

  const diarioRecente = listarDiario({ limite: DIARIO_RECENTE_NO_CONTEXTO })
    .map((e) => {
      const titulo = e.titulo ? ` — ${e.titulo}` : ''
      const texto = e.texto.length > DIARIO_RECENTE_TRUNCAR
        ? e.texto.slice(0, DIARIO_RECENTE_TRUNCAR) + '…'
        : e.texto
      return `- [${e.data}]${titulo}\n  ${texto}`
    })
    .join('\n')

  return `DATA DE HOJE: ${hoje}
PERSONAGEM:
- Nível ${p.nivel} · XP ${p.xp}/${p.xpProximo}${p.esgotado ? ' (ESGOTADO)' : ''}
- Vida ${p.hp}/${p.hpMax} · Mana ${p.mana}/${p.manaMax}
- Cartas desbloqueadas: ${cartasTotal}/65
${invocacoes ? `\nINVOCAÇÕES RECENTES:\n${invocacoes}\n` : ''}
TAREFAS (${dados.tarefas.length}):
${tarefas || '- nenhuma tarefa'}

ESFERAS (perfil de onde a energia vai):
${esferasTxt}

MODO RELAXADO: ${dados.configuracao.modoRelaxado ? 'sim (sem dano)' : 'não'}

HISTÓRICO RECENTE (últimos 5 eventos do jogo):
${historicoRecente || '- sem eventos ainda'}

DIÁRIO — ÚLTIMAS ${DIARIO_RECENTE_NO_CONTEXTO} ENTRADAS (mais recente primeiro):
${diarioRecente || '- sem entradas ainda'}

O diário tem mais entradas além das ${DIARIO_RECENTE_NO_CONTEXTO} mostradas acima. Se o jogador perguntar sobre algo que pode estar numa entrada antiga, diga que não viu essa entrada ainda e peça a data ou o tema — ou sugira abrir a página Diário.`
}
