import { loadBuildings } from './data.ts';
import { getLlm } from './llm/index.ts';
import type { ChatMessage } from './llm/types.ts';
import { buildSystemPrompt } from './prompt.ts';
import { search } from './retrieval.ts';
import { getSession, trimHistory } from './session.ts';
import { saveIncident } from './tools/incidents.ts';
import { runTool, TOOL_SPECS } from './tools/index.ts';

const MAX_ROUNDS = 4;
const CONFIRMATION = /^\s*(s[ií]|ok|dale|confirm)/i;
const REJECTION = /^\s*(no|cancel|olvid|descarta|rechaz)/i;

export interface TurnInput {
  operatorId: string;
  sessionId: string;
  message: string;
}

export interface TurnResult {
  answer: string;
  sources: { doc_id: string; section: string }[];
  tool_calls: { name: string; args: Record<string, unknown>; ok: boolean }[];
  pending_confirmation: { action: 'registrar_incidencia'; args: Record<string, unknown> } | null;
}

export async function handleTurn({ operatorId, sessionId, message }: TurnInput): Promise<TurnResult> {
  const session = getSession(sessionId);
  const toolCalls: TurnResult['tool_calls'] = [];

  // Gestión de incidencia pendiente de confirmación
  if (session.pending) {
    if (CONFIRMATION.test(message)) {
      const args = session.pending;
      const incident = saveIncident(args, operatorId);
      session.pending = undefined;
      toolCalls.push({ name: 'registrar_incidencia', args: { ...args, confirmado: true }, ok: true });
      const answer = `Listo, registré la incidencia ${incident.id} en ${args.edificio_id} con prioridad ${args.prioridad}.`;
      session.messages.push({ role: 'user', content: message }, { role: 'assistant', content: answer });
      return { answer, sources: [], tool_calls: toolCalls, pending_confirmation: null };
    }

    if (REJECTION.test(message)) {
      session.pending = undefined;
      const answer = 'Entendido, cancelé el registro de la incidencia.';
      session.messages.push({ role: 'user', content: message }, { role: 'assistant', content: answer });
      return { answer, sources: [], tool_calls: [], pending_confirmation: null };
    }

    // Si cambió de tema, se limpia la incidencia pendiente antes de continuar
    session.pending = undefined;
  }

  // Búsqueda RAG filtrada estrictamente por vigencia y alcance RBAC
  const hits = await search(message, operatorId);
  const system = buildSystemPrompt(operatorId, loadBuildings(), hits);
  const messages: ChatMessage[] = [...session.messages, { role: 'user', content: message }];

  let answer = '';
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await getLlm().chat({ system, messages, tools: TOOL_SPECS });
    messages.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls, providerData: res.providerData });

    if (res.toolCalls.length === 0) {
      answer = res.text;
      break;
    }

    for (const call of res.toolCalls) {
      const { ok, output } = runTool(call, { operatorId });
      toolCalls.push({ name: call.name, args: call.args, ok });

      if (call.name === 'registrar_incidencia' && (output as { pendiente?: boolean }).pendiente) {
        const { edificio_id, descripcion, prioridad } = call.args as Record<string, string>;
        session.pending = { edificio_id, descripcion, prioridad };
      }

      messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: JSON.stringify(output) });
    }
  }

  if (!answer) answer = 'No pude completar la consulta. Intenta reformularla.';
  session.messages = trimHistory(messages);

  return {
    answer,
    sources: hits.map((h) => ({ doc_id: h.doc_id, section: h.section })),
    tool_calls: toolCalls,
    pending_confirmation: session.pending ? { action: 'registrar_incidencia', args: { ...session.pending } } : null,
  };
}

