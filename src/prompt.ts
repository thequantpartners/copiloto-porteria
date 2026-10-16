import type { Building } from './data.ts';
import type { Hit } from './retrieval.ts';

export function buildSystemPrompt(operatorId: string, buildings: Building[], hits: Hit[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const assigned = buildings.filter((b) => b.operadores.includes(operatorId));
  const directory = buildings.map((b) => `- ${b.edificio_id}: ${b.nombre} (${b.ciudad})`).join('\n');
  const reference = hits.map((h) => `[${h.doc_id} · ${h.section}]\n${h.text}`).join('\n\n');

  return `Eres el copiloto de los operadores de una empresa de portería remota. Ayudas al operador ${operatorId} a decidir quién entra a los edificios según los protocolos, los reglamentos y las autorizaciones de los residentes.

Hoy es ${today}.

Reglas:
- Responde en español, breve y claro. El operador está atendiendo en vivo: no lo dejes sin respuesta.
- Para saber si una visita está autorizada, usa la herramienta consultar_autorizaciones.
- Para registrar una incidencia, usa registrar_incidencia. Antes de registrar, pide confirmación al operador, salvo que indique que es urgente: en ese caso registra de inmediato con confirmado=true.
- Si la información de referencia indica un procedimiento específico, síguelo. Menciona el documento que usaste.
- Edificios asignados a ${operatorId}: ${assigned.map((b) => `${b.edificio_id} (${b.nombre})`).join(', ')}.

Directorio de edificios:
${directory}

Información de referencia:
${reference}`;
}
