import type { ToolCall, ToolSpec } from '../llm/types.ts';
import { consultarAutorizaciones, consultarAutorizacionesSpec } from './authorizations.ts';
import { registrarIncidencia, registrarIncidenciaSpec } from './incidents.ts';

export const TOOL_SPECS: ToolSpec[] = [consultarAutorizacionesSpec, registrarIncidenciaSpec];

export interface ToolContext {
  operatorId: string;
}

export function runTool(call: ToolCall, ctx: ToolContext): { ok: boolean; output: unknown } {
  try {
    switch (call.name) {
      case 'consultar_autorizaciones':
        return { ok: true, output: consultarAutorizaciones(call.args as never) };
      case 'registrar_incidencia':
        return { ok: true, output: registrarIncidencia(call.args as never, ctx.operatorId) };
      default:
        return { ok: false, output: { error: `Herramienta desconocida: ${call.name}` } };
    }
  } catch (err) {
    return { ok: false, output: { error: (err as Error).message } };
  }
}
