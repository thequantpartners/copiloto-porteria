/**
 * Genera data/index.json con los embeddings de cada sección de data/docs.
 *   pnpm index
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from '../src/config.ts';
import { DATA_DIR, loadDocChunks } from '../src/data.ts';
import { getEmbedder } from '../src/llm/index.ts';

const BATCH = 50;

const chunks = loadDocChunks();
const embeddings: number[][] = [];

for (let i = 0; i < chunks.length; i += BATCH) {
  const batch = chunks.slice(i, i + BATCH);
  const texts = batch.map((c) => `${c.title}\n${c.section}\n${c.text}`);
  embeddings.push(...(await getEmbedder().embed(texts)));
  console.log(`${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
}

const index = {
  model: config.gemini.embedModel,
  created_at: new Date().toISOString(),
  chunks: chunks.map((c, i) => ({
    id: c.id,
    doc_id: c.doc_id,
    title: c.title,
    section: c.section,
    text: c.text,
    embedding: embeddings[i].map((v) => Math.round(v * 1e5) / 1e5),
  })),
};

writeFileSync(join(DATA_DIR, 'index.json'), JSON.stringify(index));
console.log(`Índice con ${chunks.length} fragmentos en data/index.json`);
