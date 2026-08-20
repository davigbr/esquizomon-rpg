# Contrato de refatoração PT → EN — Esquizomon RPG

Estamos renomeando IDENTIFICADORES de código de PT para EN. Você NÃO deve
distorcer o comportamento nem a migração de dados.

## REGRAS INVIOLÁVEIS (do skill codigo-pt-para-en)
1. **Renomeie apenas identificadores**: nomes de variáveis, funções, parâmetros,
   tipos, exports, imports, campos de objeto. Traduza comentários se quiser (opcional).
2. **NUNCA renomeie VALORES persistidos** (literais em string/código). Estes ficam
   em PT porque estão gravados no blob do usuário:
   - `'recorrente' | 'unica' | 'habito'` (task.type)
   - `'facil' | 'media' | 'dificil' | 'extrema'` (difficulty)
   - `'dark' | 'light' | 'sistema'` (theme)
   - `'positivo' | 'negativo' | 'ambos'` (habit sign)
   - `'nenhum' | 'deepseek' | 'opencode'` (AI provider)
   - LogType: `'tarefa' | 'habito' | 'invocacao' | 'carta' | 'nivel' | 'dano' | 'sistema'`
   - tipos de carta: `'monstro' | 'captura' | 'alianca'`
   - chaves de som: `'nivel' | 'invocar' | 'tarefa' | 'habito-pos' | 'habito-neg' | ...`
   - chaves de localStorage: `'esquizomon-rpg:v1'`, `'esquizomon-rpg:tema'`
3. **NÃO renomeie** conteúdo de texto de UI/toasts/logs/prompts (mantém em PT — é conteúdo, não código).
4. **Não use sed/expressão global** que também atinja strings/comentários/valores.
   Renomeie por edição cirúrgica (identificador por identificador).
5. Não altere `src/db/storage.ts` nem `src/core/tipos.ts` — já estão em EN (Fase 1).

## O QUE JÁ ESTÁ EM EN (fonte da verdade — LEIA antes de renomear usos)
- `src/core/tipos.ts` — schema EN completo (types e nomes de campos EN).
- `src/core/jogo.ts`, `src/core/baralho.ts`, `src/core/recompensa.ts`, `src/core/syncMerge.ts`.
- `src/db/storage.ts`, `src/stores/*` (base, personagem, tarefas, checkin, config, conversas, diario, app).

Sempre abra o schema (`tipos.ts`) e o arquivo que você importa ANTES de renomear
usos — NUNCA reescreva contra nomes traduzidos de memória.

## Renames importantes já estabelecidos (para você importar corretamente)
Core `jogo.ts`: `dificuldadeDe→difficultyMeta`, `xpDe→xpFor`, `danoDe→damageFor`,
`xpProximoDe→xpNextFor`, `hpMaxDe→hpMaxFor`, `manaMaxDe→manaMaxFor`,
`personagemInicial→initialCharacter`, `hojeISO→todayISO`, `somarDias→addDays`,
`diaDaSemana→dayOfWeek`, `diaDoMes→dayOfMonth`, `diasAte→daysUntil`,
`diasDesde→daysSince`, `calcularStreak→calcStreak`, `novoId→newId`,
`CUSTO_ANALISE→ANALYZE_COST`, `CUSTO_CAPTURAS→CAPTURES_COST`, `XP_POR_REGISTRO_DIARIO→XP_PER_DAILY_LOG`.
Core `baralho.ts`: `todasAsCartas→allCards`, `carregarDeck→loadDeck`,
`sortearIds→drawIds`, `sortearIdsPonderado→drawWeightedIds`, `sortearIniciais→drawInitialIds`,
`resolverCartaId→resolveCardId`, `nomeDaCarta→cardName`, `tipoDaCarta→cardKindById`,
`tipoDe→kindOf`, `rotuloTipo→typeLabel`, `PesoDeRaridade→rarityWeight`.
Core `recompensa.ts`: `processarMencoesDiario→processDiaryMentions`, `XP_POR_MENCAO→XP_PER_MENTION`.
Core `syncMerge.ts`: `fundirDados→mergeData`, `fundirPorChave→mergeByKey`, `fundirLog→mergeLog`.
Storage: `normalizarDados→normalizeData`, `carregar→load`, `salvar→save`,
`apagarTudo→wipeAll`, `estadoVazio→emptyState`, `salvarTema→saveTheme`,
`MAX_CONVERSAS→MAX_CONVERSATIONS`, `MAX_LOG→MAX_LOG`.
Stores (`base.ts`): `registrarLog→addLog`, `tarefaPorId→taskById`, `Resultado→Result`
(campo `motivo→reason`), `DadosTarefa→TaskInput` (campos titulo→title, tipo→type, dificuldade→difficulty, sinal→sign, notas→notes).
Stores (`personagem.ts`): `ganharXP→gainXP` (retorna `{leveledUp, level, newCards}`),
`invocarCarta→invokeCard`, `aplicarDano→applyDamage`, `curar→heal`,
`rerolarBaralho→rerollDeck`, `definirAvatar→setAvatar`, `definirNomeMonstruoso→setMonsterName`,
`deckCarregado→loadedDeck`, `consumirMorte→consumeDeath`, `registrarDeck→registerDeck`.
Stores (`tarefas.ts`): `criarTarefa→createTask`, `atualizarTarefa→updateTask`,
`excluirTarefa→deleteTask`, `reordenarTarefas→reorderTasks`,
`alternarRecorrenteHoje→toggleRecurringToday`, `alternarUnica→toggleOneOff`,
`registrarHabito→recordHabit`, `registrarRecompensa→storeReward`, `tagsEmUso→tagsInUse`.
Stores (`checkin.ts`): `renovarDia→renewDay`, `concluirCheckin→finishCheckin`,
`checkinPendente→pendingCheckin`.
Stores (`config.ts`): `definirTema→setTheme`, `definirConfiguracao→setSettings`,
`exportarJSON→exportJSON`, `importarJSON→importJSON`, `apagarTodosDados→wipeAllData`,
`aplicarTemaEfetivo→applyEffectiveTheme`.
Stores (`conversas.ts`): `criarConversa→createConversation`, `conversaPorId→conversationById`,
`atualizarConversa→updateConversation`, `adicionarMensagem→addMessage`, `excluirConversa→deleteConversation`.
Stores (`diario.ts`): `diarioAtual→currentDiary`, `salvarDiario→saveDiary`,
`entradaDoDia→entryOfDay`, `salvarEntrada→saveEntry`, `excluirEntrada→deleteEntry`,
`moverEntrada→moveEntry`, `importarDiario→importDiary`, `listarDiario→listDiary`.
`appStore` permanece `appStore`.

## SEU SLICE
A fatia atribuída está descrita na meta-instrução. Renomeie TODOS os identificadores
PT→EN dos arquivos do seu slice. Valores persistidos (lista acima) permanecem.

## VALIDAÇÃO
Rode `cd ~/Projetos/esquizomon-rpg && npm run typecheck` ao final e reporte o
resultado. Erros restantes que VENHAM de arquivos FORA do seu slice (ex.: ui/ que
ainda não foi renomeado) são esperados — liste-os num bloco "FORA-DO-SLICE".
Erros DENTRO do seu slice você DEVE corrigir até ficar zerado.
