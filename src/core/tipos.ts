/** Tipos de dados do Esquizomon RPG — domínio puro, sem dependência de UI. */

export type TipoTarefa = 'recorrente' | 'unica' | 'habito'
export type Dificuldade = 'facil' | 'media' | 'dificil' | 'extrema'
/** Tema: 'sistema' segue o padrão do SO (preferência do usuário 2026-08-12). */
export type Tema = 'dark' | 'light' | 'sistema'

/** Agenda de uma tarefa recorrente.
 *  `dias` = dias da semana 0-6 (domingo = 0); vazio = todos os dias.
 *  `diasDoMes` = dias do mês 1-31; quando presente e não vazio, a tarefa vale nesses dias (mensal). */
export interface Agenda {
  dias: number[]
  diasDoMes?: number[]
}

/** Contador de um hábito. `hoje`/`hojeNeg` = repetições (pos/neg) de hoje;
 *  streaks derivados do histórico. */
export interface ContadorHabito {
  hoje: number
  hojeNeg: number
  totalPositivo: number
  totalNegativo: number
}

/** Personagem do jogador — nível, XP, HP, mana e baralho. */
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
  /** Ids das cartas do baralho desbloqueadas (galeria). */
  cartas: string[]
  /** Avatar do jogador: data URL JPEG comprimido (~5KB), exibido na status bar. */
  avatar?: string
  /** Nome monstruoso do personagem — bold ao lado do avatar (desktop apenas). */
  nomeMonstruoso?: string
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
  /** Recompensas concedidas por data de conclusão (para reverter ao desmarcar). */
  recompensas?: Record<string, RecompensaConclusao>
  criadaEm: string
}

/** Snapshot da recompensa de UMA conclusão — permite reverter XP/nível/cartas ao desmarcar.
 *  Guarda o estado ANTES do ganho (para restaurar) e o nível PÓS-ganho (para a guarda de reversão). */
export interface RecompensaConclusao {
  xp: number
  /** true se a conclusão subiu de nível. */
  subiu?: boolean
  /** Nível atingido por esta conclusão (reverte só se ninguém subiu depois). */
  nivel?: number
  /** Estado do personagem ANTES do ganho (restaurado ao desmarcar). */
  xpAntes?: number
  nivelAntes?: number
  xpProximoAntes?: number
  hpMaxAntes?: number
  manaMaxAntes?: number
  /** Cartas desbloqueadas por subir de nível (para remover ao reverter). */
  cartas?: string[]
}

export interface Configuracao {
  tema: Tema
  /** Modo relaxado: desliga o dano (jogo vira só bônus). */
  modoRelaxado?: boolean
  /** Configuração da Fábula (chat com IA, BYOK). */
  ia?: ConfigIa
  /** Resumo da vida do usuário ("Sobre você") — a Fábula usa pra te conhecer. */
  resumo?: string
  /** Efeitos sonoros (Web Audio, sintetizados) — padrão ligado. */
  sons?: boolean
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
  /** Menções de cartas já recompensadas por dia (data → ids de carta).
   *  Evita dar XP duas vezes pela mesma menção. */
  diarioXp?: Record<string, string[]>
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
  /** Ids das cartas já recompensadas por citação nesta entrada (dedup do +XP). */
  recompensas?: string[]
}
export const STORAGE_KEY = 'esquizomon-rpg:v1'
export const TEMA_KEY = 'esquizomon-rpg:tema'
