import { config } from '../config.ts';
import { loadAuthorizations, loadBuildings } from '../data.ts';
import type { ToolSpec } from '../llm/types.ts';

export const consultarAutorizacionesSpec: ToolSpec = {
  name: 'consultar_autorizaciones',
  description:
    'Consulta las autorizaciones de visitas registradas por los residentes o la administración para una unidad de un edificio.',
  parameters: {
    type: 'object',
    properties: {
      edificio_id: { type: 'string', description: 'ID del edificio, por ejemplo E-101' },
      unidad: { type: 'string', description: 'Número de departamento u oficina' },
      visitante: {
        type: 'string',
        description: 'Nombre de la persona o empresa que llegó. Si se omite, devuelve todas las de la unidad.',
      },
    },
    required: ['edificio_id', 'unidad'],
  },
};

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const sameUnit = (a: string, b: string) => a.replace(/^0+/, '') === b.replace(/^0+/, '');

export function consultarAutorizaciones(
  args: { edificio_id: string; unidad: string; visitante?: string },
  operatorId?: string,
) {
  if (operatorId) {
    const buildings = loadBuildings();
    const assigned = buildings.filter((b) => b.operadores.includes(operatorId)).map((b) => b.edificio_id);
    if (!assigned.includes(args.edificio_id)) {
      return {
        ok: false,
        error: 'Acceso denegado: el edificio ' + args.edificio_id + ' no está asignado al operador ' + operatorId,
      };
    }
  }

  const today = config.referenceDate;

  const rows = loadAuthorizations().filter(
    (a) =>
      a.edificio_id === args.edificio_id &&
      sameUnit(a.unidad, String(args.unidad)) &&
      (!args.visitante || normalize(a.visitante).includes(normalize(args.visitante))),
  );

  return {
    ok: true,
    edificio_id: args.edificio_id,
    unidad: args.unidad,
    autorizaciones: rows.map((a) => ({
      residente: a.residente,
      visitante: a.visitante,
      tipo: a.tipo,
      autorizado_por: a.autorizado_por,
      valido_desde: a.valido_desde,
      valido_hasta: a.valido_hasta,
      estado: today < a.valido_desde ? 'futura' : today > a.valido_hasta ? 'vencida' : 'vigente',
    })),
  };
}

