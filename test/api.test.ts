import assert from 'node:assert/strict';
import { test } from 'node:test';

import { app } from '../src/app.ts';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  app.request('/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('sin X-Operator-Id responde 401', async () => {
  const res = await post({ session_id: 's1', message: 'hola' });
  assert.equal(res.status, 401);
});

test('un body sin message responde 400', async () => {
  const res = await post({ session_id: 's1' }, { 'X-Operator-Id': 'OP-07' });
  assert.equal(res.status, 400);
});

test('health responde ok', async () => {
  const res = await app.request('/health');
  assert.deepEqual(await res.json(), { ok: true });
});
