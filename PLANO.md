# Esquizomon App — App de Tarefas RPG (Plano de Ideação)

> **Status:** ideação (Fase 0)
> **Data:** 2026-08-03
> **Nome de trabalho:** `esquizomon-app` (pasta do repo). Título narrativo a decidir (sugestões na seção 11).
> **Convenção do doc:** `[REC]` = recomendação minha · `[ABERTO]` = decisão pendente, com alternativa.
> **Repositório:** `~/Projetos/esquizomon-app` (iniciado em 2026-08-03)

---

## 1. Conceito

Um app de tarefas e organização pessoal com estrutura RPG inspirada no Habitica — tarefas viram a matéria de um jogo de personagem — **integrado ao baralho Esquizomon** e com uma **camada narrativa ficcional gerada por IA** em cima da vida real do usuário. A IA (com chave de API do próprio usuário) funciona como narrador/mestre: conhece o contexto da vida real, transforma tarefas cotidianas em eventos ficcionais e opera o app por texto ou voz.

A tese de fundo: **a ficção não é fuga da realidade, é uma dobra que dá outra textura ao cotidiano** — alinhada com o conceito de fabulação criativa do próprio Esquizomon (a fabulação inventa conexões que não existiam e, uma vez feitas, mudam a textura do real).

---

## 2. Objetivos e não-objetivos

**Objetivos**
- Organizar tarefas de 3 tipos (recorrentes, únicas, hábitos) com dificuldade, tags e links
- Motivar via jogo: XP, nível, HP, mana, esferas — leve, não punitivo
- Usar o baralho Esquizomon (65 cartas) como máquina de missões narrativas
- Camada ficcional por IA sobre o contexto real do usuário (BYOK: Gemini, ChatGPT, DeepSeek, OpenCode)
- Rodar em browser, celular (PWA) e desktop, com dados 100% do usuário (local-first + export/import)

**Não-objetivos (por ora)**
- Não é um MMO / não tem multiplayer
- Não é um sistema de RPG completo (sem combate por turnos, sem inventário complexo, sem fichas de atributos numéricas)
- Não é um app de notas nem um habit tracker genérico — é um jogo de transformação do cotidiano
- Sem backend obrigatório: o app funciona offline; serviços externos são opcionais (IA, planilha)

---

## 3. Modelo de tarefas (inspirado no Habitica)

| Tipo | Comportamento | Pontuação | Falha |
|---|---|---|---|
| **Recorrente** (daily) | Se repete com frequência (todos os dias, dias específicos da semana, X vezes por semana) | XP ao concluir | **Dano ao personagem** no reset diário se não concluída |
| **Única** (todo) | Feita e finalizada | XP ao concluir | Sem dano por atraso (fica pendente) |
| **Hábito** | Pode ser feito múltiplas vezes; positivo (+) e negativo (−); sem data | XP por repetição (+); pequeno dano/nenhum (−) | Streak quebra |

**Dificuldade** (default **média**): fácil · média · difícil · extrema — multiplicador de XP e de dano (referência Habitica: 1 / 1,5 / 2 / 2,5).

**Campos da tarefa**
- `tipo`, `título`, `dificuldade`, `tags[]`, `links[]`, `notas`
- `esfera` (opcional, fase 2 — ver 4.4)
- `agenda` (recorrentes): diária, dias da semana, frequência semanal
- `contador/streak` (hábitos): repetições hoje, melhor sequência
- `histórico[]` de conclusões (alimenta a IA e estatísticas)

---

## 4. Sistema de jogo

### 4.1 XP e nível
- XP por conclusão = base da dificuldade × multiplicadores (esfera, carta do dia, aliança ativa)
- Curva de nível simples e suave (nível n exige ~n×100 XP, calibrar)
- **Subir de nível desbloqueia cartas do baralho** (elo jogo ↔ baralho)

### 4.2 HP — [REC: sim, simples]
- HP máximo escala com nível (base 50 + bônus)
- Dailies não concluídas no reset diário causam dano proporcional à dificuldade; hábitos negativos causam dano pequeno
- **Morte não-destrutiva:** HP ≤ 0 = estado "esgotado" (dia seguinte sem bônus de mana/XP extra; HP restaura no reset). **Sem reset de progresso** — o Habitica reseta o personagem na morte e isso é punitivo demais para o uso real
- [ABERTO] Modo "relaxado": opção de desligar o dano (jogo vira só bônus) — [REC: sim, com toggle]

### 4.3 Mana — [REC: sim, e é o elo com o baralho]
- Mana regenera no reset diário (+ pequenos ganhos por hábitos positivos)
- **Mana é o recurso de invocação:** gastar mana para invocar cartas do baralho e pedir missões narrativas à IA
- Sem mana → jogo fica sem baralho/IA; com mana → o jogador escolhe quando ativar a ficção

### 4.4 Atributos — [REC: "esferas" estilo Mago: A Ascensão, simplificadas, fase 2]
- Em vez de Força/Destreza (números), **esferas = domínios da vida** escolhidos pelo usuário (ex.: Corpo, Estudo, Criação, Vínculos, Cuidado)
- Cada tarefa pode pertencer a uma esfera → +XP nessa esfera
- A ficha mostra um **perfil de esferas** (onde a energia está indo) — diagnóstico visual sem matemática
- A IA usa as esferas como vocabulário narrativo ("sua esfera de Criação está vibrando")
- **Por que Mago: A Ascensão como referência:** a vibe é "transformar o mundo pela vontade/prática", não sistema pesado. Ficam fora: Arete, Esferas mágicas de 9 níveis, Paradoxo, rolagens de dados

### 4.5 Recompensas
- [ABERTO] Ouro + loja de recompensas personalizadas (como no Habitica: "1h de jogo custa 50 de ouro") — [REC: fase 2+, só se fizer sentido após o MVP]

---

## 5. Baralho Esquizomon

### 5.1 Dados
- 65 cartas: **31 Monstro / 19 Captura / 15 Aliança** (fonte: vault — `Baralho Adulto.md`, `Cartas de Captura.md`, `Cartas de Aliança.md`)
- **`scripts/exportar-baralho.mjs`**: gera `deck.json` com id estável, nome, tipo, descrição, vetor (D/R), leitura esquizoanalítica — idempotente, re-rodável quando o vault mudar
- Metacartas (Linha de Contágio, Primeiro Corte / Operação) ficam **fora** do baralho do app por ora — [ABERTO] podem virar recompensas especiais futuras

### 5.2 Papéis dos 3 tipos no jogo
| Tipo | Papel no app | Exemplo |
|---|---|---|
| **Monstro** | Missão/desafio do dia: o esquizomon ronda seu território; concluir tarefas o enfraquece | "Garras de Obsidiana rondam — conclua 3 tarefas da esfera Corpo para expulsá-lo" |
| **Captura** | Teste de resistência: uma força tenta capturar seu território; resistir = não cair na armadilha (ex.: não fazer o hábito negativo, manter o foco) | "Crono-Suga espreita — resistir à procrastinação hoje rende bônus" |
| **Aliança** | Encontro do fora: bônus passivo imediato (mana, +XP numa esfera) | "Solidão Alegre — +3 de mana hoje" |

### 5.3 Carta do dia — [REC: sim]
- Sorteio automático diário entre as **desbloqueadas** (1 por dia, sem custo)
- Vira a "missão narrativa" do dia: a IA escreve a abertura com base nela
- Concluir a missão → XP bônus + progresso de desbloqueio

### 5.4 Invocação — [REC: sim, custa mana]
- O usuário escolhe uma carta desbloqueada e a **invoca** (gasta mana)
- A IA gera um evento/missão narrativa ligado àquela carta específica
- Combina com o contexto real: "Invoquei a Mil Dançarinas → a IA me dá uma tarefa de multiplicidade (começar um projeto em vez de buscar o perfeito)"

### 5.5 Combate — [REC: leve, barra de HP no dia]
- Monstro do dia = **chefe com barra de HP própria**; cada tarefa concluída dá dano (proporcional à dificuldade); derrotar até o reset → recompensa; não derrotar → sem bônus (a punição já é a daily perdida, não dobrar)
- Captura do dia = resistência passiva; Aliança = bônus imediato
- Alternativa: monstro 100% narrativo (sem barra) — mais simples, menos "jogo"

### 5.6 Desbloqueio progressivo
- Começa com **~25% desbloqueadas** (dentro do pedido de 20–30%; ~16 cartas, sorteadas na primeira execução e fixadas)
- Fontes de desbloqueio: subir de nível, completar missão da carta do dia, invocações bem-sucedidas
- [ABERTO] Desbloquear por "encontro" com carta específica (como o site faz com avaliações) — [REC: não por ora, aqui o jogo é a fonte de progresso]

---

## 6. Camada de IA (o coração do app)

### 6.1 BYOK (bring your own key)
- Usuário configura **provider + modelo + chave de API** no app; chave fica no dispositivo
- Providers: **Gemini, ChatGPT (OpenAI), DeepSeek, OpenCode** — DeepSeek e OpenCode usam API compatível com OpenAI (base URL própria); Gemini tem endpoint compatível e nativo
- **Adapter único** `src/ai/`: interface `chat(mensagens, opcoes)` com implementação por provider — [REC] começar com 1 adapter OpenAI-compatível + 1 Gemini (cobre os 4)
- Modelo padrão sugerido: um barato por provider (ex.: DeepSeek chat, Gemini Flash, GPT-4o-mini) — custo fica no usuário, então o app deve gastar pouco

### 6.2 Tela de contexto (o combustível da ficção)
- Campos: quem é, onde mora, o que faz, rotinas (manhã/noite), pessoas importantes, metas atuais, temas que não quer na ficção, tom preferido do narrador
- A IA **só** conhece o que está aqui + as tarefas — o usuário controla o quanto a IA sabe
- Privacidade: contexto e histórico ficam **no dispositivo**; chamadas vão direto à API escolhida

### 6.3 O narrador (mestre)
- **Abertura do dia:** texto curto ficcionalizando o dia real (com carta do dia + tarefas de hoje)
- **Reescrita narrativa:** cada tarefa pode ganhar um "nome ficcional" (ex.: "lavar a louça" → "purificar os artefatos do laboratório") — a lista real continua sendo a fonte
- **Eventos ao concluir:** reação narrativa curta à conclusão
- **Fechamento do dia:** balanço ficcional do que foi feito (opcional, 1×/dia)
- Estilo: tom cartográfico/afirmativo, sem jargão denso, sem moralismo

### 6.4 Operação do app por texto e voz
- O usuário pode **concluir, criar e editar tarefas** conversando: "concluí a academia", "adiciona ler 20 páginas amanhã"
- Pipeline: voz (Web Speech API) → texto → **parser de intenção** (a IA devolve JSON estruturado: `{acao, tarefaId?, dados?}`) → **o app valida e executa** — a IA nunca altera dados diretamente
- Confirmação obrigatória para ações destrutivas (excluir, editar em lote)
- [ABERTO] Voz no desktop (Tauri) exige plugin nativo — [REC: texto primeiro, voz no browser/PWA]

### 6.5 Regras de segurança
- A IA não cria/exclui tarefas sem confirmação (ou confirmação em lote explícita)
- Rate-limit: limite de chamadas por dia (evita custo surpresa); cache de abertura do dia
- Fallback: sem chave de API, o app funciona 100% (sem camada narrativa)

---

## 7. Plataformas e arquitetura

### 7.1 Alvos e stack — [REC]
- **Um código para os 3 alvos:** Vite 8 + TypeScript strict + **nanostores** + Dexie (padrão já consolidado nos seus projetos)
- **Browser/PWA** (Netlify): instala no celular, funciona offline
- **Desktop:** Tauri 2 (leve, usa o webview do sistema) — Electron como alternativa mais pesada
- UI: dark/ouro, limpa, sem gradients (suas preferências visuais)

### 7.2 Estrutura do repo (previsão)
```
esquizomon-app/
├── PLANO.md
├── index.html
├── src/
│   ├── core/        # domínio puro (tarefas, jogo, cartas) — testável sem UI
│   ├── stores/      # nanostores (tarefas, personagem, baralho, narrativa, config)
│   ├── db/          # persistência versionada (localStorage + Dexie)
│   ├── ai/          # adapters de provider + parser de intenção
│   ├── narrativa/   # contexto, prompt builder, log narrativo
│   ├── ui/          # telas e componentes
│   └── main.ts
├── scripts/
│   ├── exportar-baralho.mjs   # vault → deck.json (idempotente)
│   └── sheets-bridge/         # Apps Script (cola no Google)
└── tauri/           # fase 5
```

### 7.3 Modelo de dados (esboço)
```ts
type TipoTarefa = 'recorrente' | 'unica' | 'habito'
type Dificuldade = 'facil' | 'media' | 'dificil' | 'extrema'

interface Tarefa {
  id: string
  tipo: TipoTarefa
  titulo: string
  dificuldade: Dificuldade          // default 'media'
  tags: string[]
  links: string[]
  notas?: string
  esfera?: string                   // fase 2
  agenda?: { dias: number[] }       // recorrente (0-6)
  contador?: { hoje: number; streak: number }  // hábito
  historico: string[]               // datas de conclusão
}

interface Personagem {
  nivel: number; xp: number; xpProximo: number
  hp: number; hpMax: number
  mana: number; manaMax: number
  esferas: Record<string, number>   // fase 2
  esgotado?: boolean
}

interface EstadoBaralho {
  desbloqueadas: string[]           // ids das cartas
  cartaDoDia?: { id: string; data: string; resolvida: boolean }
  invocacoes: { id: string; data: string; cartaId: string; custo: number }[]
}

interface Contexto { /* perfil que alimenta a IA (6.2) */ }
interface LogNarrativo { id: string; data: string; texto: string; tipo: 'abertura'|'evento'|'fechamento' }
interface ConfigIA { provider: 'gemini'|'openai'|'deepseek'|'opencode'; modelo: string; chave?: string }
```

---

## 8. Armazenamento: planilha Google vs JSON — [REC: local-first + ponte Sheets]

**Minha recomendação: Sheets NÃO como banco de dados do app. Local-first como fonte primária, Sheets como ponte de edição/backup.**

| Critério | Sheets como banco | Local (IndexedDB/localStorage) + export |
|---|---|---|
| Offline | ✗ quebra | ✓ funciona sempre |
| Latência | ✗ cada escrita = rede | ✓ instantâneo |
| Privacidade | ✗ rotina/contexto na nuvem do Google | ✓ dados no dispositivo |
| Confiabilidade | ✗ rate limits, conflitos de escrita, schema frágil | ✓ schema versionado + validação |
| Ver/editar em massa | ✓ ótimo | ✗ ruim → **por isso a ponte** |
| Backup/portabilidade | ✓ | ✓ via export/import |

**Desenho recomendado (atende seu desejo real, sem os custos):**
1. **Fonte primária:** localStorage (estado JSON versionado, `app:v1` + type guard na carga) + IndexedDB (Dexie) para mídia/artes se houver — offline-first
2. **Export/import:** JSON completo (1 arquivo) e CSV por tipo — backup e portabilidade
3. **Ponte Sheets (Apps Script, padrão já usado no site):** exporta estado → planilha (abas Tarefas, Hábitos, Ficha, Contexto) e importa de volta — o usuário **edita em massa na planilha** e o app consome. Apps Script colado manualmente (código sempre exibido no chat, como você prefere)

O JSON não some — ele é o formato canônico; a planilha é uma *janela* sobre ele.

---

## 9. Visões (telas)

1. **Hoje** — dailies do dia + carta do dia/missão + barras HP/mana compactas
2. **Tarefas** — todas (recorrentes + únicas), filtros por tag/esfera/dificuldade
3. **Hábitos** — grade de hábitos com streaks (+/−)
4. **Ficha** — nível, XP, HP, mana, esferas, histórico de dano/bônus
5. **Baralho** — coleção (desbloqueadas/bloqueadas), carta do dia, invocar
6. **Narrativa** — feed do narrador (aberturas, eventos, fechamentos)
7. **Contexto** — perfil que alimenta a IA
8. **Config** — providers de IA (BYOK), export/import, tema, modo relaxado
9. *(fase 2+)* Semana/calendário

---

## 10. Roadmap

| Fase | Conteúdo | "Pronto quando" |
|---|---|---|
| **0 — Ideação** | Este documento | Decisões marcadas resolvidas (ou conscientemente adiadas) |
| **1 — MVP tarefas** | CRUD 3 tipos, dificuldade, tags, links; visões Hoje/Tarefas/Hábitos; persistência versionada; export/import JSON; PWA básico | Dá pra organizar a semana real sem jogo nenhum |
| **2 — Jogo** | XP/nível, HP, mana, dano diário, morte não-destrutiva, ficha; esferas (opcional) | Concluir tarefas move barras e o personagem "vive" |
| **3 — Baralho** | `deck.json` (script do vault), desbloqueio ~25%, carta do dia, invocação, combate leve | Um dia real tem missão de carta e recompensas |
| **4 — IA** | BYOK multi-provider, contexto, narrador (abertura/eventos/fechamento), comandos texto/voz, parser de intenção | "Concluí a academia" conclui a tarefa e o narrador reage |
| **5 — Distribuição** | Tauri desktop, ponte Sheets (Apps Script), polish, testes E2E | Usável nos 3 alvos com dados exportáveis |

Cada fase termina com **build utilizável** (nada de metade de feature pendurada). [REC: começar Fase 1 com scaffold Vite + TS + nanostores + Dexie, seguindo o skill local-first-web-apps.]

**Opcional (fase 2+):** importar tarefas do Habitica via API v3 (você já usa Habitica hoje — o app pode ser o substituto natural).

---

## 11. Decisões em aberto (resumo)

| # | Pergunta | [REC] | Alternativa |
|---|---|---|---|
| 1 | Nome do app | Pasta `esquizomon-app`; títulos sugeridos: **"Esquizomon: Crônicas do Cotidiano"**, "Ascensão", "Devir Diário" | outro nome |
| 2 | HP? | Sim, simples, morte não-destrutiva | sem HP (só XP) |
| 3 | Mana? | Sim — recurso de invocação do baralho | sem mana (invocação por nível) |
| 4 | Atributos? | Fase 2, "esferas" opcionais (Mago: A Ascensão simplificado) | atributos numéricos clássicos / nenhum |
| 5 | Dano diário por daily perdida? | Sim, leve e proporcional à dificuldade + modo relaxado | só bônus por concluir (sem punição) |
| 6 | Carta do dia? | Sim, sorteio diário automático | só invocação manual |
| 7 | Combate com monstro? | Barra de HP do chefe no dia | monstro só narrativo |
| 8 | Desbloqueio inicial | ~25% (16 cartas) | 20–30% conforme faixa pedida |
| 9 | Sheets vs JSON | Local-first + export/import + ponte Sheets (Apps Script) | Sheets como banco (não recomendo) |
| 10 | Stack | Vite 8 + TS strict + nanostores + Dexie + PWA + Tauri | Electron, React + backend |
| 11 | Voz | Web Speech API (browser/PWA); texto primeiro no desktop | plugin nativo Tauri |
| 12 | Ouro/loja de recompensas | Fase 2+, só se fizer sentido | nunca |

---

## 12. Riscos

- **Escopo grande demais** (RPG + baralho + IA + 3 plataformas) → mitigação: fases pequenas, cada uma utilizável; IA e baralho só entram nas fases 3–4
- **Mecânica punitiva afasta o uso real** → dano leve, morte não-destrutiva, modo relaxado
- **Custo da IA (BYOK)** → modelos baratos por padrão, rate-limit diário, fallback sem chave
- **Baralho muda no vault** → export idempotente com ids estáveis (o site já usa ids estáveis após as renomeações)
- **Voz é instável** (Safari/iOS limita SpeechRecognition; desktop precisa de plugin) → voz é camada opcional, texto cobre tudo
- **Ficção virar ruído** → narrador conciso (abertura/eventos curtos), opção de silenciar eventos

---

## 13. Próximos passos

1. [ ] Resolver (ou adiar conscientemente) as decisões da seção 11
2. [ ] Decidir o nome/título do app
3. [ ] Fase 1: scaffold Vite + TS + nanostores + Dexie + persistência versionada + CRUD de tarefas
4. [ ] Fase 1: visões Hoje/Tarefas/Hábitos + export/import JSON + PWA
