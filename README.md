# Esquizomon RPG — Crônicas Monstruosas Cotidianas

Um app de tarefas com estrutura de RPG — **sua vida real vira uma história, e você é o protagonista**. Não é um jogo de produtividade: é um diário de guerra poético. As tarefas são o material bruto; o jogo mede para contar, não para ranquear.

> O objetivo não é fugir do mundo — é habitá-lo de um jeito que seja seu.

## O que é

Você organiza tarefas (recorrentes, únicas e hábitos) e elas alimentam um personagem: XP, nível, HP e mana. As mecânicas são leves e não punitivas — dano diário proporcional, morte não-destrutiva, modo "relaxado" para desligar a punição.

Sobre isso, existe uma **camada narrativa**: o baralho Esquizomon (65 cartas) vira máquina de missões — Monstros, Capturas e Alianças nomeiam forças que circulam na vida real. E uma **cronista de IA** (opcional, com sua própria chave de API) devolve sua vida em forma de história. A narrativa oficial está em [`NARRATIVA.md`](./NARRATIVA.md) — todo mundo pode ler, mesmo sem conhecer esquizoanálise.

## Estado do projeto

| Fase | Conteúdo | Status |
|---|---|---|
| 1 — MVP tarefas | CRUD 3 tipos, dificuldade, tags, persistência versionada, export/import, PWA | ✅ feito |
| 2 — Jogo | XP/nível, HP, mana, dano diário, esferas, modo relaxado, ficha | ✅ feito |
| 3 — Baralho + Diário | `deck.json`, desbloqueio, carta do dia, invocação, combate leve; diário do dia (texto/voz) | em construção |
| 4 — IA | Narrador Fábula (BYOK), comandos texto/voz, onboarding guiado | planejado |
| 5 — Distribuição | Desktop (Tauri), ponte Google Sheets, polish | planejado |

Plano detalhado (mecânica, modelo de dados, decisões, riscos) em [`PLANO.md`](./PLANO.md).

## Funcionalidades

- Tarefas recorrentes, únicas e hábitos (+/−), com dificuldade, tags, esferas e histórico
- Jogo: XP, nível, HP, mana, dano diário leve, "esgotado" sem reset, modo relaxado
- Dark/ouro, limpa, sem gradients; PWA instalável e offline
- Export/import JSON — seus dados, suas regras
- **Em construção:** baralho Esquizomon (carta do dia, invocação com mana, combate leve) e diário do dia (digitação ou voz)
- **Planejado:** narrador de IA (Gemini, ChatGPT, DeepSeek, OpenCode — BYOK), operação por texto/voz, onboarding guiado, desktop Tauri, ponte Google Sheets

## Privacidade

O app roda **100% local**: dados e histórico ficam no seu dispositivo, funciona offline, nada sobe para servidores. A única exceção é a camada de IA, que você ativa ao configurar sua própria chave de API — a chamada vai direto ao provider escolhido e a chave fica no dispositivo.

## Stack

Vite 8 · TypeScript strict · nanostores · localStorage (persistência versionada) · Web Speech API (voz) · PWA · Tauri (planejado)

## Rodando localmente

```bash
npm install
npm run dev      # http://localhost:5176
```

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc && vite build
npm run preview
```

## Estrutura

```
esquizomon-rpg/
├── PLANO.md / NARRATIVA.md   # plano de produto e narrativa oficial
├── public/                   # PWA (manifest, service worker, ícones)
└── src/
    ├── core/                 # domínio puro: tipos, XP, dano, datas
    ├── stores/               # nanostores + ações + import/export
    ├── db/                   # persistência versionada
    └── ui/                   # views (hoje, tarefas, hábitos, ficha, config)
```

## Código aberto

Código aberto em <https://github.com/davigbr/esquizomon-rpg>. Licença ainda não definida — em breve.
