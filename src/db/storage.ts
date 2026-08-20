/** Persistência versionada + wrapper seguro (fallback em memória quando localStorage é bloqueado). */

import type { AppData, ConfigIa, Configuracao, Conversa, EntradaDiario, LogEvento, MensagemIA, Personagem, ProviderIA, RecompensaConclusao, Tarefa, Tema, TipoLog } from '../core/tipos'
import { STORAGE_KEY, TEMA_KEY, VERSAO_DADOS } from '../core/tipos'
import { hpMaxDe, manaMaxDe, personagemInicial, xpProximoDe } from '../core/jogo'

const memory = new Map<string, string>()

/* ---------- aviso de falha de persistência ----------
 * Quando o localStorage falha (quota cheia, modo privado, storage bloqueado),
 * a escrita cai no fallback em memória: o app segue "funcionando" mas os
 * dados somem no reload SEM aviso (bug real 2026-08-12). A UI registra um
 * callback aqui pra transformar a perda silenciosa em alerta. */

let avisarFalha: (motivo: string) => void = () => {}
let jaAvisou = false

/** A UI (main.ts) registra aqui para avisar o usuário quando a persistência falhar. */
export function aoFalharPersistencia(cb: (motivo: string) => void): void {
  avisarFalha = cb
}

function falhaPersistencia(motivo: string): void {
  console.error(`[storage] persistência falhou (${motivo}) — dados só em memória; some no reload`)
  if (jaAvisou) return
  jaAvisou = true
  avisarFalha(motivo)
}

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
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      falhaPersistencia('Armazenamento cheio — os dados podem não sobreviver ao reload. Exporte um backup em Config.')
    } else {
      falhaPersistencia('Navegador bloqueou o armazenamento (modo privado?) — os dados podem não sobreviver ao reload.')
    }
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
  const t = storageGet(TEMA_KEY)
  return t === 'light' || t === 'dark' ? t : 'sistema'
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
          hojeNeg: typeof (t.contador as { hojeNeg?: unknown }).hojeNeg === 'number' ? (t.contador as { hojeNeg: number }).hojeNeg : 0,
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
  let recompensas: Record<string, RecompensaConclusao> | undefined
  if (t.recompensas && typeof t.recompensas === 'object') {
    const rec: Record<string, RecompensaConclusao> = {}
    for (const [data, r] of Object.entries(t.recompensas as Record<string, unknown>)) {
      if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) continue
      if (!r || typeof r !== 'object') continue
      const rr = r as Record<string, unknown>
      if (typeof rr.xp !== 'number') continue
      rec[data] = {
        xp: rr.xp,
        subiu: rr.subiu === true,
        nivel: typeof rr.nivel === 'number' ? rr.nivel : undefined,
        xpAntes: typeof rr.xpAntes === 'number' ? rr.xpAntes : undefined,
        nivelAntes: typeof rr.nivelAntes === 'number' ? rr.nivelAntes : undefined,
        xpProximoAntes: typeof rr.xpProximoAntes === 'number' ? rr.xpProximoAntes : undefined,
        hpMaxAntes: typeof rr.hpMaxAntes === 'number' ? rr.hpMaxAntes : undefined,
        manaMaxAntes: typeof rr.manaMaxAntes === 'number' ? rr.manaMaxAntes : undefined,
        cartas: Array.isArray(rr.cartas) ? rr.cartas.filter((c): c is string => typeof c === 'string') : undefined,
      }
    }
    if (Object.keys(rec).length > 0) recompensas = rec
  }
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
    recompensas,
    criadaEm: typeof t.criadaEm === 'string' ? t.criadaEm : new Date().toISOString(),
    editadaEm: typeof t.editadaEm === 'string' ? t.editadaEm : (typeof t.criadaEm === 'string' ? t.criadaEm : undefined),
  }
}

function normalizarPersonagem(v: unknown): Personagem {
  const inicial = personagemInicial()
  if (!ehObjeto(v)) return inicial
  const p = v as Record<string, unknown>
  const nivel = typeof p.nivel === 'number' && p.nivel >= 1 ? Math.floor(p.nivel) : inicial.nivel
  const hpMax = hpMaxDe(nivel)
  const manaMax = manaMaxDe(nivel)
  const cartas = Array.isArray(p.cartas) ? p.cartas.filter((x): x is string => typeof x === 'string') : []
  const invocacoes: Record<string, number> = {}
  if (ehObjeto(p.invocacoes)) {
    for (const [k, val] of Object.entries(p.invocacoes as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof val === 'number' && val > 0) invocacoes[k] = Math.floor(val)
    }
  }
  return {
    nivel,
    xp: typeof p.xp === 'number' && p.xp >= 0 ? Math.floor(p.xp) : 0,
    xpProximo: typeof p.xpProximo === 'number' && p.xpProximo > 0 ? p.xpProximo : xpProximoDe(nivel),
    hp: typeof p.hp === 'number' ? Math.min(Math.max(0, Math.floor(p.hp)), hpMax) : hpMax,
    hpMax,
    mana: typeof p.mana === 'number' ? Math.min(Math.max(0, Math.floor(p.mana)), manaMax) : manaMax,
    manaMax,
    esgotado: p.esgotado === true,
    ultimoDia: typeof p.ultimoDia === 'string' ? p.ultimoDia : '',
    cartas,
    invocacoes,
    avatar:
      typeof p.avatar === 'string' && p.avatar.startsWith('data:image/') && p.avatar.length < 200_000
        ? p.avatar
        : undefined,
    nomeMonstruoso:
      typeof p.nomeMonstruoso === 'string' && p.nomeMonstruoso.trim()
        ? p.nomeMonstruoso.trim().slice(0, 40)
        : undefined,
  }
}

function normalizarConfiguracao(v: unknown): Configuracao {
  const tema = ehObjeto(v) && (v.tema === 'light' || v.tema === 'dark' || v.tema === 'sistema') ? v.tema : 'sistema'
  const modoRelaxado = ehObjeto(v) && v.modoRelaxado === true
  const ia = ehObjeto(v) ? normalizarConfigIa(v.ia) : undefined
  const out: Configuracao = { tema, modoRelaxado }
  if (ia) out.ia = ia
  if (ehObjeto(v) && typeof v.resumo === 'string' && v.resumo.trim()) out.resumo = v.resumo
  if (ehObjeto(v) && typeof v.sons === 'boolean') out.sons = v.sons
  return out
}

const PROVIDERS: ReadonlySet<string> = new Set(['nenhum', 'deepseek', 'opencode'])

function normalizarConfigIa(v: unknown): ConfigIa | undefined {
  if (!ehObjeto(v)) return undefined
  const provider: ProviderIA =
    typeof v.provider === 'string' && PROVIDERS.has(v.provider) ? (v.provider as ProviderIA) : 'nenhum'
  if (provider === 'nenhum') return undefined // sem provider configurado → não criar config
  // Migração v2 → v3: presets viraram texto livre. Se o usuário tinha
  // `preset === 'custom'` + `systemPromptCustom`, copia; senão mantém vazio
  // (= usa o canônico). O campo `preset` legado é ignorado.
  let systemPrompt = ''
  if (typeof v.systemPrompt === 'string') {
    systemPrompt = v.systemPrompt
  } else if (v.preset === 'custom' && typeof v.systemPromptCustom === 'string') {
    systemPrompt = v.systemPromptCustom
  }
  return {
    provider,
    modelo: typeof v.modelo === 'string' ? v.modelo : '',
    apiKey: typeof v.apiKey === 'string' ? v.apiKey : '',
    systemPrompt,
  }
}

/** Limite de mensagens por conversa (evita localStorage inflado). */
const MAX_MSG_POR_CONVERSA = 200
/** Limite de conversas guardadas. */
export const MAX_CONVERSAS = 30
/** Limite de entradas do diário guardadas (~1 ano se escrever 1/dia). */
const MAX_DIARIO = 730

function normalizarConversa(v: unknown): Conversa | null {
  if (!ehObjeto(v)) return null
  const id = typeof v.id === 'string' && v.id ? v.id : null
  if (!id) return null
  const titulo = typeof v.titulo === 'string' && v.titulo.trim() ? v.titulo.trim().slice(0, 80) : 'Conversa'
  const atualizadaEm = typeof v.atualizadaEm === 'string' ? v.atualizadaEm : new Date(0).toISOString()
  const msgs: MensagemIA[] = []
  if (Array.isArray(v.mensagens)) {
    for (const m of v.mensagens) {
      if (!ehObjeto(m)) continue
      if (m.role !== 'user' && m.role !== 'assistant') continue
      if (typeof m.content !== 'string' || !m.content) continue
      msgs.push({
        role: m.role,
        content: m.content,
        reasoning: typeof m.reasoning === 'string' ? m.reasoning : undefined,
        ts: typeof m.ts === 'string' ? m.ts : new Date().toISOString(),
      })
      if (msgs.length >= MAX_MSG_POR_CONVERSA) break
    }
  }
  return { id, titulo, mensagens: msgs, atualizadaEm }
}

function normalizarConversas(v: unknown): Conversa[] {
  if (!Array.isArray(v)) return []
  const out: Conversa[] = []
  for (const c of v) {
    const conv = normalizarConversa(c)
    if (conv) out.push(conv)
  }
  // Mantém só as MAX_CONVERSAS mais recentes.
  out.sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm))
  return out.slice(0, MAX_CONVERSAS)
}

function normalizarEntradaDiario(v: unknown): EntradaDiario | null {
  if (!ehObjeto(v)) return null
  const id = typeof v.id === 'string' && v.id ? v.id : null
  const data = typeof v.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.data) ? v.data : null
  if (!id || !data) return null
  return {
    id,
    data,
    titulo: typeof v.titulo === 'string' ? v.titulo : '',
    texto: typeof v.texto === 'string' ? v.texto : '',
    criadaEm: typeof v.criadaEm === 'string' ? v.criadaEm : new Date(data).toISOString(),
    editadaEm: typeof v.editadaEm === 'string' ? v.editadaEm : undefined,
  }
}

function normalizarDiario(v: unknown): EntradaDiario[] {
  if (!Array.isArray(v)) return []
  const out: EntradaDiario[] = []
  const seen = new Set<string>()
  for (const e of v) {
    const entrada = normalizarEntradaDiario(e)
    if (!entrada) continue
    // Garante unicidade por data (1 entrada/dia): se vier duplicada, mantém a mais recente.
    if (seen.has(entrada.data)) continue
    seen.add(entrada.data)
    out.push(entrada)
    if (out.length >= MAX_DIARIO) break
  }
  // Ordena mais recente primeiro.
  out.sort((a, b) => b.data.localeCompare(a.data))
  return out
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
  const log = normalizarLog(b.log)
  const conversas = normalizarConversas(b.conversas)
  const diario = normalizarDiario(b.diario)
  return {
    versao: VERSAO_DADOS,
    tarefas,
    personagem: normalizarPersonagem(b.personagem),
    configuracao: normalizarConfiguracao(b.configuracao),
    log,
    conversas,
    diario,
    diarioXp: normalizarDiarioXp(b.diarioXp),
    diarioRegistroXp: normalizarDiarioRegistroXp(b.diarioRegistroXp),
  }
}

/** `diarioRegistroXp`: data → true (já rendeu XP de registro). Filtra lixo. */
function normalizarDiarioRegistroXp(x: unknown): Record<string, boolean> {
  if (!x || typeof x !== 'object') return {}
  const saida: Record<string, boolean> = {}
  for (const [data, ok] of Object.entries(x as Record<string, unknown>)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(data) && ok) saida[data] = true
  }
  return saida
}

/** `diarioXp`: data → ids de carta já premiados (filtra lixo do import). */
function normalizarDiarioXp(x: unknown): Record<string, string[]> {
  if (!x || typeof x !== 'object') return {}
  const saida: Record<string, string[]> = {}
  for (const [data, ids] of Object.entries(x as Record<string, unknown>)) {
    if (Array.isArray(ids)) {
      const limpos = ids.filter((i): i is string => typeof i === 'string')
      if (limpos.length > 0) saida[data] = limpos
    }
  }
  return saida
}

/** Limite de eventos guardados no histórico (evita inchar o localStorage). */
export const MAX_LOG = 400

const TIPOS_LOG: ReadonlySet<string> = new Set(['tarefa', 'habito', 'invocacao', 'carta', 'nivel', 'dano', 'sistema'])

function normalizarLog(v: unknown): LogEvento[] {
  if (!Array.isArray(v)) return []
  const log: LogEvento[] = []
  for (const item of v) {
    if (!ehObjeto(item)) continue
    const tipo: TipoLog = typeof item.tipo === 'string' && TIPOS_LOG.has(item.tipo) ? (item.tipo as TipoLog) : 'sistema'
    if (typeof item.texto !== 'string' || !item.texto) continue
    log.push({
      id: typeof item.id === 'string' ? item.id : String(Math.random()).slice(2),
      ts: typeof item.ts === 'string' ? item.ts : new Date().toISOString(),
      tipo,
      texto: item.texto,
    })
  }
  return log.slice(0, MAX_LOG)
}

/** Estado padrão de primeira execução. */
export function estadoVazio(): AppData {
  return {
    versao: VERSAO_DADOS,
    tarefas: [],
    personagem: personagemInicial(),
    configuracao: { tema: temaInicial() },
    log: [],
    conversas: [],
    diario: [],
    diarioXp: {},
    diarioRegistroXp: {},
  }
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
