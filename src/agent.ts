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

async function classifyIntent(message: string): Promise<string> {
  const res = await getLlm().chat({
    system:
      'Clasifica la intención del mensaje del operador. Responde con una sola palabra: consulta, documentos, incidencia u otro.',
    messages: [{ role: 'user', content: message }],
  });
  return res.text.trim().toLowerCase();
}

export async function handleTurn({ operatorId, sessionId, message }: TurnInput): Promise<TurnResult> {
  const session = getSession(sessionId);
  const toolCalls: TurnResult['tool_calls'] = [];

  // El operador confirma la incidencia que el copiloto propuso antes.
  if (session.pending && CONFIRMATION.test(message)) {
    const args = session.pending;
    const incident = saveIncident(args, operatorId);
    session.pending = undefined;
    toolCalls.push({ name: 'registrar_incidencia', args: { ...args, confirmado: true }, ok: true });
    const answer = `Listo, registré la incidencia ${incident.id} en ${args.edificio_id} con prioridad ${args.prioridad}.`;
    session.messages.push({ role: 'user', content: message }, { role: 'assistant', content: answer });
    return { answer, sources: [], tool_calls: toolCalls, pending_confirmation: null };
  }

  const intent = await classifyIntent(message);
  console.log(JSON.stringify({ event: 'intent', sessionId, intent }));
  // TODO: usar la intención para decidir si hace falta buscar en documentos

  const hits = await search(message);
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
