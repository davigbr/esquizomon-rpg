/** Bootstrap — router por hash, tema, nav e registro do service worker. */

import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import './style.css'

import { appStore, definirTema, renovarDia } from './stores/app'
import { montarHoje } from './ui/views/hoje'
import { montarFicha } from './ui/views/ficha'
import { montarConfig } from './ui/views/config'
import { alternarChat, montarChat } from './ui/chat'
import { storageGet } from './db/storage'
import type { Tema } from './core/tipos'

const raiz = document.getElementById('app')!
const navLinks = document.querySelectorAll<HTMLAnchorElement>('[data-rota]')

type Rota = 'hoje' | 'ficha' | 'config'

function rotaAtual(): Rota {
  const hash = location.hash.replace(/^#\/?/, '')
  if (hash === 'ficha' || hash === 'config') return hash
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

document.getElementById('fabula-toggle')!.addEventListener('click', () => alternarChat())

document.getElementById('theme-toggle')!.addEventListener('click', () => {
  const atual = appStore.get().configuracao.tema
  const proximo = atual === 'dark' ? 'light' : 'dark'
  definirTema(proximo)
  const icone = document.querySelector('#theme-toggle i')
  if (icone) icone.className = `fa-solid ${proximo === 'dark' ? 'fa-moon' : 'fa-sun'}`
})

/* ---------- router ---------- */

window.addEventListener('hashchange', () => montarRota(rotaAtual()))

/* re-render na troca de estado, mantendo a rota atual */
appStore.subscribe(() => montarRota(rotaAtual()))

/* ---------- dia novo ---------- */

renovarDia()

/* ---------- chat da Fábula ---------- */

montarChat()

/* ---------- service worker (produção) ---------- */

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}

aplicarTemaInicial()
montarRota(rotaAtual())
