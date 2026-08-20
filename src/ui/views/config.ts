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
      <h1>Config</h1>
      <p class="view-sub">Ajustes do app e dos seus dados.</p>
    </header>

    <div class="settings-section">
      <h3>Avatar</h3>
      <div class="avatar-block">
        <div class="avatar-current" title="Seu avatar">
          ${avatar ? `<img src="${escapeHtml(avatar)}" alt="Seu avatar" />` : '<i class="fa-solid fa-user" aria-hidden="true"></i>'}
        </div>
        <div class="settings-actions-row">
          <button class="btn" data-avatar-escolher>Escolher imagem</button>
          ${avatar ? '<button class="btn" data-avatar-remover>Remover</button>' : ''}
        </div>
        <div class="settings-field-row">
          <label class="settings-label" for="nome-monstruoso">Nome monstruoso</label>
          <input id="nome-monstruoso" class="field" data-nome-monstruoso value="${escapeHtml(data.character.monsterName ?? '')}" placeholder="Ex.: Devorador de Segundas" maxlength="40" />
          <p class="settings-hint">Aparece em negrito ao lado do seu avatar (não é exibido no celular).</p>
        </div>
        <p class="settings-hint">Corte sempre circular · comprimido · salvo junto aos dados · exibido ao lado do nível.</p>
      </div>
      <input type="file" accept="image/*" data-avatar-arquivo hidden />
    </div>

    <div class="settings-section">
      <h3>Aparência</h3>
      <p>O tema vale para este dispositivo.</p>
      <div class="settings-row">
        <div>
          <div class="settings-label">Tema</div>
          <div class="settings-hint">Sistema segue o padrão do dispositivo</div>
        </div>
        <select class="filter-select" data-tema>
          <option value="sistema" ${theme === 'sistema' ? 'selected' : ''}>Sistema</option>
          <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Escuro</option>
          <option value="light" ${theme === 'light' ? 'selected' : ''}>Claro</option>
        </select>
      </div>
    </div>

    <div class="settings-section">
      <h3>Jogo</h3>
      <p>O modo relaxado desliga todo dano — recorrentes perdidas e hábitos negativos não machucam o personagem.</p>
      <div class="settings-row">
        <div>
          <div class="settings-label">Modo relaxado</div>
          <div class="settings-hint">Jogo sem punição — só bônus</div>
        </div>
        <select class="filter-select" data-modo-relaxado>
          <option value="off" ${!relaxedMode ? 'selected' : ''}>Desligado</option>
          <option value="on" ${relaxedMode ? 'selected' : ''}>Ligado</option>
        </select>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-label">Efeitos sonoros</div>
          <div class="settings-hint">Tique ao marcar · hábito + sobe, hábito − desce · fanfarra ao subir de nível · som sombrio na invocação · acorde na análise</div>
        </div>
        <select class="filter-select" data-sons>
          <option value="on" ${sound !== false ? 'selected' : ''}>Ligados</option>
          <option value="off" ${sound === false ? 'selected' : ''}>Desligados</option>
        </select>
      </div>
    </div>

    <div class="settings-section">
      <h3>Sobre você</h3>
      <p>Um resumo da sua vida — quem você é, o que faz, o que está vivendo. A Fábula usa isso pra te conhecer além do jogo (junto com o seu diário).</p>
      <textarea class="filter-textarea" data-resumo rows="6" spellcheck="false" placeholder="Conte quem você é, o que está vivendo, o que anda em movimento — a Fábula lê isso pra te conhecer além do jogo.">${escapeHtml(summary)}</textarea>
      <div class="settings-hint">Salva automaticamente ao sair do campo. Quanto mais honesto, melhor ela te acompanha.</div>
    </div>

    ${aiSection(ai)}

    ${accountSection()}

    <div class="settings-section">
      <h3>Dados</h3>
      <p>Exporte ou importe tudo em JSON — o backup do seu território.</p>
      <div class="settings-actions">
        <button class="btn" data-exportar><i class="fa-solid fa-download" aria-hidden="true"></i> Exportar (JSON)</button>
        <button class="btn" data-importar><i class="fa-solid fa-upload" aria-hidden="true"></i> Importar</button>
        <button class="btn" data-rerolar-cartas title="Re-sorteia todas as cartas desbloqueadas"><i class="fa-solid fa-dice" aria-hidden="true"></i> Rerolar baralho</button>
      </div>
      <div class="settings-hint settings-hint-row">${total} tarefa${total === 1 ? '' : 's'} · nível <b>${data.character.level}</b> · <b>${data.character.cards.length}</b> cartas desbloqueadas</div>
      <div class="settings-hint settings-hint-row backup-title">Backups automáticos (criados antes de cada sincronização que altera dados):</div>
      <div class="settings-backups" data-backups></div>
    </div>

    <div class="settings-section">
      <h3>Zona de perigo</h3>
      <p>Apaga todas as tarefas e o progresso do personagem deste dispositivo.</p>
      <div class="settings-actions">
        <button class="btn btn--perigo" data-apagar><i class="fa-solid fa-trash" aria-hidden="true"></i> Apagar tudo</button>
      </div>
    </div>
  `

  root.querySelector('[data-tema]')!.addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value as Theme
    setTheme(value)
  })

  root.querySelector('[data-modo-relaxado]')!.addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value === 'on'
    setSettings({ relaxedMode: value })
    notify(value ? 'Modo relaxado ligado — sem dano.' : 'Modo relaxado desligado.')
  })

  root.querySelector('[data-sons]')!.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLSelectElement).value === 'on'
    setSettings({ sound: enabled })
    notify(enabled ? 'Efeitos sonoros ligados.' : 'Efeitos sonoros desligados.')
  })

  // avatar: choose file → crop editor; remove with confirmation
  const avatarFile = root.querySelector<HTMLInputElement>('[data-avatar-arquivo]')
  root.querySelector('[data-avatar-escolher]')?.addEventListener('click', () => avatarFile?.click())
  avatarFile?.addEventListener('change', () => {
    const file = avatarFile.files?.[0]
    if (file) {
      editAvatar(file)
      avatarFile.value = ''
    }
  })
  root.querySelector('[data-avatar-remover]')?.addEventListener('click', () => {
    void confirm('Remover seu avatar?', 'Remover').then((ok) => {
      if (ok) {
        setAvatar(null)
        notify('Avatar removido.')
      }
    })
  })
  // monster name: saves on blur
  root.querySelector<HTMLInputElement>('[data-nome-monstruoso]')?.addEventListener('change', (e) => {
    setMonsterName((e.target as HTMLInputElement).value)
  })

  root.querySelector('[data-resumo]')?.addEventListener('change', (e) => {
    const value = (e.target as HTMLTextAreaElement).value.trim()
    setSettings({ summary: value || undefined })
    notify(value ? 'Resumo salvo — a Fábula leu.' : 'Resumo removido.')
  })

  installAIHandlers(root)

  installAccountHandlers(root)

  root.querySelector('[data-exportar]')!.addEventListener('click', () => {
    const json = exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `esquizomon-rpg-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    notify('Dados exportados.')
  })

  root.querySelector('[data-importar]')!.addEventListener('click', () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const result = importJSON(String(reader.result ?? ''))
        notify(result.ok ? 'Dados importados.' : result.reason ?? 'Falha na importação.', result.ok ? 'ok' : 'erro')
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
      backupsArea.innerHTML = '<div class="settings-hint">Nenhum backup automático ainda — o app cria um antes de cada sincronização que altera os dados.</div>'
      return
    }
    backupsArea.innerHTML = list
      .map((b) => {
        const d = new Date(b.ts)
        const readable = Number.isNaN(d.getTime()) ? b.ts : d.toLocaleString('pt-BR')
        return `<div class="settings-backup"><span>${readable}</span><button class="btn btn--small" data-restaurar="${escapeHtml(b.ts)}">Restaurar</button></div>`
      })
      .join('')
    backupsArea.querySelectorAll<HTMLButtonElement>('[data-restaurar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ts = btn.dataset.restaurar
        void confirm('Restaurar substitui os dados atuais deste dispositivo pelos do backup escolhido. Continuar?', 'Restaurar backup').then((ok) => {
          if (!ok || !ts) return
          const restored = restoreBackup(ts)
          notify(restored ? 'Backup restaurado.' : 'Não foi possível restaurar este backup.', restored ? 'ok' : 'erro')
        })
      })
    })
  }
  renderBackups()

  root.querySelector<HTMLButtonElement>('[data-rerolar-cartas]')?.addEventListener('click', () => {
    void confirm(
      'Rerolar re-sorteia TODAS as cartas desbloqueadas, mantendo a mesma quantidade e respeitando as chances (monstros 6×, capturas 2×, alianças 1×). A coleção atual será substituída. Continuar?',
      'Rerolar baralho',
    ).then((ok) => {
      if (!ok) return
      const result = rerollDeck()
      notify(`Baralho rerolado: ${result.before} cartas re-sorteadas.`)
    })
  })

  root.querySelector('[data-apagar]')!.addEventListener('click', () => {
    void confirm('Apagar todas as tarefas e o personagem? Isso não pode ser desfeito.', 'Apagar tudo').then((ok) => {
      if (ok) {
        wipeAllData()
        notify('Tudo apagado.')
      }
    })
  })
}

function aiSection(ai: AiConfig): string {
  const providerOptions: Array<[AiProvider, string]> = [
    ['nenhum', 'Desligado (sem IA)'],
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
      <h3><i class="fa-solid fa-feather" aria-hidden="true"></i> Fábula (IA)</h3>
      <p>BYOK: a chave fica só no seu dispositivo. O provedor é contactado direto (sem servidor intermediário guardando dados). DeepSeek e OpenCode têm raciocínio visível no chat.</p>

      <div class="settings-row">
        <div>
          <div class="settings-label">Provider</div>
          <div class="settings-hint">Quem vai responder</div>
        </div>
        <select class="filter-select" data-ia-provider>
          ${providerOptions.map(([v, l]) => `<option value="${v}" ${provider === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>

      <div class="settings-row">
        <div>
          <div class="settings-label">Modelo</div>
          <div class="settings-hint">Vazio = ${provider !== 'nenhum' ? defaultModel(provider) : 'escolha um provider'}</div>
        </div>
        <select class="filter-select" data-ia-modelo ${provider === 'nenhum' ? 'disabled' : ''}>
          <option value="" ${ai.model === '' ? 'selected' : ''}>(padrão)</option>
          ${models.map((m) => `<option value="${m}" ${ai.model === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>

      <div class="settings-row settings-row--stacked">
        <div>
          <div class="settings-label">Chave de API</div>
          <div class="settings-hint">${provider === 'opencode'
            ? 'Vem de <code>OPENCODE_GO_ESQUIZOMONRPG_TOKEN</code> se setada no ambiente.'
            : 'Só você vê. Não sai do seu dispositivo.'}</div>
        </div>
        <input type="password" class="filter-input" data-ia-chave autocomplete="off" spellcheck="false" placeholder="sk-..." value="${ai.apiKey.replace(/"/g, '&quot;')}" ${provider === 'nenhum' ? 'disabled' : ''} />
      </div>

      <div class="settings-row settings-row--stacked">
        <div class="settings-label-row">
          <div>
            <div class="settings-label">System prompt da Fábula</div>
            <div class="settings-hint">
              ${isDefault
                ? 'Usando o <strong>prompt canônico</strong> (NARRATIVA.md). Edite pra customizar.'
                : 'Customizado — edite à vontade.'}
            </div>
          </div>
          <button class="btn btn--text" data-ia-restaurar type="button" title="Volta pro prompt canônico">
            <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Restaurar padrão
          </button>
        </div>
        <textarea class="filter-textarea filter-textarea--prompt" data-ia-prompt rows="14" spellcheck="false">${currentPrompt.replace(/</g, '&lt;')}</textarea>
      </div>

      <div class="settings-actions">
        <button class="btn" data-ia-testar ${provider === 'nenhum' ? 'disabled' : ''}><i class="fa-solid fa-plug" aria-hidden="true"></i> Testar conexão</button>
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
  const restoreEl = root.querySelector<HTMLButtonElement>('[data-ia-restaurar]')
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
      `<option value="" ${current === '' ? 'selected' : ''}>(padrão)</option>` +
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
      notify('O prompt já é o padrão.')
      return
    }
    const ok = await confirm(
      'Restaurar o system prompt canônico da Fábula? Suas edições serão perdidas.',
      'Restaurar padrão',
    )
    if (!ok) return
    promptEl.value = DEFAULT_SYSTEM_PROMPT
    save()
    notify('System prompt restaurado.')
  })

  testEl?.addEventListener('click', async () => {
    const ai = readAI()
    if (ai.provider === 'nenhum' || !ai.apiKey.trim()) {
      notify('Escolha um provider e informe a chave.', 'erro')
      return
    }
    if (statusEl) {
      statusEl.textContent = 'Testando…'
      testEl!.disabled = true
    }
    try {
      const resp = await testConnection(ai)
      if (statusEl) statusEl.textContent = `OK — respondeu: "${resp.slice(0, 30)}"`
      notify('Conexão ok.', 'ok')
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
  local: 'Offline — dados só neste dispositivo',
  enviando: 'Enviando para a nuvem…',
  sincronizado: 'Sincronizado com a nuvem',
  'sem-conexao': 'Sem conexão — dados locais intactos',
}

/** Account section: honest warning about local data + sync status. */
function accountSection(): string {
  const session = currentSession()
  return `
    <div class="settings-section">
      <h3><i class="fa-solid fa-cloud" aria-hidden="true"></i> Conta e sincronização</h3>
      <p class="settings-notice"><strong>Seus dados moram neste navegador.</strong> Eles sobrevivem a recargas e fechamentos — mas <strong>podem ser perdidos</strong> se você limpar o cache/dados do navegador, usar modo anônimo, trocar de navegador ou de computador. Exportar (JSON) ou criar uma conta são suas garantias.</p>
      <div class="settings-row">
        <div>
          <div class="settings-label">Status</div>
          <div class="settings-hint" data-sync-status>${STATE_LABEL['local']}</div>
        </div>
        ${session ? `<span class="settings-label settings-account-email">${escapeHtml(session.user.email)}</span>` : ''}
      </div>
      <div class="settings-actions">
        ${session ? '' : '<button class="btn" data-entrar><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Entrar / criar conta</button>'}
        ${session ? '<button class="btn" data-sair-conta><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Sair</button>' : ''}
        <button class="btn" data-sincronizar ${session ? '' : 'disabled'} title="${session ? 'Envia e puxa os dados agora' : 'Entre para sincronizar'}"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Sincronizar agora</button>
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

  root.querySelector('[data-entrar]')?.addEventListener('click', () => {
    openLoginModal()
  })

  root.querySelector('[data-sair-conta]')?.addEventListener('click', async () => {
    const { logout } = await import('../../sync/auth')
    await logout()
    onSessionChange()
    notify('Sessão encerrada — seus dados seguem neste dispositivo.')
  })

  root.querySelector('[data-sincronizar]')?.addEventListener('click', () => {
    void syncNow()
  })
}
