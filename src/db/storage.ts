/** Persistência versionada + wrapper seguro (fallback em memória quando localStorage é bloqueado). */

import type { AppData, Configuracao, Tarefa, Tema } from '../core/tipos'
import { STORAGE_KEY, TEMA_KEY, VERSAO_DADOS } from '../core/tipos'

const memory = new Map<string, string>()

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    memory.set(key, value)
  }
}

export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    memory.delete(key)
  }
}

/* ---------- tema ---------- */

export function temaInicial(): Tema {
  return storageGet(TEMA_KEY) === 'light' ? 'light' : 'dark'
}

export function salvarTema(tema: Tema): void {
  storageSet(TEMA_KEY, tema)
}

/* ---------- validação e normalização ---------- */

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function ehTarefa(v: unknown): v is Tarefa {
  if (!ehObjeto(v)) return false
  const t = v as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    (t.tipo === 'recorrente' || t.tipo === 'unica' || t.tipo === 'habito') &&
    typeof t.titulo === 'string' &&
    ['facil', 'media', 'dificil', 'extrema'].includes(String(t.dificuldade)) &&
    Array.isArray(t.tags) &&
    Array.isArray(t.historico)
  )
}

function normalizarTarefa(v: unknown): Tarefa | null {
  if (!ehTarefa(v)) return null
  const t = v
  const agenda =
    t.agenda && typeof t.agenda === 'object' && Array.isArray((t.agenda as { dias?: unknown }).dias)
      ? {
          dias: ((t.agenda as { dias: unknown[] }).dias).filter((d): d is number => typeof d === 'number'),
          diasDoMes: Array.isArray((t.agenda as { diasDoMes?: unknown }).diasDoMes)
            ? ((t.agenda as { diasDoMes: unknown[] }).diasDoMes).filter((d): d is number => typeof d === 'number' && d >= 1 && d <= 31)
            : undefined,
        }
      : undefined
  const contador =
    t.contador && typeof t.contador === 'object'
      ? {
          hoje: typeof (t.contador as { hoje?: unknown }).hoje === 'number' ? (t.contador as { hoje: number }).hoje : 0,
          totalPositivo:
            typeof (t.contador as { totalPositivo?: unknown }).totalPositivo === 'number'
              ? (t.contador as { totalPositivo: number }).totalPositivo
              : 0,
          totalNegativo:
            typeof (t.contador as { totalNegativo?: unknown }).totalNegativo === 'number'
              ? (t.contador as { totalNegativo: number }).totalNegativo
              : 0,
        }
      : undefined
  const sinal =
    t.sinal === 'positivo' || t.sinal === 'negativo' || t.sinal === 'ambos' ? t.sinal : t.tipo === 'habito' ? 'positivo' : undefined
  const dueDate =
    typeof t.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ? t.dueDate : undefined
  return {
    id: t.id,
    tipo: t.tipo,
    titulo: t.titulo,
    dificuldade: t.dificuldade,
    tags: t.tags.filter((x): x is string => typeof x === 'string'),
    dueDate,
    notas: typeof t.notas === 'string' ? t.notas : undefined,
    agenda,
    sinal,
    contador,
    concluida: t.concluida === true,
    historico: t.historico.filter((x): x is string => typeof x === 'string'),
    criadaEm: typeof t.criadaEm === 'string' ? t.criadaEm : new Date().toISOString(),
  }
}

function normalizarConfiguracao(v: unknown): Configuracao {
  const tema = ehObjeto(v) && (v.tema === 'light' || v.tema === 'dark') ? v.tema : 'dark'
  return { tema }
}

/** Valida e normaliza um dado bruto (de localStorage ou import). Null se irreparável. */
export function normalizarDados(bruto: unknown): AppData | null {
  if (!ehObjeto(bruto)) return null
  const b = bruto as Record<string, unknown>
  const tarefasBrutas = Array.isArray(b.tarefas) ? b.tarefas : []
  const tarefas: Tarefa[] = []
  for (const t of tarefasBrutas) {
    const ok = normalizarTarefa(t)
    if (ok) tarefas.push(ok)
  }
  return {
    versao: VERSAO_DADOS,
    tarefas,
    configuracao: normalizarConfiguracao(b.configuracao),
  }
}

/** Estado padrão de primeira execução. */
export function estadoVazio(): AppData {
  return { versao: VERSAO_DADOS, tarefas: [], configuracao: { tema: temaInicial() } }
}

export function carregar(): AppData {
  const bruto = storageGet(STORAGE_KEY)
  if (!bruto) return estadoVazio()
  try {
    const normalizado = normalizarDados(JSON.parse(bruto))
    return normalizado ?? estadoVazio()
  } catch {
    return estadoVazio()
  }
}

export function salvar(dados: AppData): void {
  storageSet(STORAGE_KEY, JSON.stringify(dados))
}

export function apagarTudo(): void {
  storageRemove(STORAGE_KEY)
}
