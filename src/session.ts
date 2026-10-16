import type { ChatMessage } from './llm/types.ts';

export interface PendingIncident {
  edificio_id: string;
  descripcion: string;
  prioridad: string;
}

export interface Session {
  messages: ChatMessage[];
  pending?: PendingIncident;
}

const MAX_MESSAGES = 30;
const sessions = new Map<string, Session>();

export function getSession(id: string): Session {
  let s = sessions.get(id);
  if (!s) {
    s = { messages: [] };
    sessions.set(id, s);
  }
  return s;
}

export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  const cut = messages.slice(-MAX_MESSAGES);
  // no empezar el historial con una respuesta de herramienta huérfana
  while (cut.length && cut[0].role !== 'user') cut.shift();
  return cut;
}
