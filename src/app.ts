import { Hono } from 'hono';
import { z } from 'zod';

import { handleTurn } from './agent.ts';
import { resolveOperator } from './operator.ts';

const ChatBody = z.object({
  session_id: z.string().min(1),
  message: z.string().min(1).max(2000),
});

export const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));

app.post('/chat', async (c) => {
  const started = Date.now();
  const body = ChatBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Body inválido: se espera { session_id, message }' }, 400);

  const header = c.req.header('X-Operator-Id');
  if (!header) return c.json({ error: 'Falta el header X-Operator-Id' }, 401);

  const operatorId = resolveOperator(header, body.data.message);
  if (!operatorId) return c.json({ error: 'Operador no identificado' }, 401);

  try {
    const result = await handleTurn({ operatorId, sessionId: body.data.session_id, message: body.data.message });
    console.log(JSON.stringify({ event: 'chat', operatorId, sessionId: body.data.session_id, ms: Date.now() - started }));
    return c.json(result);
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Error interno' }, 500);
  }
});
