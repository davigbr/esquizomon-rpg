/** Migration test: an old PT-format blob must normalize into EN objects (no data loss). */
import { normalizeData } from '../src/db/storage'
import type { AppData } from '../src/core/tipos'

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exitCode = 1
  } else {
    console.log('ok  -', msg)
  }
}

// Simulates a save blob from BEFORE the refactor (all PT field names/values).
const ptBlob = {
  versao: 3,
  tarefas: [
    {
      id: 't1',
      tipo: 'recorrente',
      titulo: 'Revisar fichas',
      dificuldade: 'media',
      tags: ['mestrado'],
      notas: 'foco',
      agenda: { dias: [1, 3], diasDoMes: [] },
      concluida: false,
      historico: ['2026-08-19'],
      recompensas: {
        '2026-08-19': {
          xp: 15,
          subiu: true,
          nivel: 2,
          xpAntes: 100,
          nivelAntes: 1,
          xpProximoAntes: 80,
          hpMaxAntes: 50,
          manaMaxAntes: 20,
          cartas: ['c1'],
        },
      },
      criadaEm: '2026-08-18T10:00:00.000Z',
      editadaEm: '2026-08-19T10:00:00.000Z',
    },
    { id: 't2', tipo: 'unica', titulo: 'Enviar email', dificuldade: 'facil', tags: [], concluida: true, historico: ['2026-08-20'], criadaEm: '2026-08-20T09:00:00.000Z' },
    { id: 't3', tipo: 'habito', titulo: 'Meditar', dificuldade: 'facil', tags: [], sinal: 'positivo', contador: { hoje: 1, hojeNeg: 0, totalPositivo: 5, totalNegativo: 2 }, historico: ['2026-08-20'], historicoNegativo: ['2026-08-19'], criadaEm: '2026-08-01T00:00:00.000Z' },
  ],
  personagem: {
    nivel: 2,
    xp: 15,
    xpProximo: 160,
    hp: 50,
    hpMax: 55,
    mana: 20,
    manaMax: 22,
    esgotado: false,
    ultimoDia: '2026-08-20',
    cartas: ['c1', 'c2'],
    nomeMonstruoso: 'Rizomante',
    invocacoes: { 'c1': 2 },
  },
  configuracao: {
    tema: 'dark',
    modoRelaxado: false,
    resumo: 'estudante de psicologia',
    sons: true,
    ia: { provider: 'deepseek', modelo: 'deepseek-chat', apiKey: 'sk-test', systemPrompt: '' },
  },
  log: [
    { id: 'l1', ts: '2026-08-20T12:00:00.000Z', tipo: 'tarefa', texto: 'Concluiu: Enviar email (+10 XP)' },
  ],
  conversas: [
    { id: 'conv1', titulo: 'Sobre o dia', mensagens: [{ role: 'user', content: 'oi', ts: '2026-08-20T11:00:00.000Z' }], atualizadaEm: '2026-08-20T11:00:00.000Z' },
  ],
  diario: [
    { id: 'e1', data: '2026-08-20', titulo: 'Crônica', texto: 'hoje li Deleuze', criadaEm: '2026-08-20T12:00:00.000Z' },
  ],
  tarefasExcluidas: { 't9': '2026-08-20T08:00:00.000Z' },
  diarioXp: { '2026-08-20': ['c5'] },
  diarioRegistroXp: { '2026-08-20': true },
}

const out = normalizeData(ptBlob)
if (!out) { console.error('FAIL: normalizou null'); process.exit(1) }

// 1. top-level EN
assert(out.tasks.length === 3, 'tasks renomeado (3 tarefas)')
assert(out.version === 3, 'version mantido')
assert(!!out.character && out.character.level === 2, 'character/level EN')
assert(!!out.settings && out.settings.theme === 'dark', 'settings/theme EN')
assert(out.settings.ai?.provider === 'deepseek', 'settings.ai.provider')
assert(out.settings.ai?.model === 'deepseek-chat', 'settings.ai.model (de modelo)')
assert(out.settings.ai?.apiKey === 'sk-test', 'apiKey preservada')
assert(out.settings.summary === 'estudante de psicologia', 'summary (de resumo)')
assert(out.settings.sound === true, 'sound (de sons)')
assert(out.log[0].type === 'tarefa' && out.log[0].text === 'Concluiu: Enviar email (+10 XP)', 'log: type/text EN, valores PT')
assert(!!out.conversations && out.conversations[0].title === 'Sobre o dia', 'conversations[0].title')
assert(out.conversations[0].messages[0].content === 'oi', 'conversation message content')
assert(!!out.diary && out.diary[0].date === '2026-08-20' && out.diary[0].text === 'hoje li Deleuze', 'diary[0] date/text')
assert(out.diary[0].title === 'Crônica', 'diary[0].title (de titulo)')
assert(!!out.deletedTasks && out.deletedTasks['t9'] !== undefined, 'deletedTasks (de tarefasExcluidas)')
assert(out.diaryXp['2026-08-20']?.includes('c5'), 'diaryXp (de diarioXp)')
assert(out.diaryLogXp['2026-08-20'] === true, 'diaryLogXp (de diarioRegistroXp)')

// 2. task field mapping
const rec = out.tasks[0]
assert(rec.type === 'recorrente', 'task.type valor PT preservado')
assert(rec.title === 'Revisar fichas', 'task.title (de titulo)')
assert(rec.difficulty === 'media', 'task.difficulty valor PT')
assert(rec.agenda?.days.join() === '1,3', 'task.agenda.days (de dias)')
assert(rec.history.join() === '2026-08-19', 'task.history (de historico)')
assert(rec.notes === 'foco', 'task.notes (de notas)')
assert(rec.done === false, 'task.done (de concluida)')
assert(rec.createdAt === '2026-08-18T10:00:00.000Z', 'task.createdAt (de criadaEm)')
const rew = rec.rewards?.['2026-08-19']
assert(!!rew && rew.leveledUp === true, 'reward.leveledUp (de subiu)')
assert(rew?.xpBefore === 100, 'reward.xpBefore (de xpAntes)')
assert(rew?.hpMaxBefore === 50, 'reward.hpMaxBefore (de hpMaxAntes)')

const hab = out.tasks[2]
assert(hab.counter?.today === 1 && hab.counter.totalPositive === 5, 'habit.counter today/totalPositive EN')
assert(hab.sign === 'positivo', 'habit.sign valor PT')
assert(hab.negativeHistory?.includes('2026-08-19'), 'habit.negativeHistory (de historicoNegativo)')

const unica = out.tasks[1]
assert(unica.done === true, 'unica.done true (de concluida)')

// 3. round-trip: JSON.stringfy output must contain EN keys, not PT keys
const json = JSON.stringify(out)
assert(!json.includes('"tarefas"') && !json.includes('"personagem"') && !json.includes('"configuracao"'), 'blob de saída usa chaves EN (tarefas/personagem/configuracao ausentes)')
assert(!json.includes('"criadaEm"') && !json.includes('"editadaEm"'), 'saída sem criadaEm/editadaEm')

console.log('\nMigration test done.', process.exitCode ? 'FALHOU' : 'PASSOU (sem perda de dados)')
