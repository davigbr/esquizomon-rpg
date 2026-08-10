# Esquizomon RPG — Features

> Lista viva de features do app. Status: ✅ implementada · 🔜 planejada (documentada, **não** implementada).
> Este arquivo substitui o antigo `PLANO.md` (aposentado em 2026-08-10). Narrativa oficial continua em [`NARRATIVA.md`](./NARRATIVA.md).

---

## ✅ Implementadas

### Núcleo de tarefas (Fase 1)
- CRUD de 3 tipos: recorrente / única / hábito, em 3 colunas estilo Habitica
- Dificuldade (×1/×1.5/×2/×2.5), tags, esfera, notas markdown-lite, due date, envelhecimento
- Filtros (tag/dificuldade/concluídas), drag & drop, navegação de data ◀ ▶
- Export/import JSON, PWA, tema dark/ouro

### Jogo (Fase 2)
- XP/nível (nível×80), HP + dano diário e de hábitos negativos, morte não-destrutiva (perde 1 carta)
- Mana, esferas (perfil de distribuição), modo relaxado
- Barra de status global, gráficos de progressão SVG, tabelas XP/Dano, página Histórico

### Baralho (Fase 3)
- 65 cartas; iniciais 5M+1C+1A, +2 por nível, completo no nível 30 (~1 ano)
- Galeria (desbloqueadas primeiro, bloqueadas com cadeado + nome), modal com invocação por mana, custo crescente por re-invocação

### Diário (Fase 3)
- 1 entrada/dia, editor markdown live preview (linhas vivas), autosave, voz (Web Speech API, 100% local)
- Mover entre datas respeitando 1/dia; Fábula lê as últimas 3 entradas no contexto da IA

### Chat da Fábula (Fase 4)
- BYOK (DeepSeek / OpenCode Zen Go) via Netlify Function reusada em dev como middleware Vite (mesma URL `/api/ia`)
- Multi-conversa persistida (30×200), raciocínio colapsável, painel redimensionável
- System prompt texto livre + botão "Restaurar padrão"

---

## 🔜 Mapa do mundo

**Status: planejada — apenas documentação. Sem implementação.**

### Conceito

O mapa dá **espacialidade ao mundo escolhido** pelo jogador (os mundos do `NARRATIVA.md`). O esforço real — concluir tarefas, repetir hábitos, XP ganho — é **convertido em KM**, e esses KM movem o personagem por um mapa com pontos, rotas de viagem e objetivos fantásticos. Mesma tese do resto do jogo: o cotidiano vira textura do mundo, nunca métrica.

O objetivo do jogo segue valendo: **construir um mundo próprio** — o mapa é o território onde isso acontece.

### 1. Geração do mapa — presets ou algoritmo

- **Presets:** um mapa pronto para cada mundo do `NARRATIVA.md` (Império, Grimório, Bestiário, Ferrovia, Jardim do Fim do Mundo, Expedição, Clube da Meia-Noite). Cada preset define:
  - regiões (nome + bioma),
  - pontos de interesse (cidade, ruína, marco, santuário…),
  - rotas sugeridas entre pontos,
  - ponto de partida.
- **Algoritmo:** geração procedural **determinística por seed** (mesma seed → mesmo mapa, persistível). Parâmetros: nº de regiões e pontos, densidade de rotas, conectividade do grafo. Seed digitada pelo usuário ou sorteada.
- [REC] começar com **presets** (1 mapa por mundo); geração por algoritmo fica como evolução posterior da mesma feature.

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
