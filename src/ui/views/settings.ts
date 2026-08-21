/** Config view — theme, game, AI, data export/import and the danger zone. */

import type { AiConfig, AiProvider, AppData, Theme } from '../../core/tipos'
import { defaultModel, MODELS_BY_PROVIDER, testConnection, AiError } from '../../ia/cliente'
import { DEFAULT_SYSTEM_PROMPT } from '../../ia/prompt'
import { exportJSON, importJSON, setAvatar, setMonsterName, setSettings, setTheme, wipeAllData } from '../../stores/app'
import { rerollDeck } from '../../stores/personagem'
import { confirm } from '../modal'
import { notify } from '../toast'
import { escapeHtml } from '../util'
import { editAvatar } from '../avatarEditor'
import { currentSession } from '../../sync/auth'
import { getBackups, onSessionChange, restoreBackup, subscribeSync, syncNow } from '../../sync/sync'
import type { SyncState } from '../../sync/sync'
import { openLoginModal } from '../loginModal'
import { getLang, setLang, t } from '../../i18n'

const DEFAULT_AI: AiConfig = {
  provider: 'nenhum',
  model: '',
  apiKey: '',
  systemPrompt: '',
}

function currentAI(data: AppData): AiConfig {
  return data.settings.ai ?? DEFAULT_AI
}

export function mountSettings(root: HTMLElement, data: AppData): void {
  const theme = data.settings.theme
  const relaxedMode = data.settings.relaxedMode === true
  const sound = data.settings.sound !== false
  const summary = data.settings.summary ?? ''
  const avatar = data.character.avatar
  const ai = currentAI(data)
  const total = data.tasks.length

  root.innerHTML = `
    <header class="view-header">
      <h1>${t('config.titulo')}</h1>
      <p class="view-sub">${t('config.sub')}</p>
    </header>

    <div class="settings-section">
      <h3>${t('config.avatar')}</h3>
      <div class="avatar-block">
        <div class="avatar-current" title="${t('config.seuAvatar')}">
          ${avatar ? `<img src="${escapeHtml(avatar)}" alt="Seu avatar" />` : '<i class="fa-solid fa-user" aria-hidden="true"></i>'}
        </div>
        <div class="settings-actions-row">
          <button class="btn" data-avatar-choose>${t('config.escolherImagem')}</button>
          ${avatar ? '<button class="btn" data-avatar-remove>Remover</button>' : ''}
        </div>
        <div class="settings-field-row">
          <label class="settings-label" for="nome-monstruoso">${t('config.nomeMonstruoso')}</label>
          <input id="nome-monstruoso" class="field" data-monster-name value="${escapeHtml(data.character.monsterName ?? '')}" placeholder="${t('config.exNomeMonstruoso')}" maxlength="40" />
          <p class="settings-hint">${t('config.hintNomeMonstruoso')}</p>
        </div>
        <p class="settings-hint">${t('config.hintAvatar')}</p>
      </div>
      <input type="file" accept="image/*" data-avatar-arquivo hidden />
    </div>

    <div class="settings-section">
      <h3>${t('config.aparencia')}</h3>
      <p>${t('config.temaVale')}</p>
      <div class="settings-row">
        <div>
          <div class="settings-label">${t('config.tema')}</div>
          <div class="settings-hint">${t('config.temaHint')}</div>
        </div>
        <select class="filter-select" data-tema>
          <option value="sistema" ${theme === 'sistema' ? 'selected' : ''}>${t('config.sistema')}</option>
          <option value="dark" ${theme === 'dark' ? 'selected' : ''}>${t('config.escuro')}</option>
          <option value="light" ${theme === 'light' ? 'selected' : ''}>${t('config.claro')}</option>
        </select>
      </div>
    </div>

    <div class="settings-section">
      <h3>${t('config.idioma')}</h3>
      <p>${t('config.idiomaVale')}</p>
      <div class="settings-row">
        <div>
          <div class="settings-label">${t('config.idioma')}</div>
          <div class="settings-hint">${t('config.idiomaHint')}</div>
        </div>
        <select class="filter-select" data-lang-select>
          <option value="pt" ${getLang() === 'pt' ? 'selected' : ''}>${t('config.portugues')}</option>
          <option value="en" ${getLang() === 'en' ? 'selected' : ''}>${t('config.english')}</option>
        </select>
      </div>
    </div>

    <div class="settings-section">
      <h3>${t('config.jogo')}</h3>
      <p>${t('config.modoRelaxadoSub')}</p>
      <div class="settings-row">
        <div>
          <div class="settings-label">${t('config.modoRelaxado')}</div>
          <div class="settings-hint">${t('config.modoRelaxadoHint')}</div>
        </div>
        <select class="filter-select" data-relaxed-mode>
          <option value="off" ${!relaxedMode ? 'selected' : ''}>${t('config.desligado')}</option>
          <option value="on" ${relaxedMode ? 'selected' : ''}>${t('config.ligado')}</option>
        </select>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-label">${t('config.efeitosSonoros')}</div>
          <div class="settings-hint">${t('config.sonsHint')}</div>
        </div>
        <select class="filter-select" data-sons>
          <option value="on" ${sound !== false ? 'selected' : ''}>${t('config.ligados')}</option>
          <option value="off" ${sound === false ? 'selected' : ''}>${t('config.desligados')}</option>
        </select>
      </div>
    </div>

    <div class="settings-section">
      <h3>${t('config.sobreVoce')}</h3>
      <p>${t('config.resumoSub')}</p>
      <textarea class="filter-textarea" data-resumo rows="6" spellcheck="false" placeholder="${t('config.resumoPlaceholder')}">${escapeHtml(summary)}</textarea>
      <div class="settings-hint">${t('config.resumoHint')}</div>
    </div>

    ${aiSection(ai)}

    ${accountSection()}

    <div class="settings-section">
      <h3>${t('config.dados')}</h3>
      <p>${t('config.dadosSub')}</p>
      <div class="settings-actions">
        <button class="btn" data-export><i class="fa-solid fa-download" aria-hidden="true"></i> ${t('config.exportar')}</button>
        <button class="btn" data-import><i class="fa-solid fa-upload" aria-hidden="true"></i> ${t('config.importar')}</button>
        <button class="btn" data-reshuffle-cards title="${t('config.rerolarTitle')}"><i class="fa-solid fa-dice" aria-hidden="true"></i> ${t('config.rerolar')}</button>
      </div>
      <div class="settings-hint settings-hint-row">${total} tarefa${total === 1 ? '' : 's'} · nível <b>${data.character.level}</b> · <b>${data.character.cards.length}</b> cartas desbloqueadas</div>
      <div class="settings-hint settings-hint-row backup-title">${t('config.backupsTitle')}</div>
      <div class="settings-backups" data-backups></div>
    </div>

    <div class="settings-section">
      <h3>${t('config.zonaPerigo')}</h3>
      <p>${t('config.zonaPerigoSub')}</p>
      <div class="settings-actions">
        <button class="btn btn--perigo" data-forget><i class="fa-solid fa-trash" aria-hidden="true"></i> ${t('config.apagarTudo')}</button>
      </div>
    </div>
  `

  root.querySelector('[data-tema]')!.addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value as Theme
    setTheme(value)
  })

  root.querySelector('[data-relaxed-mode]')!.addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value === 'on'
    setSettings({ relaxedMode: value })
    notify(value ? t('config.relaxadoOn') : t('config.relaxadoOff'))
  })

  root.querySelector('[data-sons]')!.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLSelectElement).value === 'on'
    setSettings({ sound: enabled })
    notify(enabled ? t('config.sonsOn') : t('config.sonsOff'))
  })

  root.querySelector('[data-lang-select]')!.addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value === 'en' ? 'en' : 'pt'
    setLang(value)
  })

  // avatar: choose file → crop editor; remove with confirmation
  const avatarFile = root.querySelector<HTMLInputElement>('[data-avatar-arquivo]')
  root.querySelector('[data-avatar-choose]')?.addEventListener('click', () => avatarFile?.click())
  avatarFile?.addEventListener('change', () => {
    const file = avatarFile.files?.[0]
    if (file) {
      editAvatar(file)
      avatarFile.value = ''
    }
  })
  root.querySelector('[data-avatar-remove]')?.addEventListener('click', () => {
    void confirm(t('config.confirmarRemoverAvatar'), t('config.remover')).then((ok) => {
      if (ok) {
        setAvatar(null)
        notify(t('config.avatarRemovido'))
      }
    })
  })
  // monster name: saves on blur
  root.querySelector<HTMLInputElement>('[data-monster-name]')?.addEventListener('change', (e) => {
    setMonsterName((e.target as HTMLInputElement).value)
  })

  root.querySelector('[data-resumo]')?.addEventListener('change', (e) => {
    const value = (e.target as HTMLTextAreaElement).value.trim()
    setSettings({ summary: value || undefined })
    notify(value ? t('config.resumoSalvo') : t('config.resumoRemovido'))
  })

  installAIHandlers(root)

  installAccountHandlers(root)

  root.querySelector('[data-export]')!.addEventListener('click', () => {
    const json = exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `esquizomon-rpg-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    notify(t('config.dadosExportados'))
  })

  root.querySelector('[data-import]')!.addEventListener('click', () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const result = importJSON(String(reader.result ?? ''))
        notify(result.ok ? t('config.dadosImportados') : (result.reason ?? t('config.importFalhou')), result.ok ? 'ok' : 'erro')
      }
      reader.readAsText(file)
    })
    input.click()
  })

  const backupsArea = root.querySelector('[data-backups]')

  function renderBackups(): void {
    if (!backupsArea) return
    const list = getBackups()
    if (list.length === 0) {
      backupsArea.innerHTML = `<div class="settings-hint">${t('config.semBackups')}</div>`
      return
    }
    backupsArea.innerHTML = list
      .map((b) => {
        const d = new Date(b.ts)
        const readable = Number.isNaN(d.getTime()) ? b.ts : d.toLocaleString('pt-BR')
        return `<div class="settings-backup"><span>${readable}</span><button class="btn btn--small" data-restore="${escapeHtml(b.ts)}">Restaurar</button></div>`
      })
      .join('')
    backupsArea.querySelectorAll<HTMLButtonElement>('[data-restore]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ts = btn.dataset.restore
        void confirm(t('config.confirmarRestaurar'), t('config.restaurarBackup')).then((ok) => {
          if (!ok || !ts) return
          const restored = restoreBackup(ts)
          notify(restored ? t('config.backupRestaurado') : t('config.backupFalhou'), restored ? 'ok' : 'erro')
        })
      })
    })
  }
  renderBackups()

  root.querySelector<HTMLButtonElement>('[data-reshuffle-cards]')?.addEventListener('click', () => {
    void confirm(
      'Rerolar re-sorteia TODAS as cartas desbloqueadas, mantendo a mesma quantidade e respeitando as chances (monstros 6×, capturas 2×, alianças 1×). A coleção atual será substituída. Continuar?',
      t('config.rerolar'),
    ).then((ok) => {
      if (!ok) return
      const result = rerollDeck()
      notify(t('config.baralhoRerolado', { n: result.before }))
    })
  })

  root.querySelector('[data-forget]')!.addEventListener('click', () => {
    void confirm(t('config.confirmarApagarTudo'), t('config.apagarTudo')).then((ok) => {
      if (ok) {
        wipeAllData()
        notify(t('config.tudoApagado'))
      }
    })
  })
}

function aiSection(ai: AiConfig): string {
  const providerOptions: Array<[AiProvider, string]> = [
    ['nenhum', t('config.iaDesligado')],
    ['deepseek', 'DeepSeek'],
    ['opencode', 'OpenCode Zen Go'],
  ]
  const provider = ai.provider
  const models = MODELS_BY_PROVIDER[provider] ?? []
  // Shows the system prompt: the user's OR the canonical one (read-only until the user edits).
  const currentPrompt = ai.systemPrompt || DEFAULT_SYSTEM_PROMPT
  const isDefault = !ai.systemPrompt.trim()

  return `
    <div class="settings-section">
      <h3><i class="fa-solid fa-feather" aria-hidden="true"></i> ${t('settings.fabula')}</h3>
      <p>${t('settings.byok')}</p>

      <div class="settings-row">
        <div>
          <div class="settings-label">Provider</div>
          <div class="settings-hint">${t('config.quemResponde')}</div>
        </div>
        <select class="filter-select" data-ia-provider>
          ${providerOptions.map(([v, l]) => `<option value="${v}" ${provider === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>

      <div class="settings-row">
        <div>
          <div class="settings-label">${t('config.modelo')}</div>
          <div class="settings-hint">Vazio = ${provider !== 'nenhum' ? defaultModel(provider) : t('config.escolhaProviderModelo')}</div>
        </div>
        <select class="filter-select" data-ia-modelo ${provider === 'nenhum' ? 'disabled' : ''}>
          <option value="" ${ai.model === '' ? 'selected' : ''}>${t('config.padrao')}</option>
          ${models.map((m) => `<option value="${m}" ${ai.model === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>

      <div class="settings-row settings-row--stacked">
        <div>
          <div class="settings-label">${t('config.chaveApi')}</div>
          <div class="settings-hint">${provider === 'opencode'
            ? 'Vem de <code>OPENCODE_GO_ESQUIZOMONRPG_TOKEN</code> se setada no ambiente.'
            : t('config.soVoceVe')}</div>
        </div>
        <input type="password" class="filter-input" data-ia-chave autocomplete="off" spellcheck="false" placeholder="sk-..." value="${ai.apiKey.replace(/"/g, '&quot;')}" ${provider === 'nenhum' ? 'disabled' : ''} />
      </div>

      <div class="settings-row settings-row--stacked">
        <div class="settings-label-row">
          <div>
            <div class="settings-label">${t('config.systemPrompt')}</div>
            <div class="settings-hint">
              ${isDefault
                ? t('config.usaPromptCanonico')
                : 'Customizado — edite à vontade.'}
            </div>
          </div>
          <button class="btn btn--text" data-ai-restore type="button" title="${t('config.voltaPrompt')}">
            <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> ${t('config.restaurarPadrao')}
          </button>
        </div>
        <textarea class="filter-textarea filter-textarea--prompt" data-ia-prompt rows="14" spellcheck="false">${currentPrompt.replace(/</g, '&lt;')}</textarea>
      </div>

      <div class="settings-actions">
        <button class="btn" data-ia-testar ${provider === 'nenhum' ? 'disabled' : ''}><i class="fa-solid fa-plug" aria-hidden="true"></i> ${t('config.testarConexao')}</button>
        <span class="settings-hint" data-ia-status></span>
      </div>
    </div>
  `
}

function installAIHandlers(root: HTMLElement): void {
  const providerEl = root.querySelector<HTMLSelectElement>('[data-ia-provider]')
  const modelEl = root.querySelector<HTMLSelectElement>('[data-ia-modelo]')
  const keyEl = root.querySelector<HTMLInputElement>('[data-ia-chave]')
  const promptEl = root.querySelector<HTMLTextAreaElement>('[data-ia-prompt]')
  const restoreEl = root.querySelector<HTMLButtonElement>('[data-ai-restore]')
  const testEl = root.querySelector<HTMLButtonElement>('[data-ia-testar]')
  const statusEl = root.querySelector<HTMLElement>('[data-ia-status]')

  function readAI(): AiConfig {
    return {
      provider: (providerEl?.value as AiProvider) ?? 'nenhum',
      model: modelEl?.value ?? '',
      apiKey: keyEl?.value ?? '',
      systemPrompt: promptEl?.value ?? '',
    }
  }

  function save(): void {
    setSettings({ ai: readAI() })
  }

  function refreshModels(): void {
    if (!modelEl) return
    const provider = (providerEl?.value as AiProvider) ?? 'nenhum'
    const models = MODELS_BY_PROVIDER[provider] ?? []
    const current = modelEl.value
    modelEl.innerHTML =
      `<option value="" ${current === '' ? 'selected' : ''}>${t('config.padrao')}</option>` +
      models.map((m) => `<option value="${m}" ${current === m ? 'selected' : ''}>${m}</option>`).join('')
    modelEl.disabled = provider === 'nenhum'
    if (keyEl) keyEl.disabled = provider === 'nenhum'
    if (testEl) testEl.disabled = provider === 'nenhum'
  }

  providerEl?.addEventListener('change', () => {
    refreshModels()
    save()
  })
  modelEl?.addEventListener('change', save)
  keyEl?.addEventListener('change', save)
  promptEl?.addEventListener('change', save)

  restoreEl?.addEventListener('click', async () => {
    if (!promptEl) return
    if (promptEl.value.trim() === DEFAULT_SYSTEM_PROMPT) {
      notify(t('config.promptJaPadrao'))
      return
    }
    const ok = await confirm(
      'Restaurar o system prompt canônico da Fábula? Suas edições serão perdidas.',
      t('config.restaurarPadrao'),
    )
    if (!ok) return
    promptEl.value = DEFAULT_SYSTEM_PROMPT
    save()
    notify(t('config.promptRestaurado'))
  })

  testEl?.addEventListener('click', async () => {
    const ai = readAI()
    if (ai.provider === 'nenhum' || !ai.apiKey.trim()) {
      notify(t('config.escolhaProvider'), 'erro')
      return
    }
    if (statusEl) {
      statusEl.textContent = t('config.testando')
      testEl!.disabled = true
    }
    try {
      const resp = await testConnection(ai)
      if (statusEl) statusEl.textContent = `OK — respondeu: "${resp.slice(0, 30)}"`
      notify(t('config.conexaoOk'), 'ok')
    } catch (err) {
      const msg = err instanceof AiError ? err.message : String(err)
      if (statusEl) statusEl.textContent = `Falhou: ${msg.slice(0, 50)}`
      notify(`Falhou: ${msg}`, 'erro')
    } finally {
      if (testEl) testEl.disabled = false
    }
  })

  refreshModels()
}

/* ---------- account and sync ---------- */

const STATE_LABEL: Record<SyncState, string> = {
  local: t('config.sync.local'),
  enviando: t('config.sync.enviando'),
  sincronizado: t('config.sync.sincronizado'),
  'sem-conexao': t('config.sync.semConexao'),
}

/** Account section: honest warning about local data + sync status. */
function accountSection(): string {
  const session = currentSession()
  return `
    <div class="settings-section">
      <h3><i class="fa-solid fa-cloud" aria-hidden="true"></i> Conta e sincronização</h3>
      <p class="settings-notice">${t('config.sync.notice')}</p>
      <div class="settings-row">
        <div>
          <div class="settings-label">Status</div>
          <div class="settings-hint" data-sync-status>${STATE_LABEL['local']}</div>
        </div>
        ${session ? `<span class="settings-label settings-account-email">${escapeHtml(session.user.email)}</span>` : ''}
      </div>
      <div class="settings-actions">
        ${session ? '' : `<button class="btn" data-login><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> ${t('config.sync.entrarConta')}</button>`}
        ${session ? `<button class="btn" data-logout-account><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> ${t('config.sync.sair')}</button>` : ''}
        <button class="btn" data-syncnow ${session ? '' : 'disabled'} title="${session ? t('config.sync.enviaAgora') : t('config.sync.entre')}"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> ${t('config.sync.sincronizar')}</button>
      </div>
    </div>
  `
}

let unsubscribeSync: (() => void) | null = null

function installAccountHandlers(root: HTMLElement): void {
  const statusEl = root.querySelector<HTMLElement>('[data-sync-status]')

  unsubscribeSync?.()
  unsubscribeSync = subscribeSync((state) => {
    if (statusEl) statusEl.textContent = STATE_LABEL[state]
  })

  root.querySelector('[data-login]')?.addEventListener('click', () => {
    openLoginModal()
  })

  root.querySelector('[data-logout-account]')?.addEventListener('click', async () => {
    const { logout } = await import('../../sync/auth')
    await logout()
    onSessionChange()
    notify(t('config.sessaoEncerrada'))
  })

  root.querySelector('[data-syncnow]')?.addEventListener('click', () => {
    void syncNow()
  })
}
