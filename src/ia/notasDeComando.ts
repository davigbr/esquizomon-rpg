/**
 * Monta os "avisos de sistema" dos comandos (/) antes de enviar à Fábula.
 *
 * Isolado do DOM para ser testável: o chat só precisa aplicar as notas no
 * histórico + usar os flags/desconto retornados. Toda a regra de negócio dos
 * comandos (`/invocar` global, `/analisar`, `/capturas`, recompensa de menções
 * no diário) mora aqui — mexer num comando não toca o fluxo de envio.
 */
import type { AppData } from '../core/tipos'
import { detectarComando } from './acoes'
import { CUSTO_ANALISE, CUSTO_CAPTURAS } from '../core/jogo'
import { processarMencoesDiario } from '../core/recompensa'

export interface NotasDeComando {
  escolhaFabula: boolean
  analisePedida: boolean
  analiseRecusada: boolean
  capturasPedidas: boolean
  capturasRecusadas: boolean
  /** Mana só é descontada quando a resposta chega (falha no retorno não cobra). */
  descontoPendente: { custo: number; rotulo: string } | null
  /** Mensagens de `system` a inserir no histórico (ordem correta já garantida). */
  sistema: Array<{ role: 'system'; content: string }>
  /** Texto do aviso de recompensa por menção no diário (para o chat exibir). */
  avisoMencoes: string | null
}

/** Constrói as notas de sistema + flags + desconto dos comandos do turno. */
export function coletarNotasDeComando(texto: string, dados: AppData): NotasDeComando {
  const comando = detectarComando(texto)

  // Flags e desconto agendado (mana SÓ no sucesso da resposta).
  let escolhaFabula = false
  let analisePedida = false
  let analiseRecusada = false
  let capturasPedidas = false
  let capturasRecusadas = false
  let descontoPendente: { custo: number; rotulo: string } | null = null

  if (comando?.tipo === 'invocar' && comando.escolhaFabula) {
    escolhaFabula = true
  } else if (comando?.tipo === 'analisar') {
    if (dados.personagem.mana < CUSTO_ANALISE) {
      analiseRecusada = true
    } else {
      descontoPendente = { custo: CUSTO_ANALISE, rotulo: 'Análise esquizoanalítica' }
      analisePedida = true
    }
  } else if (comando?.tipo === 'capturas') {
    if (dados.personagem.mana < CUSTO_CAPTURAS) {
      capturasRecusadas = true
    } else {
      descontoPendente = { custo: CUSTO_CAPTURAS, rotulo: 'Varredura de capturas' }
      capturasPedidas = true
    }
  }

  const sistema: Array<{ role: 'system'; content: string }> = []

  // Recompensa por menção de carta no diário (a Fábula lê o diário na interação).
  let avisoMencoes: string | null = null
  const mencoes = processarMencoesDiario()
  if (mencoes.xp > 0) {
    avisoMencoes = mencoes.nivelSubiu
      ? `${mencoes.nomes.join(', ')} no diário! +${mencoes.xp} XP — você subiu de nível!`
      : `${mencoes.nomes.join(', ')} no diário! +${mencoes.xp} XP`
    sistema.push({
      role: 'system',
      content:
        'O diário do jogador mencionou as cartas: ' + mencoes.nomes.join(', ') +
        `. O app já aplicou +${mencoes.xp} XP de recompensa (menção de carta). ` +
        'Aponte e celebre essa conexão com naturalidade, relacione a(s) carta(s) com o que foi vivido no diário e siga a conversa. Não invente cartas não mencionadas.',
    })
  }

  if (escolhaFabula) {
    sistema.push({
      role: 'system',
      content:
        'O jogador pediu que VOCÊ escolha a carta a invocar (comando /invocar sem nome — custo PREMIUM: ×1,5 do normal: monstro 6, captura 12, aliança 18, crescendo com reusos). ' +
        'Escolha UMA carta desbloqueada (lista CARTAS DESBLOQUEADAS abaixo) que sirva ao momento dele, justifique a escolha em 1-2 frases, responda de forma EXTENSA sobre os possíveis efeitos dela, ' +
        'e emita o marcador exato na última linha: [[acao:{"tipo":"invocar","carta":"<id>"}]] — o app valida a mana premium e executa.',
    })
  }
  if (analisePedida) {
    sistema.push({
      role: 'system',
      content:
        'O jogador pediu uma análise esquizoanalítica (comando /analisar — o app já descontou 10 de mana). Faça a análise do material apresentado com o método do esquizoanalista, em português, tratando-o por "você".',
    })
  }
  if (capturasPedidas) {
    sistema.push({
      role: 'system',
      content:
        `O jogador pediu uma VARREDURA DE CAPTURAS (comando /capturas — o app já descontou ${CUSTO_CAPTURAS} de mana, um custo alto). ` +
        'Use as CARTAS DE CAPTURA DESBLOQUEADAS dele (campo CARTAS DESBLOQUEADAS do estado, tipo "captura"). ' +
        'Para CADA carta de captura desbloqueada, tente IDENTIFICAR A PRESENÇA dela no cotidiano do jogador: leia as tarefas, o diário, o histórico e o que ele disse agora e diga ONDE a carta se manifesta (que hábito, que padrão, que situação encarna a captura dela) e o que ela estaria capturando (que fluxo de vida ela prende/alimenta). ' +
        'Se uma carta não tiver manifestação clara no que você vê, diga HONESTAMENTE que a presença dela não está visível agora e o que você suspeitaria procurar. ' +
        'Formato: uma seção curta por carta (nome da carta em negrito, 2-4 frases cada); feche com 1 síntese — qual captura está mais ativa hoje. Análise extensa (8-14 frases no total).',
    })
  }
  if (capturasRecusadas) {
    const p = dados.personagem
    sistema.push({
      role: 'system',
      content: `O jogador pediu /capturas mas não tem mana suficiente (tem ${p.mana}/${p.manaMax}; a varredura custa ${CUSTO_CAPTURAS}). NÃO faça a varredura: explique com delicadeza que uma varredura dessas exige forças que ele ainda não tem, sugira voltar amanhã (a mana regenera no reset) e devolva uma pergunta.`,
    })
  }
  if (analiseRecusada) {
    const p = dados.personagem
    sistema.push({
      role: 'system',
      content: `O jogador pediu /analisar mas não tem mana suficiente (tem ${p.mana}/${p.manaMax}; a análise custa ${CUSTO_ANALISE}). NÃO faça a análise: explique com delicadeza que as forças estão baixas, sugira voltar amanhã (a mana regenera no reset) e devolva uma pergunta.`,
    })
  }

  return {
    escolhaFabula,
    analisePedida,
    analiseRecusada,
    capturasPedidas,
    capturasRecusadas,
    descontoPendente,
    sistema,
    avisoMencoes,
  }
}
