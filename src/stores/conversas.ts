/** AI conversations (Fable) domain. */

import type { Conversation, AiMessage } from '../core/tipos'
import { newId } from '../core/jogo'
import { MAX_CONVERSATIONS } from '../db/storage'
import { appStore } from './base'

function currentConversations(): Conversation[] {
  return appStore.get().conversations ?? []
}

function saveConversations(conversations: Conversation[]): void {
  appStore.set({ ...appStore.get(), conversations })
}

/** Default title of a new conversation: date and time (e.g. "14/08, 21:37"). */
function defaultConversationTitle(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function createConversation(): Conversation {
  const id = newId()
  const now = new Date().toISOString()
  const conversation: Conversation = { id, title: defaultConversationTitle(), messages: [], updatedAt: now }
  saveConversations([conversation, ...currentConversations()].slice(0, MAX_CONVERSATIONS))
  return conversation
}

export function conversationById(id: string): Conversation | undefined {
  return currentConversations().find((c) => c.id === id)
}

export function updateConversation(id: string, patch: Partial<Conversation>): void {
  const conversations = currentConversations()
  const idx = conversations.findIndex((c) => c.id === id)
  if (idx < 0) return
  const updated: Conversation = { ...conversations[idx], ...patch, updatedAt: new Date().toISOString() }
  const next = [...conversations]
  next.splice(idx, 1)
  // Re-orders: most recent on top.
  saveConversations([updated, ...next].slice(0, MAX_CONVERSATIONS))
}

export function addMessage(conversationId: string, msg: AiMessage): void {
  const conversation = conversationById(conversationId)
  if (!conversation) return
  const messages = [...conversation.messages, msg]
  // Title stays as the creation date/time — the first message does NOT
  // override it. Only a manual rename (updateConversation {title}) changes it.
  updateConversation(conversationId, { title: conversation.title, messages })
}

export function deleteConversation(id: string): void {
  const d = appStore.get()
  // tombstone: the sync merge must not re-add a conversation another device
  // still has in the cloud (mirrors deleteTask's deletedTasks).
  const remaining = (d.conversations ?? []).filter((c) => c.id !== id)
  appStore.set({
    ...d,
    conversations: remaining,
    deletedConversations: { ...(d.deletedConversations ?? {}), [id]: new Date().toISOString() },
  })
}
