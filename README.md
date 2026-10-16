# Copiloto de portería

Este servicio es un copiloto para operadores de portería remota. Cada operador atiende varios edificios a la vez y le pregunta al copiloto qué dicen los protocolos y reglamentos, si una visita está autorizada, o le pide registrar una incidencia.

**El copiloto salió a producción hace dos semanas y los operadores reportan problemas.** Tu trabajo es medir qué tan bien funciona, encontrar lo que está mal, decidir qué importa más y arreglarlo mostrando que mejoró.

- **Tiempo estimado:** unas 4 horas.
- **Plazo:** 72 horas desde que lo recibes.
- Si algo no te alcanza, explícalo en tu README. Preferimos poco y bien razonado que mucho sin explicar.

---

## Cómo correrlo

Necesitas Node 22 o superior, pnpm y una clave gratuita de Gemini (https://aistudio.google.com/apikey).

```bash
pnpm install
cp .env.example .env        # pon tu GEMINI_API_KEY
pnpm dev                    # levanta el servidor en http://localhost:3000
pnpm eval:ejemplo           # en otra terminal: corre las 10 preguntas de ejemplo
pnpm test
```

`data/index.json` ya trae los embeddings de los documentos. Si cambias algo en `data/docs`, regenéralo con `pnpm index`.

El plan gratuito de Gemini permite unas 15 solicitudes por minuto por modelo. Pon pausas entre casos y reintenta los errores 429: tu evaluación va a tardar unos minutos. Si tienes una clave de pago, úsala.

## Cómo está armado

| Pieza | Qué hace |
|---|---|
| `src/app.ts` | `POST /chat`: valida el request y llama al agente |
| `src/agent.ts` | El bucle: busca documentos, llama al modelo, ejecuta herramientas y arma la respuesta |
| `src/prompt.ts` | El prompt de sistema |
| `src/retrieval.ts` | Búsqueda por similitud sobre `data/index.json` |
| `src/tools/` | `consultar_autorizaciones` y `registrar_incidencia` |
| `src/llm/` | La interfaz del modelo (`types.ts`) y el adaptador de Gemini |
| `data/` | Documentos, edificios, autorizaciones e incidencias registradas |

### El contrato de la API (no lo cambies)

```
POST /chat
Header: X-Operator-Id: OP-07
Body:   { "session_id": "abc", "message": "Llegó Jorge Ríos al 502 de Los Álamos" }

→ { "answer": "…",
    "sources": [{ "doc_id": "…", "section": "…" }],
    "tool_calls": [{ "name": "…", "args": { … }, "ok": true }],
    "pending_confirmation": null | { "action": "registrar_incidencia", "args": { … } } }
```

---

## Lo que tienes que hacer

### A. Evalúa el copiloto

- Arma un set de **al menos 12 casos** con su resultado esperado. `eval/ejemplo.json` es un ejemplo, no el set.
- Separa lo que se puede comprobar como **hecho** (qué herramienta se llamó, con qué datos, si se registró una incidencia, qué documento se citó) de la **calidad** de la respuesta.
- Corre **cada caso 3 veces** y reporta cuántas pasó.
- Entrega la **lista de problemas** que encontraste, ordenada por gravedad, con evidencia.

### B. Arregla los dos problemas más graves

- Muestra los resultados de tu set **antes y después**.
- Muestra que no rompiste otra cosa.

### C. Calibra un umbral

`data/umbral/puntajes.csv` tiene 60 preguntas de un sistema anterior: el puntaje del mejor documento encontrado y si ese documento era de verdad relevante (`relevante=1`). Los puntajes no son los de este repo.

Elige el umbral por debajo del cual el copiloto debería responder «no encontré información» en vez de contestar, y justifica cómo lo elegiste.

### D. Agrega un segundo proveedor de modelo

- Implementa la interfaz de `src/llm/types.ts` para el proveedor que uses (OpenAI, Claude, Mistral, Ollama…) y regístralo en `src/llm/index.ts`.
- Compáralo con Gemini usando tu set: aciertos, latencia y costo por conversación.
- ¿Con cuál te quedarías y por qué?

---

## Reglas

- No cambies el contrato de `POST /chat`.
- Tu evaluación tiene que correr con **un solo comando** y en menos de 10 minutos con el plan gratuito.
- Toma como fecha actual el **2026-10-16**.
- Puedes y debes usar asistentes de IA para programar. Cuéntanos cuáles usaste y qué les corregiste.
- Entrega un repo **privado** con historial de commits, con acceso para la cuenta que te indicamos. Sin secretos: usa `.env.example`.

## Tu README

Reemplaza este archivo o agrega uno tuyo con:

1. Cómo correr tu evaluación.
2. Los problemas que encontraste, en orden, y por qué ese orden.
3. Qué arreglaste y cómo lo comprobaste.
4. El umbral que elegiste y cómo lo elegiste.
5. La comparación de proveedores y tu elección.
6. Qué asistentes de IA usaste y qué les corregiste.
7. Qué harías con más tiempo para llevarlo a producción (máximo 10 líneas).

## Cómo se evalúa

| Criterio | Peso |
|---|---|
| Criterio: evaluación, priorización, umbral y elección de modelo | 40% |
| Seguridad | 25% |
| Corrección en casos nuestros | 15% |
| README y comunicación | 20% |

Si avanzas, tendremos una sesión de 45 minutos: demo de tu evaluación, recorrido del código y un cambio pequeño en vivo.
