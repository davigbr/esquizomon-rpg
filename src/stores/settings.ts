/** Settings domain: theme, preferences, import/export and wipe. */

import type { Settings, Theme } from '../core/tipos'
import { initialCharacter } from '../core/jogo'
import { drawInitialIds } from '../core/baralho'
import { wipeAll, normalizeData, saveTheme } from '../db/storage'
import { appStore, addLog } from './base'
import type { Result } from './base'
import { loadedDeck } from './personagem'

/** Resolves the effective theme (sistema → OS prefers-color-scheme) and applies it to <html>. */
export function applyEffectiveTheme(theme: Theme): void {
  const effective =
    theme === 'sistema'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme
  document.documentElement.dataset.theme = effective
}

/* system theme matchMedia — 'sistema' follows the OS in real time */
let themeMql: MediaQueryList | null = null

export function setTheme(theme: Theme): void {
  saveTheme(theme)
  appStore.set({ ...appStore.get(), settings: { ...appStore.get().settings, theme } })
  themeMql?.removeEventListener('change', onSystemPreferenceChange)
  themeMql = null
  if (theme === 'sistema') {
    themeMql = window.matchMedia('(prefers-color-scheme: dark)')
    themeMql.addEventListener('change', onSystemPreferenceChange)
  }
  applyEffectiveTheme(theme)
}

function onSystemPreferenceChange(): void {
  if (appStore.get().settings.theme === 'sistema') applyEffectiveTheme('sistema')
}

export function setSettings(patch: Partial<Settings>): void {
  appStore.set({ ...appStore.get(), settings: { ...appStore.get().settings, ...patch } })
}

/* ---------- import/export ---------- */

export function exportJSON(): string {
  return JSON.stringify(appStore.get(), null, 2)
}

export function importJSON(text: string): Result {
  try {
    const raw = JSON.parse(text)
    if (typeof raw !== 'object' || raw === null || (!Array.isArray(raw.tasks) && !Array.isArray(raw.tarefas))) {
      return { ok: false, reason: 'Arquivo com formato desconhecido.' }
    }
    const normalized = normalizeData(raw)
    if (!normalized) return { ok: false, reason: 'Dados inválidos no arquivo.' }
    appStore.set(normalized)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'Não deu para ler o arquivo (JSON inválido).' }
  }
}

export function wipeAllData(): void {
  wipeAll()
  appStore.set({
    version: appStore.get().version,
    tasks: [],
    character: initialCharacter(),
    settings: appStore.get().settings,
    log: [],
    conversations: [],
    diary: [],
  })
  // the deck already loaded on boot — re-draws the initial cards of the wiped deck
  if (loadedDeck) {
    const initial = drawInitialIds(loadedDeck)
    appStore.set({ ...appStore.get(), character: { ...appStore.get().character, cards: initial } })
  }
  addLog('sistema', 'Dados apagados — novo território')
}
