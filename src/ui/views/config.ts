/** Visão Config — tema, export/import de dados e zona de perigo. */

import type { AppData } from '../../core/tipos'
import { apagarTodosDados, definirConfiguracao, definirTema, exportarJSON, importarJSON } from '../../stores/app'
import { confirmar } from '../modal'
import { notificar } from '../toast'

export function montarConfig(raiz: HTMLElement, dados: AppData): void {
  const tema = dados.configuracao.tema
  const modoRelaxado = dados.configuracao.modoRelaxado === true
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
