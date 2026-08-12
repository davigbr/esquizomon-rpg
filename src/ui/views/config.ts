/** Visão Config — tema, jogo, IA, export/import de dados e zona de perigo. */

import type { AppData, ConfigIa, ProviderIA } from '../../core/tipos'
import { MODELOS_POR_PROVIDER, modeloPadrao, testarConexao, ErroIA } from '../../ia/cliente'
import { SYSTEM_PROMPT_PADRAO } from '../../ia/prompt'
import { apagarTodosDados, definirConfiguracao, definirTema, exportarJSON, importarJSON } from '../../stores/app'
import { confirmar } from '../modal'
import { notificar } from '../toast'
import { escapar } from '../util'
import { sessaoAtual } from '../../sync/auth'
import { aposMudancaSessao, inscreverSync, sincronizarAgora } from '../../sync/sync'
import type { EstadoSync } from '../../sync/sync'
import { abrirLoginModal } from '../loginModal'

const IA_PADRAO: ConfigIa = {
  provider: 'nenhum',
  modelo: '',
  apiKey: '',
  systemPrompt: '',
}

function iaAtual(dados: AppData): ConfigIa {
  return dados.configuracao.ia ?? IA_PADRAO
}

export function montarConfig(raiz: HTMLElement, dados: AppData): void {
  const tema = dados.configuracao.tema
  const modoRelaxado = dados.configuracao.modoRelaxado === true
  const resumo = dados.configuracao.resumo ?? ''
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

    <div class="config-secao">
      <h3>Sobre você</h3>
      <p>Um resumo da sua vida — quem você é, o que faz, o que está vivendo. A Fábula usa isso pra te conhecer além do jogo (junto com o seu diário).</p>
      <textarea class="filtro-textarea" data-resumo rows="6" spellcheck="false" placeholder="Conte quem você é, o que está vivendo, o que anda em movimento — a Fábula lê isso pra te conhecer além do jogo.">${escapar(resumo)}</textarea>
      <div class="config-dica">Salva automaticamente ao sair do campo. Quanto mais honesto, melhor ela te acompanha.</div>
    </div>

    ${secaoIA(ia)}

    ${secaoConta()}

    <div class="config-secao">
      <h3>Dados</h3>
      <p>Exporte ou importe tudo em JSON — o backup do seu território.</p>
      <div class="config-acoes">
        <button class="btn" data-exportar><i class="fa-solid fa-download" aria-hidden="true"></i> Exportar (JSON)</button>
        <button class="btn" data-importar><i class="fa-solid fa-upload" aria-hidden="true"></i> Importar</button>
      </div>
      <div class="config-dica config-dica-linha">${total} tarefa${total === 1 ? '' : 's'} · nível <b>${dados.personagem.nivel}</b> · <b>${dados.personagem.cartas.length}</b> cartas desbloqueadas</div>
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

  raiz.querySelector('[data-resumo]')?.addEventListener('change', (e) => {
    const valor = (e.target as HTMLTextAreaElement).value.trim()
    definirConfiguracao({ resumo: valor || undefined })
    notificar(valor ? 'Resumo salvo — a Fábula leu.' : 'Resumo removido.')
  })

  instalarHandlersIA(raiz)

  instalarHandlersConta(raiz)

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
  // Mostra o system prompt: o do usuário OU o canônico (read-only até o usuário editar).
  const promptAtual = ia.systemPrompt || SYSTEM_PROMPT_PADRAO
  const isPadrao = !ia.systemPrompt.trim()

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

      <div class="config-linha config-linha--empilhado">
        <div class="config-rotulo-linha">
          <div>
            <div class="config-rotulo">System prompt da Fábula</div>
            <div class="config-dica">
              ${isPadrao
                ? 'Usando o <strong>prompt canônico</strong> (NARRATIVA.md). Edite pra customizar.'
                : 'Customizado — edite à vontade.'}
            </div>
          </div>
          <button class="btn btn--texto" data-ia-restaurar type="button" title="Volta pro prompt canônico">
            <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Restaurar padrão
          </button>
        </div>
        <textarea class="filtro-textarea filtro-textarea--prompt" data-ia-prompt rows="14" spellcheck="false">${promptAtual.replace(/</g, '&lt;')}</textarea>
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
  const promptEl = raiz.querySelector<HTMLTextAreaElement>('[data-ia-prompt]')
  const restaurarEl = raiz.querySelector<HTMLButtonElement>('[data-ia-restaurar]')
  const testarEl = raiz.querySelector<HTMLButtonElement>('[data-ia-testar]')
  const statusEl = raiz.querySelector<HTMLElement>('[data-ia-status]')

  function lerIa(): ConfigIa {
    return {
      provider: (providerEl?.value as ProviderIA) ?? 'nenhum',
      modelo: modeloEl?.value ?? '',
      apiKey: chaveEl?.value ?? '',
      systemPrompt: promptEl?.value ?? '',
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

  providerEl?.addEventListener('change', () => {
    atualizarModelos()
    salvar()
  })
  modeloEl?.addEventListener('change', salvar)
  chaveEl?.addEventListener('change', salvar)
  promptEl?.addEventListener('change', salvar)

  restaurarEl?.addEventListener('click', async () => {
    if (!promptEl) return
    if (promptEl.value.trim() === SYSTEM_PROMPT_PADRAO) {
      notificar('O prompt já é o padrão.')
      return
    }
    const ok = await confirmar(
      'Restaurar o system prompt canônico da Fábula? Suas edições serão perdidas.',
      'Restaurar padrão',
    )
    if (!ok) return
    promptEl.value = SYSTEM_PROMPT_PADRAO
    salvar()
    notificar('System prompt restaurado.')
  })

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
}

/* ---------- conta e sincronização ---------- */

const ROTULO_ESTADO: Record<EstadoSync, string> = {
  local: 'Offline — dados só neste dispositivo',
  enviando: 'Enviando para a nuvem…',
  sincronizado: 'Sincronizado com a nuvem',
  'sem-conexao': 'Sem conexão — dados locais intactos',
}

/** Seção de conta: aviso honesto sobre dados locais + status da sincronização. */
function secaoConta(): string {
  const sessao = sessaoAtual()
  return `
    <div class="config-secao">
      <h3><i class="fa-solid fa-cloud" aria-hidden="true"></i> Conta e sincronização</h3>
      <p class="config-aviso"><strong>Seus dados moram neste navegador.</strong> Eles sobrevivem a recargas e fechamentos — mas <strong>podem ser perdidos</strong> se você limpar o cache/dados do navegador, usar modo anônimo, trocar de navegador ou de computador. Exportar (JSON) ou criar uma conta são suas garantias.</p>
      <div class="config-linha">
        <div>
          <div class="config-rotulo">Status</div>
          <div class="config-dica" data-sync-status>${ROTULO_ESTADO['local']}</div>
        </div>
        ${sessao ? `<span class="config-rotulo config-conta-email">${escapar(sessao.usuario.email)}</span>` : ''}
      </div>
      <div class="config-acoes">
        ${sessao ? '' : '<button class="btn" data-entrar><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Entrar / criar conta</button>'}
        ${sessao ? '<button class="btn" data-sair-conta><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Sair</button>' : ''}
        <button class="btn" data-sincronizar ${sessao ? '' : 'disabled'} title="${sessao ? 'Envia e puxa os dados agora' : 'Entre para sincronizar'}"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Sincronizar agora</button>
      </div>
    </div>
  `
}

let desinscreverSync: (() => void) | null = null

function instalarHandlersConta(raiz: HTMLElement): void {
  const statusEl = raiz.querySelector<HTMLElement>('[data-sync-status]')

  desinscreverSync?.()
  desinscreverSync = inscreverSync((estado) => {
    if (statusEl) statusEl.textContent = ROTULO_ESTADO[estado]
  })

  raiz.querySelector('[data-entrar]')?.addEventListener('click', () => {
    abrirLoginModal()
  })

  raiz.querySelector('[data-sair-conta]')?.addEventListener('click', async () => {
    const { sair } = await import('../../sync/auth')
    await sair()
    aposMudancaSessao()
    notificar('Sessão encerrada — seus dados seguem neste dispositivo.')
  })

  raiz.querySelector('[data-sincronizar]')?.addEventListener('click', () => {
    void sincronizarAgora()
  })
}
