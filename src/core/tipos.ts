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
}

export const VERSAO_DADOS = 1
export const STORAGE_KEY = 'esquizomon-rpg:v1'
export const TEMA_KEY = 'esquizomon-rpg:tema'
