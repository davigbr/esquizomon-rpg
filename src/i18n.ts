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

    // ---- config ----
    'config.titulo': 'Config',
    'config.sub': 'Ajustes do app e dos seus dados.',
    'config.avatar': 'Avatar',
    'config.seuAvatar': 'Seu avatar',
    'config.escolherImagem': 'Escolher imagem',
    'config.remover': 'Remover',
    'config.confirmarRemoverAvatar': 'Remover seu avatar?',
    'config.avatarRemovido': 'Avatar removido.',
    'config.nomeMonstruoso': 'Nome monstruoso',
    'config.exNomeMonstruoso': 'Ex.: Devorador de Segundas',
    'config.hintNomeMonstruoso': 'Aparece em negrito ao lado do seu avatar (não é exibido no celular).',
    'config.hintAvatar': 'Corte sempre circular · comprimido · salvo junto aos dados · exibido ao lado do nível.',
    'config.aparencia': 'Aparência',
    'config.temaVale': 'O tema vale para este dispositivo.',
    'config.tema': 'Tema',
    'config.temaHint': 'Sistema segue o padrão do dispositivo',
    'config.sistema': 'Sistema',
    'config.escuro': 'Escuro',
    'config.claro': 'Claro',
    'config.idioma': 'Idioma',
    'config.idiomaVale': 'O idioma da interface vale para este dispositivo.',
    'config.idiomaHint': 'Português (padrão) ou English',
    'config.portugues': 'Português',
    'config.english': 'English',
    'config.jogo': 'Jogo',
    'config.modoRelaxadoSub': 'O modo relaxado desliga todo dano — recorrentes perdidas e hábitos negativos não machucam o personagem.',
    'config.modoRelaxado': 'Modo relaxado',
    'config.modoRelaxadoHint': 'Jogo sem punição — só bônus',
    'config.desligado': 'Desligado',
    'config.ligado': 'Ligado',
    'config.efeitosSonoros': 'Efeitos sonoros',
    'config.sonsHint': 'Tique ao marcar · hábito + sobe, hábito − desce · fanfarra ao subir de nível · som sombrio na invocação · acorde na análise',
    'config.ligados': 'Ligados',
    'config.desligados': 'Desligados',
    'config.sobreVoce': 'Sobre você',
    'config.resumoSub': 'Um resumo da sua vida — quem você é, o que faz, o que está vivendo. A Fábula usa isso pra te conhecer além do jogo (junto com o seu diário).',
    'config.resumoPlaceholder': 'Conte quem você é, o que está vivendo, o que anda em movimento — a Fábula lê isso pra te conhecer além do jogo.',
    'config.resumoHint': 'Salva automaticamente ao sair do campo. Quanto mais honesto, melhor ela te acompanha.',
    'config.resumoSalvo': 'Resumo salvo — a Fábula leu.',
    'config.resumoRemovido': 'Resumo removido.',
    'config.dados': 'Dados',
    'config.dadosSub': 'Exporte ou importe tudo em JSON — o backup do seu território.',
    'config.exportar': 'Exportar (JSON)',
    'config.importar': 'Importar',
    'config.rerolarTitle': 'Re-sorteia todas as cartas desbloqueadas',
    'config.rerolar': 'Rerolar baralho',
    'config.backupsTitle': 'Backups automáticos (criados antes de cada sincronização que altera dados):',
    'config.zonaPerigo': 'Zona de perigo',
    'config.zonaPerigoSub': 'Apaga todas as tarefas e o progresso do personagem deste dispositivo.',
    'config.apagarTudo': 'Apagar tudo',
    'config.relaxadoOn': 'Modo relaxado ligado — sem dano.',
    'config.relaxadoOff': 'Modo relaxado desligado.',
    'config.sonsOn': 'Efeitos sonoros ligados.',
    'config.sonsOff': 'Efeitos sonoros desligados.',
    'config.dadosExportados': 'Dados exportados.',
    'config.dadosImportados': 'Dados importados.',
    'config.importFalhou': 'Falha na importação.',
    'config.semBackups': 'Nenhum backup automático ainda — o app cria um antes de cada sincronização que altera os dados.',
    'config.confirmarRestaurar': 'Restaurar substitui os dados atuais deste dispositivo pelos do backup escolhido. Continuar?',
    'config.restaurarBackup': 'Restaurar backup',
    'config.backupRestaurado': 'Backup restaurado.',
    'config.backupFalhou': 'Não foi possível restaurar este backup.',
    'config.baralhoRerolado': 'Baralho rerolado: {n} cartas re-sorteadas.',
    'config.confirmarApagarTudo': 'Apagar todas as tarefas e o personagem? Isso não pode ser desfeito.',
    'config.tudoApagado': 'Tudo apagado.',
    'config.promptJaPadrao': 'O prompt já é o padrão.',
    'config.promptRestaurado': 'System prompt restaurado.',
    'config.escolhaProvider': 'Escolha um provider e informe a chave.',
    'config.conexaoOk': 'Conexão ok.',
    'config.sessaoEncerrada': 'Sessão encerrada — seus dados seguem neste dispositivo.',
    'config.testando': 'Testando…',
    'config.padrao': '(padrão)',
    'config.iaDesligado': 'Desligado (sem IA)',
    'config.quemResponde': 'Quem vai responder',
    'config.modelo': 'Modelo',
    'config.escolhaProviderModelo': 'escolha um provider',
    'config.chaveApi': 'Chave de API',
    'config.soVoceVe': 'Só você vê. Não sai do seu dispositivo.',
    'config.systemPrompt': 'System prompt da Fábula',
    'config.usaPromptCanonico': 'Usando o <strong>prompt canônico</strong> (NARRATIVA.md). Edite pra customizar.',
    'config.voltaPrompt': 'Volta pro prompt canônico',
    'config.restaurarPadrao': 'Restaurar padrão',
    'config.testarConexao': 'Testar conexão',
    'config.sync.local': 'Offline — dados só neste dispositivo',
    'config.sync.enviando': 'Enviando para a nuvem…',
    'config.sync.sincronizado': 'Sincronizado com a nuvem',
    'config.sync.semConexao': 'Sem conexão — dados locais intactos',
    'config.sync.notice': '<strong>Seus dados moram neste navegador.</strong> Eles sobrevivem a recargas e fechamentos — mas <strong>podem ser perdidos</strong> se você limpar o cache/dados do navegador, usar modo anônimo, trocar de navegador ou de computador. Exportar (JSON) ou criar uma conta são suas garantias.',
    'config.sync.enviaAgora': 'Envia e puxa os dados agora',
    'config.sync.entre': 'Entre para sincronizar',
    'config.sync.sincronizar': 'Sincronizar agora',
    'config.sync.entrarConta': 'Entrar / criar conta',
    'config.sync.sair': 'Sair',
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

    // ---- config ----
    'config.titulo': 'Settings',
    'config.sub': 'App and data settings.',
    'config.avatar': 'Avatar',
    'config.seuAvatar': 'Your avatar',
    'config.escolherImagem': 'Choose image',
    'config.remover': 'Remove',
    'config.confirmarRemoverAvatar': 'Remove your avatar?',
    'config.avatarRemovido': 'Avatar removed.',
    'config.nomeMonstruoso': 'Monster name',
    'config.exNomeMonstruoso': 'e.g. Monday Devourer',
    'config.hintNomeMonstruoso': 'Shown bold next to your avatar (not displayed on mobile).',
    'config.hintAvatar': 'Always circular crop · compressed · saved with your data · shown next to the level.',
    'config.aparencia': 'Appearance',
    'config.temaVale': 'The theme applies to this device.',
    'config.tema': 'Theme',
    'config.temaHint': 'System follows the device setting',
    'config.sistema': 'System',
    'config.escuro': 'Dark',
    'config.claro': 'Light',
    'config.idioma': 'Language',
    'config.idiomaVale': 'The interface language applies to this device.',
    'config.idiomaHint': 'Portuguese (default) or English',
    'config.portugues': 'Portuguese',
    'config.english': 'English',
    'config.jogo': 'Game',
    'config.modoRelaxadoSub': 'Relaxed mode turns off all damage — missed recurring tasks and negative habits don\'t hurt the character.',
    'config.modoRelaxado': 'Relaxed mode',
    'config.modoRelaxadoHint': 'Game without punishment — only bonuses',
    'config.desligado': 'Off',
    'config.ligado': 'On',
    'config.efeitosSonoros': 'Sound effects',
    'config.sonsHint': 'Tick when marking · habit + goes up, habit − goes down · fanfare on level up · dark sound on invocation · chord on analysis',
    'config.ligados': 'On',
    'config.desligados': 'Off',
    'config.sobreVoce': 'About you',
    'config.resumoSub': 'A summary of your life — who you are, what you do, what you\'re living. The Fable uses it to know you beyond the game (along with your diary).',
    'config.resumoPlaceholder': 'Tell who you are, what you\'re living, what\'s moving — the Fable reads this to know you beyond the game.',
    'config.resumoHint': 'Saves automatically when you leave the field. The more honest, the better it accompanies you.',
    'config.resumoSalvo': 'Summary saved — the Fable read it.',
    'config.resumoRemovido': 'Summary removed.',
    'config.dados': 'Data',
    'config.dadosSub': 'Export or import everything as JSON — the backup of your territory.',
    'config.exportar': 'Export (JSON)',
    'config.importar': 'Import',
    'config.rerolarTitle': 'Reshuffles all unlocked cards',
    'config.rerolar': 'Reshuffle deck',
    'config.backupsTitle': 'Automatic backups (created before each sync that changes data):',
    'config.zonaPerigo': 'Danger zone',
    'config.zonaPerigoSub': 'Deletes all tasks and character progress on this device.',
    'config.apagarTudo': 'Delete everything',
    'config.relaxadoOn': 'Relaxed mode on — no damage.',
    'config.relaxadoOff': 'Relaxed mode off.',
    'config.sonsOn': 'Sound effects on.',
    'config.sonsOff': 'Sound effects off.',
    'config.dadosExportados': 'Data exported.',
    'config.dadosImportados': 'Data imported.',
    'config.importFalhou': 'Import failed.',
    'config.semBackups': 'No automatic backup yet — the app creates one before each sync that changes data.',
    'config.confirmarRestaurar': 'Restoring replaces the current data on this device with the chosen backup. Continue?',
    'config.restaurarBackup': 'Restore backup',
    'config.backupRestaurado': 'Backup restored.',
    'config.backupFalhou': 'Could not restore this backup.',
    'config.baralhoRerolado': 'Deck reshuffled: {n} cards redrawn.',
    'config.confirmarApagarTudo': 'Delete all tasks and the character? This cannot be undone.',
    'config.tudoApagado': 'Everything deleted.',
    'config.promptJaPadrao': 'The prompt is already the default.',
    'config.promptRestaurado': 'System prompt restored.',
    'config.escolhaProvider': 'Choose a provider and enter the key.',
    'config.conexaoOk': 'Connection ok.',
    'config.sessaoEncerrada': 'Session ended — your data stays on this device.',
    'config.testando': 'Testing…',
    'config.padrao': '(default)',
    'config.iaDesligado': 'Off (no AI)',
    'config.quemResponde': 'Who will answer',
    'config.modelo': 'Model',
    'config.escolhaProviderModelo': 'choose a provider',
    'config.chaveApi': 'API key',
    'config.soVoceVe': 'Only you see it. It never leaves your device.',
    'config.systemPrompt': 'Fable system prompt',
    'config.usaPromptCanonico': 'Using the <strong>canonical prompt</strong> (NARRATIVA.md). Edit to customize.',
    'config.voltaPrompt': 'Back to canonical prompt',
    'config.restaurarPadrao': 'Restore default',
    'config.testarConexao': 'Test connection',
    'config.sync.local': 'Offline — data only on this device',
    'config.sync.enviando': 'Sending to the cloud…',
    'config.sync.sincronizado': 'Synced with the cloud',
    'config.sync.semConexao': 'No connection — local data intact',
    'config.sync.notice': '<strong>Your data lives in this browser.</strong> It survives reloads and closing — but <strong>can be lost</strong> if you clear browser cache/data, use private mode, switch browser or computer. Export (JSON) or create an account are your guarantees.',
    'config.sync.enviaAgora': 'Sends and pulls data now',
    'config.sync.entre': 'Sign in to sync',
    'config.sync.sincronizar': 'Sync now',
    'config.sync.entrarConta': 'Log in / create account',
    'config.sync.sair': 'Log out',
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