/** Visão Config — tema, jogo, IA, export/import de dados e zona de perigo. */

import type { AppData, ConfigIa, PresetPrompt, ProviderIA } from '../../core/tipos'
import { MODELOS_POR_PROVIDER, modeloPadrao, testarConexao, ErroIA } from '../../ia/cliente'
import { PRESETS } from '../../ia/prompt'
import { apagarTodosDados, definirConfiguracao, definirTema, exportarJSON, importarJSON } from '../../stores/app'
import { confirmar } from '../modal'
import { notificar } from '../toast'

const IA_PADRAO: ConfigIa = {
  provider: 'nenhum',
  modelo: '',
  apiKey: '',
  preset: 'fabula',
  systemPromptCustom: '',
}

function iaAtual(dados: AppData): ConfigIa {
  return dados.configuracao.ia ?? IA_PADRAO
}

export function montarConfig(raiz: HTMLElement, dados: AppData): void {
  const tema = dados.configuracao.tema
  const modoRelaxado = dados.configuracao.modoRelaxado === true
  const ia = iaAtual(dados)
  const total = dados.tarefas.length

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Config</h1>
      <p class="view-sub">Ajustes do app e dos seus dados.</p>
    </header>

    <div class="config-secao">
      <h3>Aparência</h3>
      <p>O tema vale para este dispositivo.</p>
      <div class="config-linha">
        <div>
          <div class="config-rotulo">Tema</div>
          <div class="config-dica">Escuro ou claro</div>
        </div>
        <select class="filtro-select" data-tema>
          <option value="dark" ${tema === 'dark' ? 'selected' : ''}>Escuro</option>
          <option value="light" ${tema === 'light' ? 'selected' : ''}>Claro</option>
        </select>
      </div>
    </div>

    <div class="config-secao">
      <h3>Jogo</h3>
      <p>O modo relaxado desliga todo dano — recorrentes perdidas e hábitos negativos não machucam o personagem.</p>
      <div class="config-linha">
        <div>
          <div class="config-rotulo">Modo relaxado</div>
          <div class="config-dica">Jogo sem punição — só bônus</div>
        </div>
        <select class="filtro-select" data-modo-relaxado>
          <option value="off" ${!modoRelaxado ? 'selected' : ''}>Desligado</option>
          <option value="on" ${modoRelaxado ? 'selected' : ''}>Ligado</option>
        </select>
      </div>
    </div>

    ${secaoIA(ia)}

    <div class="config-secao">
      <h3>Dados</h3>
      <p>Exporte ou importe tudo em JSON — o backup do seu território.</p>
      <div class="config-acoes">
        <button class="btn" data-exportar><i class="fa-solid fa-download" aria-hidden="true"></i> Exportar (JSON)</button>
        <button class="btn" data-importar><i class="fa-solid fa-upload" aria-hidden="true"></i> Importar</button>
      </div>
      <div class="config-dica config-dica-linha">${total} tarefa${total === 1 ? '' : 's'} · nível ${dados.personagem.nivel} · ${dados.personagem.cartas.length} cartas desbloqueadas</div>
    </div>

    <div class="config-secao">
      <h3>Zona de perigo</h3>
      <p>Apaga todas as tarefas e o progresso do personagem deste dispositivo.</p>
      <div class="config-acoes">
        <button class="btn btn--perigo" data-apagar><i class="fa-solid fa-trash" aria-hidden="true"></i> Apagar tudo</button>
      </div>
    </div>
  `

  raiz.querySelector('[data-tema]')!.addEventListener('change', (e) => {
    const valor = (e.target as HTMLSelectElement).value as 'dark' | 'light'
    definirTema(valor)
  })

  raiz.querySelector('[data-modo-relaxado]')!.addEventListener('change', (e) => {
    const valor = (e.target as HTMLSelectElement).value === 'on'
    definirConfiguracao({ modoRelaxado: valor })
    notificar(valor ? 'Modo relaxado ligado — sem dano.' : 'Modo relaxado desligado.')
  })

  instalarHandlersIA(raiz)

  raiz.querySelector('[data-exportar]')!.addEventListener('click', () => {
    const json = exportarJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `esquizomon-rpg-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    notificar('Dados exportados.')
  })

  raiz.querySelector('[data-importar]')!.addEventListener('click', () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.addEventListener('change', () => {
      const arquivo = input.files?.[0]
      if (!arquivo) return
      const leitor = new FileReader()
      leitor.onload = () => {
        const resultado = importarJSON(String(leitor.result ?? ''))
        notificar(resultado.ok ? 'Dados importados.' : resultado.motivo ?? 'Falha na importação.', resultado.ok ? 'ok' : 'erro')
      }
      leitor.readAsText(arquivo)
    })
    input.click()
  })

  raiz.querySelector('[data-apagar]')!.addEventListener('click', () => {
    void confirmar('Apagar todas as tarefas e o personagem? Isso não pode ser desfeito.', 'Apagar tudo').then((ok) => {
      if (ok) {
        apagarTodosDados()
        notificar('Tudo apagado.')
      }
    })
  })
}

function secaoIA(ia: ConfigIa): string {
  const providerOptions: Array<[ProviderIA, string]> = [
    ['nenhum', 'Desligado (sem IA)'],
    ['deepseek', 'DeepSeek'],
    ['opencode', 'OpenCode Zen Go'],
  ]
  const provider = ia.provider
  const modelos = MODELOS_POR_PROVIDER[provider] ?? []
  const presetOptions = Object.entries(PRESETS)
    .map(([k, v]) => `<option value="${k}" ${ia.preset === k ? 'selected' : ''}>${v.nome}</option>`)
    .join('')

  return `
    <div class="config-secao">
      <h3><i class="fa-solid fa-feather" aria-hidden="true"></i> Fábula (IA)</h3>
      <p>BYOK: a chave fica só no seu dispositivo. O provedor é contactado direto (sem servidor intermediário guardando dados). DeepSeek e OpenCode têm raciocínio visível no chat.</p>

      <div class="config-linha">
        <div>
          <div class="config-rotulo">Provider</div>
          <div class="config-dica">Quem vai responder</div>
        </div>
        <select class="filtro-select" data-ia-provider>
          ${providerOptions.map(([v, l]) => `<option value="${v}" ${provider === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>

      <div class="config-linha">
        <div>
          <div class="config-rotulo">Modelo</div>
          <div class="config-dica">Vazio = ${provider !== 'nenhum' ? modeloPadrao(provider) : 'escolha um provider'}</div>
        </div>
        <select class="filtro-select" data-ia-modelo ${provider === 'nenhum' ? 'disabled' : ''}>
          <option value="" ${ia.modelo === '' ? 'selected' : ''}>(padrão)</option>
          ${modelos.map((m) => `<option value="${m}" ${ia.modelo === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>

      <div class="config-linha config-linha--empilhado">
        <div>
          <div class="config-rotulo">Chave de API</div>
          <div class="config-dica">${provider === 'opencode'
            ? 'Vem de <code>OPENCODE_GO_ESQUIZOMONRPG_TOKEN</code> se setada no ambiente.'
            : 'Só você vê. Não sai do seu dispositivo.'}</div>
        </div>
        <input type="password" class="filtro-input" data-ia-chave autocomplete="off" spellcheck="false" placeholder="sk-..." value="${ia.apiKey.replace(/"/g, '&quot;')}" ${provider === 'nenhum' ? 'disabled' : ''} />
      </div>

      <div class="config-linha">
        <div>
          <div class="config-rotulo">Personalidade</div>
          <div class="config-dica">Como a Fábula vai falar com você</div>
        </div>
        <select class="filtro-select" data-ia-preset>
          ${presetOptions}
        </select>
      </div>

      <div class="config-linha config-linha--empilhado" data-ia-custom-wrap ${ia.preset === 'custom' ? '' : 'hidden'}>
        <div>
          <div class="config-rotulo">System prompt customizado</div>
          <div class="config-dica">Texto enviado como system message. O estado do app é anexado depois.</div>
        </div>
        <textarea class="filtro-textarea" data-ia-custom rows="6" placeholder="Você é...&#10;Regras:...">${ia.systemPromptCustom.replace(/</g, '&lt;')}</textarea>
      </div>

      <div class="config-acoes">
        <button class="btn" data-ia-testar ${provider === 'nenhum' ? 'disabled' : ''}><i class="fa-solid fa-plug" aria-hidden="true"></i> Testar conexão</button>
        <span class="config-dica" data-ia-status></span>
      </div>
    </div>
  `
}

function instalarHandlersIA(raiz: HTMLElement): void {
  const providerEl = raiz.querySelector<HTMLSelectElement>('[data-ia-provider]')
  const modeloEl = raiz.querySelector<HTMLSelectElement>('[data-ia-modelo]')
  const chaveEl = raiz.querySelector<HTMLInputElement>('[data-ia-chave]')
  const presetEl = raiz.querySelector<HTMLSelectElement>('[data-ia-preset]')
  const customEl = raiz.querySelector<HTMLTextAreaElement>('[data-ia-custom]')
  const customWrap = raiz.querySelector<HTMLElement>('[data-ia-custom-wrap]')
  const testarEl = raiz.querySelector<HTMLButtonElement>('[data-ia-testar]')
  const statusEl = raiz.querySelector<HTMLElement>('[data-ia-status]')

  function lerIa(): ConfigIa {
    return {
      provider: (providerEl?.value as ProviderIA) ?? 'nenhum',
      modelo: modeloEl?.value ?? '',
      apiKey: chaveEl?.value ?? '',
      preset: (presetEl?.value as PresetPrompt) ?? 'fabula',
      systemPromptCustom: customEl?.value ?? '',
    }
  }

  function salvar(): void {
    definirConfiguracao({ ia: lerIa() })
  }

  function atualizarModelos(): void {
    if (!modeloEl) return
    const provider = (providerEl?.value as ProviderIA) ?? 'nenhum'
    const modelos = MODELOS_POR_PROVIDER[provider] ?? []
    const atual = modeloEl.value
    modeloEl.innerHTML =
      `<option value="" ${atual === '' ? 'selected' : ''}>(padrão)</option>` +
      modelos.map((m) => `<option value="${m}" ${atual === m ? 'selected' : ''}>${m}</option>`).join('')
    modeloEl.disabled = provider === 'nenhum'
    if (chaveEl) chaveEl.disabled = provider === 'nenhum'
    if (testarEl) testarEl.disabled = provider === 'nenhum'
  }

  function atualizarCustom(): void {
    if (!customWrap || !presetEl) return
    customWrap.hidden = presetEl.value !== 'custom'
  }

  providerEl?.addEventListener('change', () => {
    atualizarModelos()
    salvar()
  })
  modeloEl?.addEventListener('change', salvar)
  chaveEl?.addEventListener('change', salvar)
  presetEl?.addEventListener('change', () => {
    atualizarCustom()
    salvar()
  })
  customEl?.addEventListener('change', salvar)

  testarEl?.addEventListener('click', async () => {
    const ia = lerIa()
    if (ia.provider === 'nenhum' || !ia.apiKey.trim()) {
      notificar('Escolha um provider e informe a chave.', 'erro')
      return
    }
    if (statusEl) {
      statusEl.textContent = 'Testando…'
      testarEl!.disabled = true
    }
    try {
      const resp = await testarConexao(ia)
      if (statusEl) statusEl.textContent = `OK — respondeu: "${resp.slice(0, 30)}"`
      notificar('Conexão ok.', 'ok')
    } catch (err) {
      const msg = err instanceof ErroIA ? err.message : String(err)
      if (statusEl) statusEl.textContent = `Falhou: ${msg.slice(0, 50)}`
      notificar(`Falhou: ${msg}`, 'erro')
    } finally {
      if (testarEl) testarEl.disabled = false
    }
  })

  atualizarModelos()
  atualizarCustom()
}
