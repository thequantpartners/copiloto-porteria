import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { config } from './config.ts';
import { DATA_DIR, loadBuildings, loadDocChunks } from './data.ts';
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
  meta?: Record<string, string>;
}

export interface Hit extends Omit<IndexedChunk, 'embedding'> {
  score: number;
}

let index: IndexedChunk[] | undefined;

export function sanitizeChunkText(text: string): string {
  return text
    .replace(/\[\s*(?:NOTA|Actualizaci[oó]n|ACTUALIZACI[OÓ]N|INSTRUCCI[OÓ]N|Instrucci[oó]n|AVISO)[\s\S]*?\]/gi, '')
    .replace(/\[[\s\S]*?(?:sistema|instrucci[oó]n|ignora|actualizaci[oó]n)[\s\S]*?\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function loadIndex(): IndexedChunk[] {
  if (!index) {
    const file = join(DATA_DIR, 'index.json');
    if (!existsSync(file)) throw new Error('No existe data/index.json. Corre `pnpm index`.');
    const rawChunks = JSON.parse(readFileSync(file, 'utf8')).chunks as IndexedChunk[];

    const docChunks = loadDocChunks();
    const metaMap = new Map<string, Record<string, string>>();
    for (const d of docChunks) {
      metaMap.set(d.id, d.meta);
    }

    index = rawChunks.map((chunk) => {
      const meta = metaMap.get(chunk.id) ?? {};
      return {
        ...chunk,
        text: sanitizeChunkText(chunk.text),
        meta,
      };
    });
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

export async function search(query: string, operatorId?: string): Promise<Hit[]> {
  const chunks = loadIndex();

  const assignedEdificios = operatorId
    ? new Set(loadBuildings().filter((b) => b.operadores.includes(operatorId)).map((b) => b.edificio_id))
    : null;

  const validChunks = chunks.filter((c) => {
    const meta = c.meta ?? {};

    // 1. Integridad RAG: Filtro de vigencia documental
    if (meta.estado !== 'VIGENTE') return false;
    if (meta.vigente_desde && meta.vigente_desde > config.referenceDate) return false;
    if (meta.vigente_hasta && meta.vigente_hasta < config.referenceDate) return false;

    // 2. Seguridad Zero-Trust: Filtro por alcance
    if (operatorId) {
      const isGeneral = meta.alcance === 'general';
      const isAssigned = meta.alcance && assignedEdificios?.has(meta.alcance);
      if (!isGeneral && !isAssigned) return false;
    } else {
      if (meta.alcance !== 'general') return false;
    }

    return true;
  });

  const [q] = await getEmbedder().embed([query]);

  return validChunks
    .map(({ embedding, ...chunk }) => ({ ...chunk, score: cosine(q, embedding) }))
    .filter((h) => h.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}

