/** Bootstrap — router por hash, tema, nav e registro do service worker. */

import './style.css'

import { appStore, definirTema, renovarDia } from './stores/app'
import { montarHoje } from './ui/views/hoje'
import { montarTarefas } from './ui/views/tarefas'
import { montarHabitos } from './ui/views/habitos'
import { montarConfig } from './ui/views/config'
import { storageGet } from './db/storage'
import type { Tema } from './core/tipos'

const raiz = document.getElementById('app')!
const navLinks = document.querySelectorAll<HTMLAnchorElement>('[data-rota]')

type Rota = 'hoje' | 'tarefas' | 'habitos' | 'config'

function rotaAtual(): Rota {
  const hash = location.hash.replace(/^#\/?/, '')
  if (hash === 'tarefas' || hash === 'habitos' || hash === 'config') return hash
  return 'hoje'
}

function montarRota(rota: Rota): void {
  const dados = appStore.get()
  switch (rota) {
    case 'hoje':
      montarHoje(raiz, dados)
      break
    case 'tarefas':
      montarTarefas(raiz, dados)
      break
    case 'habitos':
      montarHabitos(raiz, dados)
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
  definirTema(atual === 'dark' ? 'light' : 'dark')
})

/* ---------- router ---------- */

window.addEventListener('hashchange', () => montarRota(rotaAtual()))

/* re-render na troca de estado, mantendo a rota atual */
appStore.subscribe(() => montarRota(rotaAtual()))

/* ---------- dia novo ---------- */

renovarDia()

/* ---------- service worker (produção) ---------- */

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}

aplicarTemaInicial()
montarRota(rotaAtual())
