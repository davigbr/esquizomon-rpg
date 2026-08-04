/** Visão Config — tema, jogo, export/import de dados e zona de perigo. */

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
