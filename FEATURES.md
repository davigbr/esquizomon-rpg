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

### Jogo (Fase 2)
- XP/nível (nível×80), HP + dano diário e de hábitos negativos, morte não-destrutiva (perde 1 carta)
- Mana, modo relaxado
- Barra de status global, gráficos de progressão SVG, tabelas XP/Dano, página Histórico

### Baralho (Fase 3)
- 65 cartas; iniciais 5M+1C+1A, +2 por nível, completo no nível 30 (~1 ano)
- Galeria (desbloqueadas primeiro, bloqueadas com cadeado + nome), modal com invocação por mana, custo crescente por re-invocação

### Diário (Fase 3 + timeline 2026-09-27)
- **Timeline de notas rápidas** (múltiplas por dia): campo de captura no topo (Enter/Done salva), cards com hora, edição/exclusão por sheet (modal); a seção de HOJE sempre aparece
- **Crônica diária** (1/dia, opcional): card destacado no dia + editor markdown em modal (autosave, Ver/Editar, excluir); import em massa continua (só crônicas)
- XP: +5 POR REGISTRO (cada nota e cada crônica rendem; várias por dia); editar o mesmo registro não re-rende; menção de carta +10 no save (dedup por dia)
- Crônica salva SEM título: com IA ligada, a IA escolhe UMA palavra como título (toast "Título sugerido pela IA"); com IA desligada ou falha, o título vira a DATA (dd/mm/aaaa). Título digitado pelo usuário sempre prevalece.
- **Localização (cidade)**: ao registrar nota ou crônica, o browser pede permissão UMA vez e o app grava só o NOME da cidade (geolocalização + reverse-geocode BigDataCloud, sem chave, pt-BR). Coordenadas jamais persistem; se a permissão for negada ou o serviço cair → sem cidade, silencioso (sem prompt repetido na sessão). Cidade aparece nos cards e entra no contexto da Fábula ("em {cidade}"). Import em lote NÃO preenche localização. A cidade é EDITÁVEL (nota no sheet, crônica no modal) e dá pra limpar (campo vazio).
- Título da crônica editável; quando é título AUTOMÁTICO (data ou palavra da IA), tocar no campo seleciona tudo — digitar SUBSTITUI em vez de concatenar (bug 2026-09-28; no iOS o cursor entraria no fim). Botão "gerar título com IA" (📝 wand) ao lado direito do campo do título, visível APENAS com a IA (BYOK) ligada — gera UMA palavra do texto atual sob demanda e salva de imediato. Se a IA falha, o toast mostra o MOTIVO real (HTTP/chave/modelo/timeout), não um genérico; timeout do título é 40s (modelos de raciocínio — bug 2026-09-28).
- Fábula lê os últimos 5 dias (crônica + notas agrupadas) na íntegra
- Layout desktop do diário: timeline mais larga (920px) e notas em GRADE (2 col ≥1100px, 3 col ≥1600px); mobile/tablet mantém coluna única estreita (760px)
- Dados: `notes[]` (merge por id no sync) + `diary[]` (1/dia, merge por data); status bar escondida na rota diário no mobile (≤900px). Exclusões criam TOMBSTONE de sync (`deletedNotes`/`deletedDiaryEntries`) — crônica/nota excluída nunca volta via nuvem (bug 2026-09-28).

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
