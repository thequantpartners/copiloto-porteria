import { loadBuildings } from './data.ts';

/**
 * Devuelve el operador que atiende el turno a partir del header HTTP sanitizado.
 * Solo retorna el operador si existe y está registrado como operador válido en loadBuildings().
 */
export function resolveOperator(headerValue: string | undefined, message?: string): string | null {
  if (!headerValue) return null;
  const sanitized = headerValue.trim().toUpperCase();
  const buildings = loadBuildings();
  const validOperators = new Set(buildings.flatMap((b) => b.operadores.map((op) => op.toUpperCase())));
  return validOperators.has(sanitized) ? sanitized : null;
}

