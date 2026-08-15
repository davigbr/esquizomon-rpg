/** Domínio das conversas com a IA (Fábula). */

import type { Conversa, MensagemIA } from '../core/tipos'
import { novoId } from '../core/jogo'
import { MAX_CONVERSAS } from '../db/storage'
import { appStore } from './base'

function conversasAtuais(): Conversa[] {
  return appStore.get().conversas ?? []
}

function salvarConversas(conversas: Conversa[]): void {
  appStore.set({ ...appStore.get(), conversas })
}

/** Título padrão de conversa nova: data e hora (ex.: "14/08, 21:37"). */
function tituloPadraoConversa(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function criarConversa(): Conversa {
  const id = novoId()
  const agora = new Date().toISOString()
  const conversa: Conversa = { id, titulo: tituloPadraoConversa(), mensagens: [], atualizadaEm: agora }
  salvarConversas([conversa, ...conversasAtuais()].slice(0, MAX_CONVERSAS))
  return conversa
}

export function conversaPorId(id: string): Conversa | undefined {
  return conversasAtuais().find((c) => c.id === id)
}

export function atualizarConversa(id: string, patch: Partial<Conversa>): void {
  const conversas = conversasAtuais()
  const idx = conversas.findIndex((c) => c.id === id)
  if (idx < 0) return
  const atualizada: Conversa = { ...conversas[idx], ...patch, atualizadaEm: new Date().toISOString() }
  const proximas = [...conversas]
  proximas.splice(idx, 1)
  // Re-ordena: mais recente no topo.
  salvarConversas([atualizada, ...proximas].slice(0, MAX_CONVERSAS))
}

export function adicionarMensagem(conversaId: string, msg: MensagemIA): void {
  const conversa = conversaPorId(conversaId)
  if (!conversa) return
  const mensagens = [...conversa.mensagens, msg]
  // Primeira mensagem do usuário vira o título (3-5 palavras).
  let titulo = conversa.titulo
  if (conversa.mensagens.length === 0 && msg.role === 'user') {
    titulo = msg.content
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 5)
      .join(' ')
      .slice(0, 60)
    if (!titulo) titulo = 'Conversa'
  }
  atualizarConversa(conversaId, { titulo, mensagens })
}

export function excluirConversa(id: string): void {
  salvarConversas(conversasAtuais().filter((c) => c.id !== id))
}
