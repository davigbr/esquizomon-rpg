/** Tipos de dados do Esquizomon RPG — domínio puro, sem dependência de UI. */

export type TipoTarefa = 'recorrente' | 'unica' | 'habito'
export type Dificuldade = 'facil' | 'media' | 'dificil' | 'extrema'
export type Tema = 'dark' | 'light'

/** Agenda de uma tarefa recorrente.
 *  `dias` = dias da semana 0-6 (domingo = 0); vazio = todos os dias.
 *  `diasDoMes` = dias do mês 1-31; quando presente e não vazio, a tarefa vale nesses dias (mensal). */
export interface Agenda {
  dias: number[]
  diasDoMes?: number[]
}

/** Contador de um hábito. `hoje` = repetições positivas de hoje; streaks derivados do histórico. */
export interface ContadorHabito {
  hoje: number
  totalPositivo: number
  totalNegativo: number
}

/** Personagem do jogador — nível, XP, HP, mana, esferas e baralho. */
export interface Personagem {
  nivel: number
  xp: number
  xpProximo: number
  hp: number
  hpMax: number
  mana: number
  manaMax: number
  /** Morte não-destrutiva: HP ≤ 0 deixa o personagem esgotado até o próximo reset. */
  esgotado: boolean
  /** Data ISO do último reset diário processado (evita dano repetido no mesmo dia). */
  ultimoDia: string
  /** XP acumulado por esfera (perfil de onde a energia vai). */
  esferas: Record<string, number>
  /** Ids das cartas do baralho desbloqueadas (galeria). */
  cartas: string[]
  /** Nº de invocações por carta (custo de mana cresce até um teto). */
  invocacoes: Record<string, number>
}

export interface Tarefa {
  id: string
  tipo: TipoTarefa
  titulo: string
  dificuldade: Dificuldade
  tags: string[]
  /** Única: data de vencimento (YYYY-MM-DD). */
  dueDate?: string
  /** Esfera (domínio da vida) que a tarefa alimenta — fase 2. */
  esfera?: string
  notas?: string
  /** Recorrente: quais dias da semana vale (vazio = todos). */
  agenda?: Agenda
  /** Hábito: sinal. 'positivo' | 'negativo' | 'ambos'. */
  sinal?: 'positivo' | 'negativo' | 'ambos'
  contador?: ContadorHabito
  /** Única: concluída ou não. */
  concluida?: boolean
  /** Datas ISO (YYYY-MM-DD) de conclusões — recorrentes: dias concluídos; hábitos: dias com repetição positiva. */
  historico: string[]
  criadaEm: string
}

export interface Configuracao {
  tema: Tema
  /** Modo relaxado: desliga o dano (jogo vira só bônus). */
  modoRelaxado?: boolean
  /** Configuração da Fábula (chat com IA, BYOK). */
  ia?: ConfigIa
}

/** Provider de IA. MVP: deepseek e opencode Zen Go (ambos OpenAI-compatíveis). */
export type ProviderIA = 'nenhum' | 'deepseek' | 'opencode'

/** Configuração da Fábula (chat). Persistida em `configuracao.ia`. */
export interface ConfigIa {
  provider: ProviderIA
  /** Modelo a usar (vazio = modelo padrão do provider). */
  modelo: string
  /** Chave de API do usuário (BYOK — fica no localStorage). */
  apiKey: string
  /** System prompt editável pelo usuário. Vazio = usar o canônico (Fábula do NARRATIVA.md). */
  systemPrompt: string
}

/** Mensagem de uma conversa com a IA (formato OpenAI-compatível). */
export interface MensagemIA {
  role: 'user' | 'assistant'
  /** Texto visível. */
  content: string
  /** Raciocínio do modelo (DeepSeek R1, OpenAI o-series, Gemini thinking) — colapsável. */
  reasoning?: string
  /** ISO timestamp. */
  ts: string
}

/** Conversa com a IA. Múltiplas conversas persistidas. */
export interface Conversa {
  id: string
  /** Título automático (3-5 primeiras palavras da 1ª mensagem do usuário) ou editado. */
  titulo: string
  /** Mensagens em ordem cronológica. */
  mensagens: MensagemIA[]
  /** ISO da última atividade. */
  atualizadaEm: string
}

/** Tipo de evento do histórico (define ícone e cor na listagem). */
export type TipoLog = 'tarefa' | 'habito' | 'invocacao' | 'carta' | 'nivel' | 'dano' | 'sistema'

/** Evento do histórico de ações do jogo. */
export interface LogEvento {
  id: string
  /** Data/hora ISO (com tempo). */
  ts: string
  tipo: TipoLog
  texto: string
}

export interface AppData {
  versao: number
  tarefas: Tarefa[]
  personagem: Personagem
  configuracao: Configuracao
  /** Histórico extensivo de ações (mais recente primeiro). */
  log: LogEvento[]
  /** Conversas com a Fábula (chat com IA). Múltiplas, persistidas. */
  conversas?: Conversa[]
  /** Diário de bordo (1 entrada por dia, com texto/voz). Persistido. */
  diario?: EntradaDiario[]
}

export const VERSAO_DADOS = 3

/** Entrada do diário. Uma por dia (chave = data YYYY-MM-DD). */
export interface EntradaDiario {
  id: string
  /** Data da entrada (YYYY-MM-DD) — chave de unicidade. */
  data: string
  /** Título curto (opcional, o usuário pode deixar em branco). */
  titulo: string
  /** Texto da entrada (markdown-lite, como em notas de tarefa). */
  texto: string
  /** ISO timestamp de criação. */
  criadaEm: string
  /** ISO timestamp da última edição (undefined se nunca editada). */
  editadaEm?: string
}
export const STORAGE_KEY = 'esquizomon-rpg:v1'
export const TEMA_KEY = 'esquizomon-rpg:tema'
