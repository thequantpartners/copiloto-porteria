/**
 * Corre las preguntas de eval/ejemplo.json contra el servidor (pnpm dev en otra terminal).
 *   pnpm eval:ejemplo
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from '../src/config.ts';

interface Question {
  id: number;
  sesion: string;
  pregunta: string;
  esperado: string;
}

const BASE_URL = process.env.BASE_URL ?? `http://localhost:${config.port}`;
const OPERATOR = 'OP-07';
const run = Date.now();

const questions: Question[] = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'eval', 'ejemplo.json'), 'utf8'));

for (const q of questions) {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Operator-Id': OPERATOR },
    body: JSON.stringify({ session_id: `${q.sesion}-${run}`, message: q.pregunta }),
  });
  const body = await res.json();
  const ms = Date.now() - started;

  console.log(`\n#${q.id} ${q.pregunta}`);
  console.log(`  esperado:     ${q.esperado}`);
  console.log(`  respuesta:    ${body.answer ?? JSON.stringify(body)}`);
  console.log(`  herramientas: ${(body.tool_calls ?? []).map((t: { name: string }) => t.name).join(', ') || '—'}`);
  console.log(`  latencia:     ${ms} ms`);

  await new Promise((r) => setTimeout(r, 1500));
}
