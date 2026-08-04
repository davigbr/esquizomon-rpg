/** Bootstrap — router por hash, tema, nav e registro do service worker. */

import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import './style.css'

import { appStore, definirTema, registrarDeck, renovarDia } from './stores/app'
import { montarHoje } from './ui/views/hoje'
import { montarFicha } from './ui/views/ficha'
import { montarCartas } from './ui/views/cartas'
import { montarConfig } from './ui/views/config'
import { carregarDeck } from './core/baralho'
import { storageGet } from './db/storage'
import type { Tema } from './core/tipos'

const raiz = document.getElementById('app')!
const navLinks = document.querySelectorAll<HTMLAnchorElement>('[data-rota]')

type Rota = 'hoje' | 'ficha' | 'cartas' | 'config'

function rotaAtual(): Rota {
  const hash = location.hash.replace(/^#\/?/, '')
  if (hash === 'ficha' || hash === 'cartas' || hash === 'config') return hash
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
    case 'config':
      montarConfig(raiz, dados)
      break
  }
  navLinks.forEach((a) => a.classList.toggle('ativo', a.dataset.rota === rota))
}

/* ---------- tema ---------- */

function aplicarTemaInicial(): void {
  const tema = (storageGet('esquizomon-rpg:tema') as Tema | null) ?? 'dark'
  definirTema(tema)
}

document.getElementById('theme-toggle')!.addEventListener('click', () => {
  const atual = appStore.get().configuracao.tema
  const proximo = atual === 'dark' ? 'light' : 'dark'
  definirTema(proximo)
  const icone = document.querySelector('#theme-toggle i')
  if (icone) icone.className = `fa-solid ${proximo === 'dark' ? 'fa-moon' : 'fa-sun'}`
})

/* ---------- barra de status (nível, XP, mana — fixa em todas as telas) ---------- */

const statusBar = document.getElementById('status-bar')!

function montarStatusBar(): void {
  const p = appStore.get().personagem
  const pctXp = Math.min(100, Math.round((p.xp / p.xpProximo) * 100))
  const pctMana = Math.round((p.mana / p.manaMax) * 100)
  const esgotado = p.esgotado
  statusBar.innerHTML = `
    <div class="status-item status-item--nivel" title="Nível">
      <i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i>
      <span>Nv ${p.nivel}</span>
    </div>
    <div class="status-item status-item--xp" title="Experiência ${p.xp}/${p.xpProximo}">
      <i class="fa-solid fa-star" aria-hidden="true"></i>
      <span>XP ${p.xp}/${p.xpProximo}</span>
      <div class="status-trilho"><div class="status-preenchimento status-preenchimento--xp" style="width:${pctXp}%"></div></div>
    </div>
    <div class="status-item status-item--mana" title="Mana ${p.mana}/${p.manaMax}">
      <i class="fa-solid fa-droplet" aria-hidden="true"></i>
      <span>Mana ${p.mana}/${p.manaMax}</span>
      <div class="status-trilho"><div class="status-preenchimento status-preenchimento--mana" style="width:${pctMana}%"></div></div>
    </div>
    ${esgotado ? '<div class="status-item status-item--esgotado" title="Esgotado"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Esgotado</span></div>' : ''}
  `
}

/* ---------- router ---------- */

window.addEventListener('hashchange', () => montarRota(rotaAtual()))

/* re-render na troca de estado, mantendo a rota atual */
appStore.subscribe(() => {
  montarStatusBar()
  montarRota(rotaAtual())
})

/* ---------- dia novo ---------- */

renovarDia()

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
montarRota(rotaAtual())
