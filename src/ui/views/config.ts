/** Visão Config — tema, IA (Fábula), export/import de dados e zona de perigo. */

import type { AppData, ProviderIA } from '../../core/tipos'
import { apagarTodosDados, definirConfiguracao, definirTema, exportarJSON, importarJSON } from '../../stores/app'
import { confirmar } from '../modal'
import { notificar } from '../toast'
import { escapar } from '../formTarefa'
import { testarConexao, ErroIA } from '../../ia/cliente'

/** Mundos fantásticos (NARRATIVA.md §5). */
const MUNDOS = [
  'O Império e a Célula',
  'O Grimório',
  'O Bestiário (a Coalizão dos Monstros)',
  'A Ferrovia',
  'O Jardim do Fim do Mundo',
  'A Expedição ao Continente',
  'O Clube da Meia-Noite',
] as const

export function montarConfig(raiz: HTMLElement, dados: AppData): void {
  const tema = dados.configuracao.tema
  const modoRelaxado = dados.configuracao.modoRelaxado === true
  const provider = dados.configuracao.ia?.provider ?? 'nenhum'
  const modelo = dados.configuracao.ia?.modelo ?? ''
  const apiKey = dados.configuracao.ia?.apiKey ?? ''
  const mundo = dados.configuracao.ia?.mundo ?? ''
  const total = dados.tarefas.length

  raiz.innerHTML = `
    <header class="view-header">
      <h1>Config</h1>
      <p class="view-sub">Aparência e seus dados.</p>
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
      <h3>Fábula (IA)</h3>
      <p>A Cronista conversa com você e lê o contexto do app. Traga sua própria chave (BYOK) — ela fica só neste dispositivo.</p>
      <div class="config-linha">
        <div>
          <div class="config-rotulo">Provider</div>
          <div class="config-dica">Gemini funciona direto; os demais usam o proxy local (npm run serve-ia)</div>
        </div>
        <select class="filtro-select" data-ia-provider>
          <option value="nenhum" ${provider === 'nenhum' ? 'selected' : ''}>Nenhum</option>
          <option value="gemini" ${provider === 'gemini' ? 'selected' : ''}>Gemini (Google)</option>
          <option value="opencode" ${provider === 'opencode' ? 'selected' : ''}>opencode (Zen Go)</option>
          <option value="openai" ${provider === 'openai' ? 'selected' : ''}>OpenAI</option>
          <option value="deepseek" ${provider === 'deepseek' ? 'selected' : ''}>DeepSeek</option>
        </select>
      </div>
      <div class="config-linha">
        <div>
          <div class="config-rotulo">Modelo</div>
          <div class="config-dica">Em branco usa o padrão do provider</div>
        </div>
        <input class="campo config-campo-curto" data-ia-modelo value="${escapar(modelo)}" placeholder="ex.: deepseek-v4-flash" />
      </div>
      <div class="config-linha">
        <div>
          <div class="config-rotulo">Chave de API</div>
          <div class="config-dica">Nunca sai do seu dispositivo</div>
        </div>
        <input class="campo config-campo-curto" data-ia-chave type="password" value="${escapar(apiKey)}" placeholder="sk-…" />
      </div>
      <div class="config-linha">
        <div>
          <div class="config-rotulo">Mundo fantástico</div>
          <div class="config-dica">Como Fábula narra a sua vida (ver NARRATIVA.md)</div>
        </div>
        <select class="filtro-select" data-ia-mundo>
          <option value="">Sem mundo (voz padrão)</option>
          ${MUNDOS.map((m) => `<option value="${escapar(m)}" ${mundo === m ? 'selected' : ''}>${escapar(m)}</option>`).join('')}
        </select>
      </div>
      <div class="config-acoes">
        <button class="btn" data-ia-salvar><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Salvar</button>
        <button class="btn" data-ia-testar><i class="fa-solid fa-plug" aria-hidden="true"></i> Testar</button>
      </div>
    </div>

    <div class="config-secao">
      <h3>Dados</h3>
      <p>${total} tarefa${total === 1 ? '' : 's'} salvas neste dispositivo. Exporte para fazer backup ou levar para outro aparelho; importe para restaurar.</p>
      <div class="view-actions" style="margin-bottom:0">
        <button class="btn" data-exportar>⬇ Exportar (JSON)</button>
        <button class="btn" data-importar>⬆ Importar</button>
        <input type="file" accept="application/json,.json" hidden data-importar-arquivo />
      </div>
    </div>

    <div class="config-secao config-perigo">
      <h3>Zona de perigo</h3>
      <p>Apaga todas as tarefas deste dispositivo. Não dá para desfazer.</p>
      <div class="view-actions" style="margin-bottom:0">
        <button class="btn btn-perigo" data-apagar>Apagar tudo</button>
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

  /* ---------- IA (Fábula) ---------- */
  const inputProvider = raiz.querySelector('[data-ia-provider]') as HTMLSelectElement
  const inputModelo = raiz.querySelector('[data-ia-modelo]') as HTMLInputElement
  const inputChave = raiz.querySelector('[data-ia-chave]') as HTMLInputElement
  const inputMundo = raiz.querySelector('[data-ia-mundo]') as HTMLSelectElement

  function lerIA() {
    return {
      provider: inputProvider.value as ProviderIA,
      modelo: inputModelo.value.trim(),
      apiKey: inputChave.value.trim(),
      mundo: inputMundo.value || undefined,
    }
  }

  raiz.querySelector('[data-ia-salvar]')!.addEventListener('click', () => {
    definirConfiguracao({ ia: lerIA() })
    notificar('Configuração da Fábula salva.')
  })

  raiz.querySelector('[data-ia-testar]')!.addEventListener('click', async (e) => {
    const btn = e.target as HTMLButtonElement
    btn.disabled = true
    try {
      const resp = await testarConexao(lerIA())
      notificar(resp.trim() ? `Conectado! Resposta: ${resp.trim().slice(0, 60)}` : 'Conectado!', 'ok')
    } catch (err) {
      notificar(err instanceof ErroIA ? err.message : 'Falha ao testar a conexão.', 'erro')
    } finally {
      btn.disabled = false
    }
  })

  raiz.querySelector('[data-exportar]')!.addEventListener('click', () => {
    const json = exportarJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `esquizomon-rpg-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    notificar('Backup exportado.')
  })

  const inputArquivo = raiz.querySelector<HTMLInputElement>('[data-importar-arquivo]')!
  raiz.querySelector('[data-importar]')!.addEventListener('click', () => inputArquivo.click())
  inputArquivo.addEventListener('change', () => {
    const arquivo = inputArquivo.files?.[0]
    if (!arquivo) return
    void arquivo.text().then((texto) => {
      const resultado = importarJSON(texto)
      if (resultado.ok) notificar('Dados importados.')
      else notificar(resultado.motivo ?? 'Não deu para importar.', 'erro')
    })
    inputArquivo.value = ''
  })

  raiz.querySelector('[data-apagar]')!.addEventListener('click', () => {
    void confirmar('Apagar TODAS as tarefas deste dispositivo?', 'Apagar tudo').then((ok) => {
      if (ok) {
        apagarTodosDados()
        notificar('Tudo apagado.')
      }
    })
  })
}
