/**
 * Devuelve el operador que atiende el turno.
 * El supervisor puede operar en nombre de otro operador indicándolo en el mensaje ("soy OP-12").
 */
export function resolveOperator(headerValue: string | undefined, message: string): string | null {
  const override = message.match(/soy (OP-\d{2})/i);
  if (override) return override[1].toUpperCase();
  return headerValue?.trim() || null;
}
