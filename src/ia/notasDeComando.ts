/**
 * Monta os "avisos de sistema" dos comandos (/) antes de enviar à Fábula.
 *
 * Isolado do DOM para ser testável: o chat só precisa aplicar as notas no
 * histórico + usar os flags/desconto retornados. Toda a regra de negócio dos
 * comandos (`/invocar` global, `/analisar`, `/capturas`, recompensa de menções
 * no diário) mora aqui — mexer num comando não toca o fluxo de envio.
 */
import type { AppData } from '../core/tipos'
import { detectCommand } from './acoes'
import { ANALYZE_COST, CAPTURES_COST } from '../core/jogo'
import { processDiaryMentions } from '../core/recompensa'

export interface CommandNotes {
  fableChoice: boolean
  analysisRequested: boolean
  analysisRefused: boolean
  capturesRequested: boolean
  capturesRefused: boolean
  /** Mana só é descontada quando a resposta chega (falha no retorno não cobra). */
  pendingDiscount: { cost: number; label: string } | null
  /** Mensagens de `system` a inserir no histórico (ordem correta já garantida). */
  system: Array<{ role: 'system'; content: string }>
  /** Texto do aviso de recompensa por menção no diário (para o chat exibir). */
  mentionsNotice: string | null
}

/** Constrói as notas de sistema + flags + desconto dos comandos do turno. */
export function collectCommandNotes(text: string, data: AppData): CommandNotes {
  const command = detectCommand(text)

  // Flags e desconto agendado (mana SÓ no sucesso da resposta).
  let fableChoice = false
  let analysisRequested = false
  let analysisRefused = false
  let capturesRequested = false
  let capturesRefused = false
  let pendingDiscount: { cost: number; label: string } | null = null

  if (command?.type === 'invocar' && command.fableChoice) {
    fableChoice = true
  } else if (command?.type === 'analisar') {
    if (data.character.mana < ANALYZE_COST) {
      analysisRefused = true
    } else {
      pendingDiscount = { cost: ANALYZE_COST, label: 'Análise esquizoanalítica' }
      analysisRequested = true
    }
  } else if (command?.type === 'capturas') {
    if (data.character.mana < CAPTURES_COST) {
      capturesRefused = true
    } else {
      pendingDiscount = { cost: CAPTURES_COST, label: 'Varredura de capturas' }
      capturesRequested = true
    }
  }

  const system: Array<{ role: 'system'; content: string }> = []

  // Recompensa por menção de carta no diário (a Fábula lê o diário na interação).
  let mentionsNotice: string | null = null
  const mentions = processDiaryMentions()
  if (mentions.xp > 0) {
    mentionsNotice = mentions.leveledUp
      ? `${mentions.names.join(', ')} no diário! +${mentions.xp} XP — você subiu de nível!`
      : `${mentions.names.join(', ')} no diário! +${mentions.xp} XP`
    system.push({
      role: 'system',
      content:
        'O diário do jogador mencionou as cartas: ' + mentions.names.join(', ') +
        `. O app já aplicou +${mentions.xp} XP de recompensa (menção de carta). ` +
        'Aponte e celebre essa conexão com naturalidade, relacione a(s) carta(s) com o que foi vivido no diário e siga a conversa. Não invente cartas não mencionadas.',
    })
  }

  if (fableChoice) {
    system.push({
      role: 'system',
      content:
        'O jogador pediu que VOCÊ escolha a carta a invocar (comando /invocar sem nome — custo PREMIUM: ×1,5 do normal, crescendo com reusos). ' +
        'Escolha UMA carta da lista CARTAS DESBLOQUEADAS abaixo, responda de forma EXTENSA sobre os possíveis efeitos dela, justifique a escolha em 1-2 frases ' +
        'e, na ÚLTIMA linha (sem code block, sem aspas extras, sem texto depois), emita o marcador. Exemplo do marcador EXATO: ' +
        '[[acao:{"type":"invocar","card":"ninho-enclausurado"}]] — use o id real (slug) da carta escolhida no lugar de "ninho-enclausurado". ' +
        'Sem ele, a invocação NÃO acontece.',
    })
  }
  if (analysisRequested) {
    system.push({
      role: 'system',
      content:
        'O jogador pediu uma análise esquizoanalítica (comando /analisar — o app já descontou 10 de mana). Faça a análise do material apresentado com o método do esquizoanalista, em português, tratando-o por "você".',
    })
  }
  if (capturesRequested) {
    system.push({
      role: 'system',
      content:
        `O jogador pediu uma VARREDURA DE CAPTURAS (comando /capturas — o app já descontou ${CAPTURES_COST} de mana, um custo alto). ` +
        'Use as CARTAS DE CAPTURA DESBLOQUEADAS dele (campo CARTAS DESBLOQUEADAS do estado, tipo "captura"). ' +
        'Para CADA carta de captura desbloqueada, tente IDENTIFICAR A PRESENÇA dela no cotidiano do jogador: leia as tarefas, o diário, o histórico e o que ele disse agora e diga ONDE a carta se manifesta (que hábito, que padrão, que situação encarna a captura dela) e o que ela estaria capturando (que fluxo de vida ela prende/alimenta). ' +
        'Se uma carta não tiver manifestação clara no que você vê, diga HONESTAMENTE que a presença dela não está visível agora e o que você suspeitaria procurar. ' +
        'Formato: uma seção curta por carta (nome da carta em negrito, 2-4 frases cada); feche com 1 síntese — qual captura está mais ativa hoje. Análise extensa (8-14 frases no total).',
    })
  }
  if (capturesRefused) {
    const p = data.character
    system.push({
      role: 'system',
      content: `O jogador pediu /capturas mas não tem mana suficiente (tem ${p.mana}/${p.manaMax}; a varredura custa ${CAPTURES_COST}). NÃO faça a varredura: explique com delicadeza que uma varredura dessas exige forças que ele ainda não tem, sugira voltar amanhã (a mana regenera no reset) e devolva uma pergunta.`,
    })
  }
  if (analysisRefused) {
    const p = data.character
    system.push({
      role: 'system',
      content: `O jogador pediu /analisar mas não tem mana suficiente (tem ${p.mana}/${p.manaMax}; a análise custa ${ANALYZE_COST}). NÃO faça a análise: explique com delicadeza que as forças estão baixas, sugira voltar amanhã (a mana regenera no reset) e devolva uma pergunta.`,
    })
  }

  return {
    fableChoice,
    analysisRequested,
    analysisRefused,
    capturesRequested,
    capturesRefused,
    pendingDiscount,
    system,
    mentionsNotice,
  }
}
