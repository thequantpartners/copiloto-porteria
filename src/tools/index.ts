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
      case 'consultar_autorizaciones': {
        const output = consultarAutorizaciones(call.args as never, ctx.operatorId);
        const ok = !(output && typeof output === 'object' && 'ok' in output && (output as any).ok === false);
        return { ok, output };
      }
      case 'registrar_incidencia': {
        const output = registrarIncidencia(call.args as never, ctx.operatorId);
        const ok = !(output && typeof output === 'object' && 'ok' in output && (output as any).ok === false);
        return { ok, output };
      }
      default:
        return { ok: false, output: { error: `Herramienta desconocida: ${call.name}` } };
    }
  } catch (err) {
    return { ok: false, output: { error: (err as Error).message } };
  }
}

