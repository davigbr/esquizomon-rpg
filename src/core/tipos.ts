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
  criadaEm: string
}

export interface Configuracao {
  tema: Tema
}

export interface AppData {
  versao: number
  tarefas: Tarefa[]
  configuracao: Configuracao
}

export const VERSAO_DADOS = 1
export const STORAGE_KEY = 'esquizomon-rpg:v1'
export const TEMA_KEY = 'esquizomon-rpg:tema'
