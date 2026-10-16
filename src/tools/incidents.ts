import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DATA_DIR, loadBuildings } from '../data.ts';
import type { ToolSpec } from '../llm/types.ts';

const FILE = join(DATA_DIR, 'incidencias.json');

export const registrarIncidenciaSpec: ToolSpec = {
  name: 'registrar_incidencia',
  description:
    'Registra una incidencia en la bitácora del edificio. Sin confirmado=true solo la deja propuesta para que el operador la confirme.',
  parameters: {
    type: 'object',
    properties: {
      edificio_id: { type: 'string', description: 'ID del edificio, por ejemplo E-205' },
      descripcion: { type: 'string', description: 'Qué pasó, en una o dos frases' },
      prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
      confirmado: {
        type: 'boolean',
        description: 'true si el operador ya confirmó o pidió registrar de inmediato',
      },
    },
    required: ['edificio_id', 'descripcion', 'prioridad'],
  },
};

export interface Incident {
  id: string;
  edificio_id: string;
  descripcion: string;
  prioridad: string;
  operador: string;
  creada_en: string;
}

function readAll(): Incident[] {
  return existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : [];
}

export function saveIncident(
  args: { edificio_id: string; descripcion: string; prioridad: string },
  operatorId: string,
): Incident {
  const buildings = loadBuildings();
  const assigned = buildings.filter((b) => b.operadores.includes(operatorId)).map((b) => b.edificio_id);
  if (!assigned.includes(args.edificio_id)) {
    throw new Error('Acceso denegado: el edificio ' + args.edificio_id + ' no está asignado al operador ' + operatorId);
  }

  const all = readAll();
  const incident: Incident = {
    id: `INC-${String(all.length + 1).padStart(4, '0')}`,
    edificio_id: args.edificio_id,
    descripcion: args.descripcion,
    prioridad: args.prioridad,
    operador: operatorId,
    creada_en: new Date().toISOString(),
  };
  writeFileSync(FILE, JSON.stringify([...all, incident], null, 2));
  return incident;
}

export function registrarIncidencia(
  args: { edificio_id: string; descripcion: string; prioridad: string; confirmado?: boolean },
  operatorId: string,
) {
  const buildings = loadBuildings();
  const assigned = buildings.filter((b) => b.operadores.includes(operatorId)).map((b) => b.edificio_id);
  if (!assigned.includes(args.edificio_id)) {
    return {
      ok: false,
      error: 'Acceso denegado: el edificio ' + args.edificio_id + ' no está asignado al operador ' + operatorId,
    };
  }

  if (args.confirmado) {
    const incident = saveIncident(args, operatorId);
    return { ok: true, registrada: true, id: incident.id };
  }
  return {
    ok: true,
    registrada: false,
    pendiente: true,
    mensaje: 'Incidencia propuesta. Muéstrala al operador y pídele que confirme.',
  };
}

