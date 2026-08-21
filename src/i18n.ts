/** i18n — lightweight catalog + t() for the vanilla-TS app (no framework).
 *  Default language is pt (keeps the current look). English is optional.
 *  Changing the language persists the choice in localStorage and reloads
 *  (all data is persisted on every store change, so nothing is lost).
 *
 *  Usage:
 *    import { t, getLang, setLang } from '../i18n'
 *    t('chave')                 // → translated string (pt default)
 *    t('chave.opcao', {x: 2})   // → with {x} interpolation
 */

export type Lang = 'pt' | 'en'

const STORAGE_KEY = 'esquizomon-rpg:lang'

/** Locale string used by Intl/date formatting for each language. */
export const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US' }

export function getLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'pt') return v
  } catch {
    /* blocked storage → default */
  }
  return 'pt'
}

/** Persists the language and reloads so every view re-renders with it. */
export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* blocked */
  }
  location.reload()
}

type Dict = Record<string, string>
type Cat = Record<Lang, Dict>

/** Placeholder-safe interpolation: t('k', {nome:'x'}) replaces {nome}. */
function fill(tpl: string, vars?: Record<string, string | number>): string {
  if (!vars) return tpl
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
}

/* =====================================================================
 *  CATALOG — `pt` is the source of truth (default); `en` is optional.
 *  New keys should be added to BOTH (en may start as the pt string).
 * ==================================================================== */

const MESSAGES: Cat = {
  pt: {
    // ---- nav ----
    'nav.hoje': 'Hoje',
    'nav.diario': 'Diário',
    'nav.cartas': 'Cartas',
    'nav.jogo': 'Jogo',
    'nav.historico': 'Histórico',
    'nav.config': 'Configurações',
    'nav.fabula': 'Abrir conversa com a Fábula',
    'nav.conta': 'Conta e sincronização',

    // ---- hoje / seletor de dia ----
    'hoje.titulo': 'Hoje',
    'hoje.ontem': 'Ontem',
    'hoje.prevDay': 'Dia anterior',
    'hoje.nextDay': 'Dia seguinte',
    'hoje.tag': 'Tag:',
    'hoje.todasDif': 'Todas as dificuldades',
    'hoje.concluidas': 'Concluídas',
    'hoje.limpar': 'Limpar filtros',
    'hoje.novoHabito': 'Novo hábito',
    'hoje.novaRecorrente': 'Nova recorrente',
    'hoje.novaTarefa': 'Nova tarefa',
    'hoje.colHabitual': 'Hábitos',
    'hoje.colRecorrentes': 'Recorrentes',
    'hoje.colTarefas': 'Tarefas',
    'hoje.emptyHabit': 'Nada aqui. Use + para adicionar.',
    'hoje.emptyRec': 'Nada marcado para este dia.',
    'hoje.emptyTask': 'Nada aqui. Use + para adicionar.',
    'hoje.exhausted': 'Esgotado — sem regeneração de mana até o próximo dia. Conclua tarefas para se recuperar.',
    'hoje.conclSub': `Concluídas · {n}`,
    'hoje.pos': 'Repetição positiva',
    'hoje.neg': 'Repetição negativa',
    'hoje.markedPosHoje': 'Positivo hoje ({n}×)',
    'hoje.markedNegHoje': 'Negativo hoje ({n}×)',
    'hoje.markedPosDia': 'Positivo no dia referido ({n}×)',
    'hoje.markedNegDia': 'Negativo no dia referido ({n}×)',
    'hoje.posHoje': 'Positivos hoje',
    'hoje.negHoje': 'Negativos hoje',
    'hoje.seq': 'Dias seguidos com repetição positiva',
    'hoje.hojeBadge': 'hoje',
    'hoje.noDia': 'no dia referido',
    'hoje.repeticaoRegistrada': 'Repetição registrada.',
    'hoje.marcadoNegativo': 'Marcado como negativo.',
    'hoje.jaMarcado': 'Já marcado neste dia.',
    'hoje.editar': 'Editar',
    'hoje.excluir': 'Excluir',
    'hoje.ordemAtualizada': 'Ordem atualizada.',
    'hoje.concluir': 'Concluir',
    'hoje.reabrir': 'Reabrir',
    'hoje.doneSub': 'Concluídas · {n}',
    'hoje.venceu': `venceu {n}d · {date}`,
    'hoje.venceNeste': `vence neste dia · {date}`,
    'hoje.urgente': `{n}d · {date}`,

    // ---- dificuldade / tipo ----
    'dif.facil': 'Fácil',
    'dif.media': 'Média',
    'dif.dificil': 'Difícil',
    'dif.extrema': 'Extrema',
    'tipo.unica': 'Tarefa',
    'tipo.recorrente': 'Recorrente',
    'tipo.habito': 'Hábito',
    'tipo.ambos': 'Ambos',
    'tipo.positivo': 'Positivo (somar)',
    'tipo.negativo': 'Negativo (evitar)',

    // ---- formTarefa ----
    'form.titulo': 'Dê um nome para a tarefa.',
    'form.naoEncontrada': 'Tarefa não encontrada.',
    'form.novaTagPlaceholder': 'Nova tag (Enter para adicionar)',
    'form.exTitulo': 'Ex.: revisar fichas do mestrado',
    'form.todosDias': 'Todos os dias',
    'form.diasSemana': 'Dias da semana',
    'form.diasMes': 'Dias do mês',
    'form.exDiasMes': 'Ex.: 1, 15, 30',
    'form.notasPlaceholder': 'Detalhes, contexto, anotações…',
    'form.nomeDuplicado': 'Já existe uma tarefa com esse nome.',

    // ---- sync ----
    'sync.ultima': 'Última sincronização',
    'sync.nunca': 'Ainda não sincronizado',

    // ---- checkin ----
    'checkin.ontem': 'Atividades de ontem',
    'checkin.sub': 'Confira as <strong>atividades recorrentes de {date}</strong> (ontem). Nada vem pré-marcado: marque as que você fez de verdade — <strong>só as recorrentes</strong> não marcadas contam como perdidas e causam dano (tarefas únicas vencidas não dão dano).',
    'checkin.botao': 'Check-in',

    // ---- conta / header ----
    'conta.conta': 'Conta',
    'conta.entrarCriar': 'Entrar / criar conta (sincronização opcional)',

    // ---- status bar ----
    'status.nivel': 'Nível',
    'status.vida': 'Vida',
    'status.xp': 'Experiência',
    'status.mana': 'Mana',
    'status.esgotado': 'Esgotado',
    'status.avatar': 'Avatar',
    'status.cartaPerdida': 'Carta perdida',

    // ---- comum ----
    'comum.cancelar': 'Cancelar',

    // ---- chat render ----
    'chatRender.copiarMd': 'Copiar mensagem em markdown',
    'chatRender.raciocinio': 'Raciocínio',

    // ---- avatar ----
    'avatar.invalida': 'Imagem inválida — escolha outra.',
    'avatar.recortar': 'Recortar avatar',
    'avatar.hint': 'Arraste para posicionar · use o zoom para ajustar. O corte é sempre circular.',
    'avatar.imagemCortar': 'Imagem a recortar',
    'avatar.zoom': 'Zoom do corte',
    'avatar.salvar': 'Salvar avatar',
    'avatar.falhaProcessar': 'Não consegui processar a imagem.',
    'avatar.salvo': 'Avatar salvo!',

    // ---- graficos ----
    'graficos.progressao': 'Progressão de {x} por nível',
    'graficos.nivel': 'Nível {n} — {v}',

    // ---- chat ----
    'chat.semConversas': 'Sem conversas — comecei uma nova pra você.',
    'chat.redimensionar': 'Arraste pra redimensionar',
    'chat.redimensionarPainel': 'Redimensionar painel',
    'chat.nova': 'Nova conversa',
    'chat.conversas': 'Conversas',
    'chat.tituloConversa': 'Título da conversa',
    'chat.tituloDica': 'Digite o novo título e Enter para salvar',
    'chat.renomear': 'Renomear conversa',
    'chat.apagar': 'Apagar conversa',
    'chat.fecharChat': 'Fechar chat',
    'chat.fechar': 'Fechar',
    'chat.crieConversa': 'Crie uma conversa para começar',
    'chat.enviar': 'Enviar',
    'chat.cartaBloqueada': 'Carta bloqueada — suba de nível para desbloquear.',
    'chat.copiada': 'Mensagem copiada em markdown.',
    'chat.copiaFalhou': 'Não consegui copiar a mensagem.',
    'chat.confirmarApagar': 'Apagar esta conversa? Isso não pode ser desfeito.',
    'chat.apagada': 'Conversa apagada.',
    'chat.configureIa': 'Configure a IA em Config → Fábula antes de conversar.',
    'chat.semResposta': 'A Fábula não respondeu nada. Tente de novo.',
  },

  en: {
    'nav.hoje': 'Today',
    'nav.diario': 'Diary',
    'nav.cartas': 'Cards',
    'nav.jogo': 'Game',
    'nav.historico': 'History',
    'nav.config': 'Settings',
    'nav.fabula': 'Open chat with the Fable',
    'nav.conta': 'Account & sync',

    'hoje.titulo': 'Today',
    'hoje.ontem': 'Yesterday',
    'hoje.prevDay': 'Previous day',
    'hoje.nextDay': 'Next day',
    'hoje.tag': 'Tag:',
    'hoje.todasDif': 'All difficulties',
    'hoje.concluidas': 'Completed',
    'hoje.limpar': 'Clear filters',
    'hoje.novoHabito': 'New habit',
    'hoje.novaRecorrente': 'New recurring',
    'hoje.novaTarefa': 'New task',
    'hoje.colHabitual': 'Habits',
    'hoje.colRecorrentes': 'Recurring',
    'hoje.colTarefas': 'Tasks',
    'hoje.emptyHabit': 'Nothing here. Use + to add.',
    'hoje.emptyRec': 'Nothing scheduled for this day.',
    'hoje.emptyTask': 'Nothing here. Use + to add.',
    'hoje.exhausted': 'Depleted — no mana regen until the next day. Complete tasks to recover.',
    'hoje.conclSub': `Completed · {n}`,
    'hoje.pos': 'Positive repetition',
    'hoje.neg': 'Negative repetition',
    'hoje.markedPosHoje': 'Positive today ({n}×)',
    'hoje.markedNegHoje': 'Negative today ({n}×)',
    'hoje.markedPosDia': 'Positive on the day ({n}×)',
    'hoje.markedNegDia': 'Negative on the day ({n}×)',
    'hoje.posHoje': 'Positive today',
    'hoje.negHoje': 'Negative today',
    'hoje.seq': 'Consecutive days with positive repetition',
    'hoje.hojeBadge': 'today',
    'hoje.noDia': 'on the day shown',
    'hoje.repeticaoRegistrada': 'Repetition recorded.',
    'hoje.marcadoNegativo': 'Marked as negative.',
    'hoje.jaMarcado': 'Already marked on this day.',
    'hoje.editar': 'Edit',
    'hoje.excluir': 'Delete',
    'hoje.ordemAtualizada': 'Order updated.',
    'hoje.concluir': 'Complete',
    'hoje.reabrir': 'Reopen',
    'hoje.doneSub': 'Completed · {n}',
    'hoje.venceu': `expired {n}d · {date}`,
    'hoje.venceNeste': `due on this day · {date}`,
    'hoje.urgente': `{n}d · {date}`,

    'dif.facil': 'Easy',
    'dif.media': 'Medium',
    'dif.dificil': 'Hard',
    'dif.extrema': 'Extreme',
    'tipo.unica': 'Task',
    'tipo.recorrente': 'Recurring',
    'tipo.habito': 'Habit',
    'tipo.ambos': 'Both',
    'tipo.positivo': 'Positive (add)',
    'tipo.negativo': 'Negative (avoid)',

    'form.titulo': 'Give the task a name.',
    'form.naoEncontrada': 'Task not found.',
    'form.novaTagPlaceholder': 'New tag (Enter to add)',
    'form.exTitulo': 'e.g. review master notes',
    'form.todosDias': 'Every day',
    'form.diasSemana': 'Weekdays',
    'form.diasMes': 'Days of the month',
    'form.exDiasMes': 'e.g. 1, 15, 30',
    'form.notasPlaceholder': 'Details, context, notes…',
    'form.nomeDuplicado': 'A task with that name already exists.',

    // ---- sync ----
    'sync.ultima': 'Last sync',
    'sync.nunca': 'Not synced yet',

    // ---- checkin ----
    'checkin.ontem': "Yesterday's activities",
    'checkin.sub': 'Check the <strong>recurring activities of {date}</strong> (yesterday). Nothing comes pre-checked: mark what you really did — <strong>only recurring</strong> unmarked ones count as missed and deal damage (overdue one-offs don\'t).',
    'checkin.botao': 'Check-in',

    // ---- conta / header ----
    'conta.conta': 'Account',
    'conta.entrarCriar': 'Log in / create account (optional sync)',

    // ---- status bar ----
    'status.nivel': 'Level',
    'status.vida': 'Health',
    'status.xp': 'Experience',
    'status.mana': 'Mana',
    'status.esgotado': 'Depleted',
    'status.avatar': 'Avatar',
    'status.cartaPerdida': 'Lost card',

    // ---- comum ----
    'comum.cancelar': 'Cancel',

    // ---- chat render ----
    'chatRender.copiarMd': 'Copy message as markdown',
    'chatRender.raciocinio': 'Reasoning',

    // ---- avatar ----
    'avatar.invalida': 'Invalid image — choose another.',
    'avatar.recortar': 'Crop avatar',
    'avatar.hint': 'Drag to position · use zoom to adjust. The crop is always circular.',
    'avatar.imagemCortar': 'Image to crop',
    'avatar.zoom': 'Crop zoom',
    'avatar.salvar': 'Save avatar',
    'avatar.falhaProcessar': 'Could not process the image.',
    'avatar.salvo': 'Avatar saved!',

    // ---- graficos ----
    'graficos.progressao': '{x} progression by level',
    'graficos.nivel': 'Level {n} — {v}',

    // ---- chat ----
    'chat.semConversas': 'No conversations — I started a new one for you.',
    'chat.redimensionar': 'Drag to resize',
    'chat.redimensionarPainel': 'Resize panel',
    'chat.nova': 'New conversation',
    'chat.conversas': 'Conversations',
    'chat.tituloConversa': 'Conversation title',
    'chat.tituloDica': 'Type the new title and press Enter to save',
    'chat.renomear': 'Rename conversation',
    'chat.apagar': 'Delete conversation',
    'chat.fecharChat': 'Close chat',
    'chat.fechar': 'Close',
    'chat.crieConversa': 'Create a conversation to start',
    'chat.enviar': 'Send',
    'chat.cartaBloqueada': 'Card locked — level up to unlock it.',
    'chat.copiada': 'Message copied as markdown.',
    'chat.copiaFalhou': 'Could not copy the message.',
    'chat.confirmarApagar': 'Delete this conversation? This cannot be undone.',
    'chat.apagada': 'Conversation deleted.',
    'chat.configureIa': 'Set up the AI in Settings → Fable before chatting.',
    'chat.semResposta': 'The Fable returned nothing. Try again.',
  },
}

/** Returns the translation for a key in the current language, falling back
 *  to pt and then to the key itself (so a missing EN never crashes). */
export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = getLang()
  const dict = MESSAGES[lang] ?? MESSAGES.pt
  const val = dict[key] ?? MESSAGES.pt[key] ?? key
  return fill(val, vars)
}

/** Sets a data attribute on <html> so CSS/i18n-ready selectors can react. */
export function applyLangAttr(): void {
  document.documentElement.dataset.lang = getLang()
}