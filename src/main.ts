/** Bootstrap — router por hash, tema, nav e registro do service worker. */

import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import './style.css'

import { appStore, aplicarTemaEfetivo, consumirMorte, definirTema, registrarDeck, renovarDia } from './stores/app'
import { montarHoje } from './ui/views/hoje'
import { montarFicha } from './ui/views/ficha'
import { montarCartas } from './ui/views/cartas'
import { montarHistorico } from './ui/views/historico'
import { montarConfig } from './ui/views/config'
import { montarDiario } from './ui/views/diario'
import { alternarChat, montarChat, reagirMudancaStore } from './ui/chat'
import { verificarCheckin } from './ui/checkin'
import { iniciarAuth } from './sync/auth'
import { iniciarSync, inscreverSync, lerUltimaSync } from './sync/sync'
import { montarBotaoConta } from './ui/headerConta'
import { carregarDeck } from './core/baralho'
import { aoFalharPersistencia, temaInicial } from './db/storage'
import { notificar } from './ui/toast'

const raiz = document.getElementById('app')!
const navLinks = document.querySelectorAll<HTMLAnchorElement>('[data-rota]')

type Rota = 'hoje' | 'ficha' | 'cartas' | 'historico' | 'diario' | 'config'

function rotaAtual(): Rota {
  const hash = location.hash.replace(/^#\/?/, '')
  if (hash === 'ficha' || hash === 'cartas' || hash === 'historico' || hash === 'diario' || hash === 'config') return hash
  return 'hoje'
}

function montarRota(rota: Rota): void {
  const dados = appStore.get()
  switch (rota) {
    case 'hoje':
      montarHoje(raiz, dados)
      break
    case 'ficha':
      montarFicha(raiz, dados)
      break
    case 'cartas':
      montarCartas(raiz, dados)
      break
    case 'historico':
      montarHistorico(raiz, dados)
      break
    case 'diario':
      montarDiario(raiz, dados)
      break
    case 'config':
      montarConfig(raiz, dados)
      break
  }
  navLinks.forEach((a) => a.classList.toggle('ativo', a.dataset.rota === rota))
}

/* ---------- tema ---------- */

function aplicarTemaInicial(): void {
  const tema = temaInicial()
  definirTema(tema)
}

// Mudança do sistema (ex.: usuário trocou o modo escuro/claro do SO) → reaplica
// quando o tema escolhido é "sistema".
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (appStore.get().configuracao.tema === 'sistema') aplicarTemaEfetivo('sistema')
})

/* ---------- barra de status (nível, HP, XP, mana — fixa em todas as telas) ---------- */

const statusBar = document.getElementById('status-bar')!

/* valores anteriores para detectar mudança e animar */
let statusPrev = { hp: -1, xp: -1, mana: -1 }

/* elementos da barra (criados uma vez; valores atualizados preservando o nó para animar transição) */
let el: {
  nivel: HTMLElement
  hp: HTMLElement
  hpValor: HTMLElement
  hpBarra: HTMLElement
  xp: HTMLElement
  xpValor: HTMLElement
  xpBarra: HTMLElement
  mana: HTMLElement
  manaValor: HTMLElement
  manaBarra: HTMLElement
  esgotado: HTMLElement | null
} | null = null

/** Aplica brilho (classe de animação) a um item e remove ao terminar. */
function brilhar(item: HTMLElement, classe: string): void {
  item.classList.remove('status-brilho-ganho', 'status-brilho-perda', 'status-brilho-mana')
  void item.offsetWidth // reinicia a animação
  item.classList.add(classe)
  item.addEventListener('animationend', () => item.classList.remove(classe), { once: true })
}

function montarStatusBar(): void {
  const p = appStore.get().personagem
  const pctHp = Math.round((p.hp / p.hpMax) * 100)
  const pctXp = Math.min(100, Math.round((p.xp / p.xpProximo) * 100))
  const pctMana = Math.round((p.mana / p.manaMax) * 100)

  // detecta mudanças para animar (primeira renderização não anima)
  const hpAntes = statusPrev.hp
  const xpAntes = statusPrev.xp
  const manaAntes = statusPrev.mana
  const hpMudou = hpAntes >= 0 && p.hp !== hpAntes
  const xpMudou = xpAntes >= 0 && p.xp !== xpAntes
  const manaMudou = manaAntes >= 0 && p.mana !== manaAntes
  statusPrev = { hp: p.hp, xp: p.xp, mana: p.mana }

  // 1ª vez: cria a estrutura (a partir daí só atualiza valores, para a transição animar)
  if (!el) {
    statusBar.innerHTML = `
      <div class="status-identidade">
        <div class="status-identidade-info">
          <span class="status-nome"></span>
          <div class="status-item status-item--nivel" title="Nível"><i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i><span data-s-nivel></span></div>
        </div>
      </div>
      <div class="status-barras">
        <div class="status-item status-item--hp" title="Vida"><i class="fa-solid fa-heart" aria-hidden="true"></i><span data-s-hp></span><div class="status-trilho"><div class="status-preenchimento status-preenchimento--hp" data-b-hp></div></div></div>
        <div class="status-item status-item--xp" title="Experiência"><i class="fa-solid fa-star" aria-hidden="true"></i><span data-s-xp></span><div class="status-trilho"><div class="status-preenchimento status-preenchimento--xp" data-b-xp></div></div></div>
        <div class="status-item status-item--mana" title="Mana"><i class="fa-solid fa-droplet" aria-hidden="true"></i><span data-s-mana></span><div class="status-trilho"><div class="status-preenchimento status-preenchimento--mana" data-b-mana></div></div></div>
      </div>
      <div class="status-item status-item--esgotado" title="Esgotado" data-s-esgotado style="display:none"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Esgotado</span></div>
      <div class="status-item status-item--sync" data-s-sync title="Última sincronização"></div>
    `
    const q = (s: string) => statusBar.querySelector<HTMLElement>(s)!
    el = {
      nivel: q('[data-s-nivel]'),
      hp: statusBar.querySelector('.status-item--hp')!,
      hpValor: q('[data-s-hp]'),
      hpBarra: q('[data-b-hp]'),
      xp: statusBar.querySelector('.status-item--xp')!,
      xpValor: q('[data-s-xp]'),
      xpBarra: q('[data-b-xp]'),
      mana: statusBar.querySelector('.status-item--mana')!,
      manaValor: q('[data-s-mana]'),
      manaBarra: q('[data-b-mana]'),
      esgotado: statusBar.querySelector('[data-s-esgotado]'),
    }
  }

  // 2. atualiza valores (transição CSS anima a largura)
  el.nivel.textContent = `Nv ${p.nivel}`
  el.hpValor.textContent = `${p.hp}/${p.hpMax}`
  el.hpBarra.style.width = `${pctHp}%`
  el.xpValor.textContent = `XP ${p.xp}/${p.xpProximo}`
  el.xpBarra.style.width = `${pctXp}%`
  el.manaValor.textContent = `Mana ${p.mana}/${p.manaMax}`
  el.manaBarra.style.width = `${pctMana}%`
  if (el.esgotado) el.esgotado.style.display = p.esgotado ? 'inline-flex' : 'none'

  // avatar: criado/removido dinamicamente (o upload acontece após o 1º render)
  const avatarEl = statusBar.querySelector<HTMLImageElement>('.status-avatar')
  const avatarAtual = p.avatar
  // nome monstruoso: preenche o span FIXO do markup (display none se vazio)
  const nomeSpan = statusBar.querySelector<HTMLElement>('.status-nome')
  if (nomeSpan) {
    const nome = p.nomeMonstruoso?.trim() ?? ''
    nomeSpan.textContent = nome
    nomeSpan.style.display = nome ? '' : 'none'
  }
  const identidade = statusBar.querySelector<HTMLElement>('.status-identidade')
  const infoEl = statusBar.querySelector<HTMLElement>('.status-identidade-info')
  if (avatarAtual && !avatarEl) {
    const img = document.createElement('img')
    img.className = 'status-avatar'
    img.alt = 'Avatar'
    img.src = avatarAtual
    // insere ANTES do topo (nível) — na linha, à esquerda; ordem via flex `order`
    identidade?.insertBefore(img, infoEl)
  } else if (!avatarAtual && avatarEl) {
    avatarEl.remove()
  } else if (avatarAtual && avatarEl && avatarEl.getAttribute('src') !== avatarAtual) {
    avatarEl.setAttribute('src', avatarAtual)
  }

  // 3. brilho nas mudanças
  if (hpMudou) brilhar(el.hp, p.hp > hpAntes ? 'status-brilho-ganho' : 'status-brilho-perda')
  if (xpMudou) brilhar(el.xp, 'status-brilho-ganho')
  if (manaMudou) brilhar(el.mana, 'status-brilho-mana')
}

/* ---------- tela de morte (esgotado completo) ---------- */

const morteOverlay = document.getElementById('morte-overlay')!
const morteCarta = document.getElementById('morte-carta')!
const morteContinuar = document.getElementById('morte-continuar')!

function mostrarMorte(cartaId: string, cartaNome: string): void {
  morteCarta.innerHTML = cartaId
    ? `<img src="/images/cards/${cartaId}.png" alt="${cartaNome}" /><span>${cartaNome}</span>`
    : '<span>Carta perdida</span>'
  morteOverlay.hidden = false
  morteContinuar.focus()
}

morteContinuar.addEventListener('click', () => {
  morteOverlay.hidden = true
})

/* ---------- router ---------- */

window.addEventListener('hashchange', () => montarRota(rotaAtual()))

/* re-render na troca de estado, mantendo a rota atual */
appStore.subscribe(() => {
  montarStatusBar()
  montarRota(rotaAtual())
  // morte: mostra a tela de esgotado com a carta perdida (uma vez)
  const morte = consumirMorte()
  if (morte && morteOverlay.hidden) mostrarMorte(morte.cartaId, morte.cartaNome)
  // o chat lê do appStore — re-renderiza pra refletir mudanças externas
  reagirMudancaStore()
})

/* ---------- chat da Fábula (painel lateral) ---------- */

document.getElementById('fabula-toggle')!.addEventListener('click', () => {
  montarChat()
  alternarChat()
})

/* ---------- conta no header (login/sincronização) ---------- */

montarBotaoConta()

/* ---------- dia novo ---------- */

renovarDia()
verificarCheckin()

/* ---------- conta & sincronização (opcional — o app roda offline) ---------- */

/** Item "última sincronização" na status bar (desktop, à direita). */
function atualizarSyncStatus(): void {
  const el = document.querySelector<HTMLElement>('[data-s-sync]')
  if (!el) return
  const t = lerUltimaSync()
  if (t) {
    const d = new Date(t)
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    el.innerHTML = `<i class="fa-solid fa-cloud" aria-hidden="true"></i><span>${hora}</span>`
    el.title = `Última sincronização em ${d.toLocaleString('pt-BR')}`
  } else {
    el.innerHTML = '<i class="fa-solid fa-cloud" aria-hidden="true"></i><span>—</span>'
    el.title = 'Ainda não sincronizado'
  }
}

void iniciarAuth().then(() => iniciarSync())

/* ---------- aviso de falha de persistência (quota cheia / storage bloqueado) ---------- */

aoFalharPersistencia((motivo) => notificar(motivo, 'erro'))

/* ---------- baralho (carrega o deck e sorteia as cartas iniciais) ---------- */

void carregarDeck()
  .then((cartas) => registrarDeck(cartas))
  .catch(() => {
    /* deck indisponível — a galeria avisa */
  })

/* ---------- service worker (produção) ---------- */

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}

aplicarTemaInicial()
montarStatusBar()
inscreverSync(atualizarSyncStatus)
atualizarSyncStatus()
montarRota(rotaAtual())
