/** Modal de check-in estilo Habitica — aparece no 1º acesso do dia quando há
 *  tarefas de ontem pendentes. O usuário marca quais quer concluir
 *  retroativamente; o dano diário só incide nas que ficarem sem marcação. */

import { abrirModal, fecharModal } from './modal'
import { appStore, checkinPendente, concluirCheckin, pularCheckin } from '../stores/app'
import { escapar } from './util'
import { dataPorExtenso, xpDe } from '../core/jogo'
import type { Dificuldade } from '../core/tipos'

const ROTULO_DIFICULDADE: Record<Dificuldade, string> = {
  facil: 'Fácil',
  media: 'Média',
  dificil: 'Difícil',
  extrema: 'Extrema',
}

/** Exibe o modal de check-in se houver pendências de ontem. */
export function verificarCheckin(): void {
  const pend = checkinPendente
  if (!pend || pend.ids.length === 0) return

  const tarefas = appStore.get().tarefas.filter((t) => pend.ids.includes(t.id))
  if (tarefas.length === 0) return

  const itens = tarefas
    .map(
      (t) => `
      <label class="checkin-item">
        <input type="checkbox" class="checkin-check" data-checkin-id="${escapar(t.id)}" checked />
        <span class="checkin-info">
          <span class="checkin-titulo">${escapar(t.titulo)}</span>
          <span class="checkin-meta">${t.tipo === 'unica' ? 'Tarefa' : 'Recorrente'} · ${ROTULO_DIFICULDADE[t.dificuldade]} · +${xpDe(t.dificuldade)} XP</span>
        </span>
      </label>`,
    )
    .join('')

  abrirModal(`
    <h2 class="checkin-titulo-modal">Check-in de ontem</h2>
    <p class="checkin-sub">Você não marcou estas tarefas em <strong>${escapar(dataPorExtenso(pend.data))}</strong>. Marque as que você fez — as que ficarem sem marcação contarão como perdidas.</p>
    <div class="checkin-lista">${itens}</div>
    <div class="form-acoes">
      <button class="btn" data-checkin-pular>Pular</button>
      <button class="btn btn-primary" data-checkin-confirmar>Fazer check-in</button>
    </div>
  `)

  const marcar = (): string[] =>
    Array.from(modalBody().querySelectorAll<HTMLInputElement>('.checkin-check:checked')).map((i) => i.dataset.checkinId ?? '').filter(Boolean)

  modalBody().querySelector<HTMLButtonElement>('[data-checkin-confirmar]')?.addEventListener('click', () => {
    const ids = marcar()
    fecharModal()
    concluirCheckin(ids)
  })
  modalBody().querySelector<HTMLButtonElement>('[data-checkin-pular]')?.addEventListener('click', () => {
    fecharModal()
    pularCheckin()
  })
}

function modalBody(): HTMLElement {
  return document.getElementById('modal-body')!
}
