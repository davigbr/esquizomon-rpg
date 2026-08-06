/** Serialização do estado do app para enviar à IA como contexto.
 *  A função principal é `montarContexto(dados)` — texto que vai no system prompt. */

import type { AppData } from '../core/tipos'
import { hojeISO } from '../core/jogo'

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

HISTÓRICO RECENTE (últimos 5 eventos):
${historicoRecente || '- sem eventos ainda'}`
}
