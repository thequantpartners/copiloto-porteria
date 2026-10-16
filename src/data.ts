import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DATA_DIR = join(import.meta.dirname, '..', 'data');

export interface Building {
  edificio_id: string;
  nombre: string;
  ciudad: string;
  pais: string;
  operadores: string[];
}

export interface Authorization {
  edificio_id: string;
  unidad: string;
  residente: string;
  visitante: string;
  tipo: string;
  autorizado_por: string;
  valido_desde: string;
  valido_hasta: string;
}

export interface DocChunk {
  id: string;
  doc_id: string;
  title: string;
  section: string;
  text: string;
  meta: Record<string, string>;
}

export function loadBuildings(): Building[] {
  return JSON.parse(readFileSync(join(DATA_DIR, 'edificios.json'), 'utf8'));
}

export function loadAuthorizations(): Authorization[] {
  const [header, ...rows] = readFileSync(join(DATA_DIR, 'autorizaciones.csv'), 'utf8').trim().split(/\r?\n/);
  const keys = header.split(',');
  return rows.map((row) => {
    const values = row.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, values[i]?.trim() ?? ''])) as unknown as Authorization;
  });
}

/** Lee data/docs/*.md y los corta por sección (## …). */
export function loadDocChunks(): DocChunk[] {
  const dir = join(DATA_DIR, 'docs');
  const chunks: DocChunk[] = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const raw = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) continue;

    const meta: Record<string, string> = {};
    for (const line of match[1].split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).split('#')[0].trim();
    }

    const sections = match[2].split(/\n(?=## )/).map((s) => s.trim()).filter(Boolean);
    sections.forEach((s, n) => {
      const [first, ...rest] = s.split('\n');
      const section = first.replace(/^##\s*/, '').trim();
      chunks.push({
        id: `${meta.doc_id}#${n + 1}`,
        doc_id: meta.doc_id,
        title: meta.titulo,
        section,
        text: rest.join('\n').trim(),
        meta,
      });
    });
  }
  return chunks;
}
