import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DATA_DIR } from './data.ts';
import { getEmbedder } from './llm/index.ts';

const MIN_SCORE = 0.3;
const TOP_K = 4;

export interface IndexedChunk {
  id: string;
  doc_id: string;
  title: string;
  section: string;
  text: string;
  embedding: number[];
}

export interface Hit extends Omit<IndexedChunk, 'embedding'> {
  score: number;
}

let index: IndexedChunk[] | undefined;

function loadIndex(): IndexedChunk[] {
  if (!index) {
    const file = join(DATA_DIR, 'index.json');
    if (!existsSync(file)) throw new Error('No existe data/index.json. Corre `pnpm index`.');
    index = JSON.parse(readFileSync(file, 'utf8')).chunks as IndexedChunk[];
  }
  return index;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function search(query: string): Promise<Hit[]> {
  const chunks = loadIndex();
  const [q] = await getEmbedder().embed([query]);

  return chunks
    .map(({ embedding, ...chunk }) => ({ ...chunk, score: cosine(q, embedding) }))
    .filter((h) => h.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}
