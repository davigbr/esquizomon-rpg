# Esquizomon RPG — Features

> Lista viva de features do app. Status: ✅ implementada · 🔜 planejada (documentada, **não** implementada).
> Este arquivo substitui o antigo `PLANO.md` (aposentado em 2026-08-10). Narrativa oficial continua em [`NARRATIVA.md`](./NARRATIVA.md).

---

## ✅ Implementadas

### Núcleo de tarefas (Fase 1)
- CRUD de 3 tipos: recorrente / única / hábito, em 3 colunas estilo Habitica
- Dificuldade (×1/×1.5/×2/×2.5), tags, notas markdown-lite, due date, envelhecimento
- Filtros (tag/dificuldade/concluídas), drag & drop, navegação de data ◀ ▶
- Export/import JSON, PWA, tema dark/ouro
- **Visualização Agenda** (toggle Colunas|Agenda, 2026-10-01): só recorrentes e tarefas (SEM hábitos), em seções por janela de data — atrasadas → hoje → próximas ações (sem data) → esta semana (até sábado 24h) → mês corrente → mês+1 → mês+2 (todos exibindo o NOME do mês, calculado dinamicamente) → semestre (resto do semestre civil) → ano (resto do ano). Cada item aparece em UMA única seção; recorrentes só no dia atual (atrasadas se houver ocorrência perdida — uma ocorrência —, senão hoje), nunca em seções futuras. Modo e layout persistidos em `settings` (blob do app) — salvos e sincronizados com a conta; concluir/editar funcionam na Agenda. No desktop as 9 seções viram **3 colunas por horizonte** — Agora (atrasadas·hoje·próximas ações) · Este mês (semana·mês) · Futuro (+1·+2·semestre·ano); no mobile empilham em coluna única. **Board personalizável**: botão "Personalizar" liga o modo edição — **renomear** cada coluna, **adicionar/remover colunas** (1 a 6) e **arrastar as seções** entre colunas e **reordenar dentro da mesma coluna** (uma linha tracejada marca o ponto exato onde a seção vai cair; no modo edição as seções vazias aparecem para poder posicioná-las). A config (modo + colunas) vive em `settings.todayView`/`settings.agenda` → **persiste no save e sincroniza com a conta**; um normalizador no storage garante o invariante de que toda seção existe em exatamente UMA coluna (nada some, mesmo com config antiga/parcial). Sem pontilhado nas atrasadas (decisão do usuário). Botão **flutuante (+)** no canto inferior direito (substitui o + que havia em Próximas Ações) abre o formulário de nova tarefa

### Jogo (Fase 2)
- XP/nível (nível×80), HP + dano diário e de hábitos negativos, morte não-destrutiva (perde 1 carta)
- **Velocidade de progressão do XP** (Configurações → Jogo, 2026-10-01): **Lento (÷2) · Normal · Rápido (×2)** — multiplica **todos os ganhos** de XP (tarefa única, recorrente marcada, hábito positivo, nota/crônica do diário, menção de carta). Não muda a fórmula de nível, **não é retroativo** (o já ganho fica) e **não afeta dano/HP** (hábito negativo fica fora — decisão do usuário). Sempre **arredonda para baixo** (÷2 de 5 = 2), então o Lento nunca infla. A tela **Jogo** mostra a tabela de XP já escalada, a linha "Velocidade de progressão: …" e a regra do diário interpolada. Vive em `settings.xpSpeed` (persiste e **sincroniza**); o snapshot de reversão (`task.rewards[date].xp`) guarda o valor **já escalado**, para desmarcar devolver exatamente o que foi dado
- Mana, modo relaxado
- Barra de status global, gráficos de progressão SVG, tabelas XP/Dano, página Histórico

### Baralho (Fase 3)
- 65 cartas; iniciais 5M+1C+1A, +2 por nível, completo no nível 30 (~1 ano)
- Galeria (desbloqueadas primeiro, bloqueadas com cadeado + nome), modal com invocação por mana, custo crescente por re-invocação

### Diário (Fase 3 + timeline 2026-09-27)
- **Tudo é NOTA** (união 2026-09-28): múltiplas por dia, cada uma com título (opcional), cidade, **data e hora**, e o corpo exibe markdown formatado (negrito, itálico, listas, código, links, tabelas, blocos). Campo de captura no topo (Enter/Done salva), cards com hora + título. No sheet da nota dá pra editar título, TEXTO, cidade, **DATA e HORA** — mudar a data move a nota para aquele dia. A "crônica" (1/dia/editor markdown) foi removida; crônicas antigas MIGRAM para notas com o título preservado (v4). Import em massa cria UMA nota por dia (`## AAAA-MM-DD`, título via **Negrito**).
- XP: +5 POR NOTA (várias por dia); editar o mesmo registro não re-rende; menção de carta +10 no save (dedup por dia)
- Título da nota editável pela sheet; botão "gerar título com IA" (📝 wand) ao lado direito do campo do título, visível APENAS com a IA (BYOK) ligada — gera UMA palavra do texto atual sob demanda. Se a IA falha, o toast mostra o MOTIVO real (HTTP/chave/modelo/timeout), não um genérico; timeout do título é 40s (modelos de raciocínio).
- **Localização (cidade)**: ao registrar uma NOTA, o browser pede permissão UMA vez e o app grava só o NOME da cidade (geolocalização + reverse-geocode BigDataCloud, sem chave, pt-BR). Coordenadas jamais persistem; se a permissão for negada ou o serviço cair → sem cidade, silencioso (sem prompt repetido na sessão). Cidade aparece nos cards e entra no contexto da Fábula ("em {cidade}"). Import em lote NÃO preenche localização. A cidade é EDITÁVEL (no sheet da nota) e dá pra limpar (campo vazio).
- Fábula lê os últimos 5 dias (NOTAS agrupadas, na íntegra, com título/cidade/hora)
- Layout desktop do diário: timeline mais larga (920px) e notas em coluna única (grade removida — preferência do usuário); mobile/tablet mantém coluna única estreita (760px)
- **Navegação para datas antigas (desktop)**: **calendário de calor** à esquerda (≥1100px, sticky acompanhando a rolagem) — mini-calendários por mês (setas ‹ ›), dia com nota = ponto dourado (≥5 = ponto cheio), hoje = anel dourado (inset). Clique num dia rola até aquele grupo e o destaca; dia sem nota → toast. **Paginação**: a timeline monta os 10 dias recentes + botão "Ver dias anteriores" (lotes de 10, delegado) — clicar num dia do calendário ainda não carregado expande a timeline até ele. Mobile/tablet: calendário escondido e timeline segue o comportamento original
- Dados: `notes[]` (merge por id no sync; campo `diary` ficou peso-morto p/ não quebrar merge/import); status bar escondida na rota diário no mobile (≤900px). Exclusões criam TOMBSTONE de sync (`deletedNotes`) — nota excluída nunca volta via nuvem.

### Chat da Fábula (Fase 4)
- BYOK (DeepSeek / OpenCode Zen Go) via Netlify Function reusada em dev como middleware Vite (mesma URL `/api/ia`)
- Multi-conversa persistida (30×200), raciocínio colapsável, painel redimensionável
- System prompt texto livre + botão "Restaurar padrão"

### PWA e notificações (2026-10)
- Manifest com `id`, `display_override`, screenshots reais de instalação (Playwright, `scripts/capture-pwa-screenshots.mjs`)
- Instalação: `beforeinstallprompt` capturado → botão "Instalar o app no celular" em Configurações; some após instalar
- Push (lembrete diário **genérico** — restrição local-first: o servidor nunca recebe dados de tarefas):
  - Cliente `src/sync/push.ts`: permissão → assinatura → `/api/push` (grava em Blobs: horários + offset UTC do device)
  - Scheduled Function `reminders` (cron `* * * * *`): converte UTC→horário local e dispara push (web-push, VAPID)
  - Configurações: ativar/desativar + até 3 horários; clique na notificação reabre o app
- **Env vars obrigatórias no Netlify:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:)

---

## 🔜 Mapa do mundo

**Status: planejada — apenas documentação. Sem implementação.**
> **Adiado em 2026-08-10:** discutido e considerado complexo demais para o momento — sem data. Decisões e pesquisa registradas abaixo para retomar quando fizer sentido.

### Conceito

O mapa dá **espacialidade ao mundo escolhido** pelo jogador (os mundos do `NARRATIVA.md`). O esforço real — concluir tarefas, repetir hábitos, XP ganho — é **convertido em KM**, e esses KM movem o personagem por um mapa com pontos, rotas de viagem e objetivos fantásticos. Mesma tese do resto do jogo: o cotidiano vira textura do mundo, nunca métrica.

O objetivo do jogo segue valendo: **construir um mundo próprio** — o mapa é o território onde isso acontece.

### Decisão de arquitetura (2026-08-10)

- **Gerador procedural EMBUTIDO no app** (canvas + simplex noise, determinístico por seed) — NÃO usar presets estáticos desenhados à mão como v1, e NÃO embutir ferramentas externas.
- Terreno rico: **relevo** (altura via noise fractal fBm), **biomas** (elevação × umidade → oceano, praia, floresta, savana, deserto, tundra, neve), **hillshade** (sombreamento do gradiente de altura) e **rios** (opcional).
- Grafo (pontos + rotas + marcador + objetivos) desenhado **por cima** do terreno, com estética de mapa antigo.
- Cada mundo do `NARRATIVA.md` = uma seed → 7 mapas visuais únicos e persistíveis.
- Dependência mínima: `simplex-noise` (~2KB) ou implementação própria; projeto segue vanilla.
- Por que não o Azgaar: é um app completo, não lib embutível; mapa estático exigiria gerar 7 imagens na mão e calibrar pontos sobre elas. Fica como referência de estilo.

### Pesquisa de projetos open source (2026-08-10)

| Projeto | ★ | Uso possível |
|---|---|---|
| Azgaar/Fantasy-Map-Generator | ~5,9k | Referência de estilo/estética; app completo, não embutível |
| mewo2/terrain | ~3k | Referência de estética de mapa antigo (papel, ruínas) |
| rlguy/FantasyMapGenerator | ~750 | Referência (baseado nas notas do Martin O'Leary) |
| jeheydorn/nortantis | ~217 | Referência (placas tectônicas, old-school) |
| edallen/dungen | ~21 | **Pointcrawl** (pontos + conexões) — o modelo que casa com o nosso grafo; referência de algoritmo para geração futura |

### 1. Geração do mapa — presets ou algoritmo

> **Decisão (2026-08-10):** a recomendação antiga ([REC] abaixo, "começar com presets") foi **superada** — a abordagem escolhida é o **algoritmo embutido** (ver "Decisão de arquitetura" acima). Presets podem voltar como camada opcional depois, mas não são o caminho da v1.

- **Presets:** um mapa pronto para cada mundo do `NARRATIVA.md` (Império, Grimório, Bestiário, Ferrovia, Jardim do Fim do Mundo, Expedição, Clube da Meia-Noite). Cada preset define:
  - regiões (nome + bioma),
  - pontos de interesse (cidade, ruína, marco, santuário…),
  - rotas sugeridas entre pontos,
  - ponto de partida.
- **Algoritmo:** geração procedural **determinística por seed** (mesma seed → mesmo mapa, persistível). Parâmetros: nº de regiões e pontos, densidade de rotas, conectividade do grafo. Seed digitada pelo usuário ou sorteada.
- [REC] ~~começar com **presets** (1 mapa por mundo); geração por algoritmo fica como evolução posterior da mesma feature.~~ *(superada pela decisão de 2026-08-10)*

### 2. Modelo do mapa (grafo)

O mapa é um **grafo**: pontos (nós) + rotas (arestas com distância em KM).

- **Ponto:** `{ id, nome, tipo, regiao, descricao }`
- **Rota:** `{ id, de, para, km }`
- **Região:** `{ id, nome, bioma }`
- **Objetivo:** `{ id, alvo (ponto|rota), nome, descricao, recompensa }`

### 3. Conversão progresso → KM

- Concluir tarefa → XP → KM. [ABERTO] proporção exata (ex.: 1 XP = 1 KM; calibrar na implementação)
- Hábito positivo → KM fixo por repetição
- [ABERTO] invocar carta ou outras ações no mapa geram KM / eventos?
- [ABERTO] dias sem concluir têm efeito no mapa (regressão, estagnação, nada)?
- [ABERTO] interação com o modo relaxado (dano desligado — KM também vira só bônus?)

### 4. Viagem e objetivos fantásticos

- KM acumulados movem o personagem **ao longo das rotas** (marcador no mapa)
- **Objetivo fantástico** = chegar a um ponto ou percorrer uma rota; é concluído ao acumular KM suficiente
- Recompensa ao atingir: [ABERTO] XP bônus / carta / só narrativa (consistente com a regra anti-produtividade: registro serve à história, não à métrica)

### 5. Interface

- Nova visão `#/mapa`: SVG do grafo, marcador da posição atual, rotas desenhadas, objetivos com barra de progresso em KM
- Painel de criação: escolher preset ou seed; editar pontos, rotas e objetivos manualmente
- Toast ao atingir um objetivo
- Integração com a barra de status (ex.: KM do dia) — a definir

### 6. Dados

- `AppData.mapa?: Mapa` + `VERSAO_DADOS = 4` (normalização v4)
- Conversão integrada aos pontos de ganho de progresso existentes (`ganharXP`, `registrarHabito`)
- Idempotência: KM derivados do XP real, nunca fabricados pelo render

### 7. Fora de escopo (v1 do mapa)

- Sem movimento livre / exploração hex-grid em tempo real
- Sem combate no mapa
- Sem multiplayer / mapas compartilhados

---

## Backlog / próximas fases

- **Fase 4.1:** tool calling, crônica automática do fim do dia, onboarding guiado
- **Fase 5:** Tauri desktop, ponte Google Sheets (Apps Script), deploy no Netlify, licença
- **Mapa do mundo** (esta feature — sem data)
