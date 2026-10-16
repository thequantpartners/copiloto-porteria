/**
 * Suite de Evaluación Determinista de Calidad y Hechos para Copiloto de Portería.
 * Corre cada caso del dataset N veces (default 3), mide Hechos vs Calidad,
 * latencia y tokens, y genera reporte tabular y JSON.
 *
 * Uso:
 *   npx tsx scripts/eval.ts [outputFile]
 *   Ejemplo: npx tsx scripts/eval.ts eval/results-before.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { DATA_DIR } from '../src/data.ts';
import { tokenTracker } from '../src/llm/index.ts';

interface TestCase {
  id: number;
  sesion: string;
  operador: string;
  pregunta: string;
  esperado: string;
  categoria: string;
  hechos: {
    expected_tools: string[];
    forbidden_tools: string[];
    expected_pending_confirmation: boolean;
    expected_incident_created: boolean;
  };
  calidad: {
    required_concepts: string[];
    forbidden_concepts: string[];
  };
}

interface RunResult {
  run: number;
  latencyMs: number;
  tokens: { input: number; output: number; total: number };
  factsPass: boolean;
  qualityPass: boolean;
  overallPass: boolean;
  factsDetails: string[];
  qualityDetails: string[];
  response: {
    status: number;
    answer: string;
    tool_calls: { name: string; args: Record<string, unknown>; ok: boolean }[];
    sources: { doc_id: string; section: string }[];
    pending_confirmation: unknown;
  };
}

interface CaseSummary {
  id: number;
  categoria: string;
  pregunta: string;
  esperado: string;
  factsPassed: number;
  qualityPassed: number;
  overallPassed: number;
  avgLatencyMs: number;
  avgTokens: number;
  runs: RunResult[];
}

const norm = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function getIncidentCount(): number {
  const file = join(DATA_DIR, 'incidencias.json');
  if (!existsSync(file)) return 0;
  try {
    const list = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
}

async function callChatWithRetry(
  operador: string,
  sessionId: string,
  message: string,
  maxRetries = 4,
): Promise<{ body: any; status: number; latencyMs: number; tokens: { input: number; output: number; total: number } }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const started = Date.now();
    try {
      tokenTracker.reset();
      const res = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Operator-Id': operador,
        },
        body: JSON.stringify({
          session_id: sessionId,
          message,
        }),
      });
      const latencyMs = Date.now() - started;
      const body = await res.json();

      const isRateLimit =
        res.status === 429 ||
        (res.status === 500 &&
          (String(body?.error).includes('429') ||
            String(body?.error).includes('RESOURCE_EXHAUSTED') ||
            String(body?.error).includes('quota')));

      if (isRateLimit) {
        const delay = Math.min(60000, 5000 * Math.pow(2, attempt - 1));
        console.warn(`  [429 Rate Limit] Intento ${attempt}/${maxRetries}. Esperando ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      const tokens = {
        input: tokenTracker.inputTokens,
        output: tokenTracker.outputTokens,
        total: tokenTracker.inputTokens + tokenTracker.outputTokens,
      };

      return { body, status: res.status, latencyMs, tokens };
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      const delay = Math.min(60000, 5000 * Math.pow(2, attempt - 1));
      console.warn(`  [Error red] ${err.message}. Reintentando en ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

async function main() {
  const args = process.argv.slice(2);
  const outputFile = args[0] || join('eval', 'results-before.json');
  const datasetPath = join('eval', 'dataset.json');

  if (!existsSync(datasetPath)) {
    console.error(`Error: No se encontró el dataset en ${datasetPath}`);
    process.exit(1);
  }

  const dataset: TestCase[] = JSON.parse(readFileSync(datasetPath, 'utf8'));
  const RUNS_PER_CASE = 3;
  const DELAY_BETWEEN_CALLS_MS = 2500;

  console.log(`========================================================================`);
  console.log(` INICIANDO EVALUACIÓN DEL COPILOTO DE PORTERÍA`);
  console.log(` Proveedor: ${config.llmProvider} | Modelo: ${config.gemini.model}`);
  console.log(` Casos: ${dataset.length} | Corridas por caso: ${RUNS_PER_CASE} | Total turnos: ${dataset.length * RUNS_PER_CASE}`);
  console.log(` Archivo de salida: ${outputFile}`);
  console.log(`========================================================================\n`);

  const caseSummaries: Map<number, CaseSummary> = new Map();

  for (const c of dataset) {
    caseSummaries.set(c.id, {
      id: c.id,
      categoria: c.categoria,
      pregunta: c.pregunta,
      esperado: c.esperado,
      factsPassed: 0,
      qualityPassed: 0,
      overallPassed: 0,
      avgLatencyMs: 0,
      avgTokens: 0,
      runs: [],
    });
  }

  for (let run = 1; run <= RUNS_PER_CASE; run++) {
    console.log(`>>> INICIANDO CORRIDA ${run}/${RUNS_PER_CASE} <<<`);

    for (const c of dataset) {
      const sessionId = `${c.sesion}-r${run}`;
      const incBefore = getIncidentCount();

      const { body, status, latencyMs, tokens } = await callChatWithRetry(c.operador, sessionId, c.pregunta);
      const incAfter = getIncidentCount();
      const incidentCreated = incAfter > incBefore;

      // Evaluación de Hechos
      const toolCalls = body.tool_calls ?? [];
      const toolNames = toolCalls.map((t: { name: string }) => t.name);
      const factsDetails: string[] = [];

      let expectedToolsOk = true;
      for (const expectedTool of c.hechos.expected_tools) {
        if (!toolNames.includes(expectedTool)) {
          expectedToolsOk = false;
          factsDetails.push(`Falta herramienta esperada: ${expectedTool}`);
        }
      }

      let forbiddenToolsOk = true;
      for (const forbiddenTool of c.hechos.forbidden_tools) {
        if (toolNames.includes(forbiddenTool)) {
          forbiddenToolsOk = false;
          factsDetails.push(`Ejecutó herramienta prohibida: ${forbiddenTool}`);
        }
      }

      let pendingOk = true;
      const hasPending = Boolean(body.pending_confirmation);
      if (c.hechos.expected_pending_confirmation !== hasPending) {
        pendingOk = false;
        factsDetails.push(`pending_confirmation esperado: ${c.hechos.expected_pending_confirmation}, obtenido: ${hasPending}`);
      }

      let incidentOk = true;
      if (c.hechos.expected_incident_created !== incidentCreated) {
        incidentOk = false;
        factsDetails.push(`Incidencia en disco esperada: ${c.hechos.expected_incident_created}, creada: ${incidentCreated}`);
      }

      const factsPass = expectedToolsOk && forbiddenToolsOk && pendingOk && incidentOk;

      // Evaluación de Calidad
      const answer = body.answer ?? '';
      const normAnswer = norm(answer);
      const qualityDetails: string[] = [];

      let requiredOk = true;
      for (const concept of c.calidad.required_concepts) {
        if (!normAnswer.includes(norm(concept))) {
          requiredOk = false;
          qualityDetails.push(`Falta concepto requerido: "${concept}"`);
        }
      }

      let forbiddenOk = true;
      for (const concept of c.calidad.forbidden_concepts) {
        if (normAnswer.includes(norm(concept))) {
          forbiddenOk = false;
          qualityDetails.push(`Contiene concepto prohibido/alucinación: "${concept}"`);
        }
      }

      const qualityPass = requiredOk && forbiddenOk;
      const overallPass = factsPass && qualityPass;

      const summary = caseSummaries.get(c.id)!;
      if (factsPass) summary.factsPassed++;
      if (qualityPass) summary.qualityPassed++;
      if (overallPass) summary.overallPassed++;

      const runRecord: RunResult = {
        run,
        latencyMs,
        tokens,
        factsPass,
        qualityPass,
        overallPass,
        factsDetails,
        qualityDetails,
        response: {
          status,
          answer,
          tool_calls: toolCalls,
          sources: body.sources ?? [],
          pending_confirmation: body.pending_confirmation,
        },
      };

      summary.runs.push(runRecord);

      const statusIcon = overallPass ? '✓' : '✗';
      const fIcon = factsPass ? 'H:✓' : 'H:✗';
      const qIcon = qualityPass ? 'Q:✓' : 'Q:✗';
      console.log(`[R${run}] #${c.id.toString().padStart(2, ' ')} ${statusIcon} (${fIcon} ${qIcon}) | ${c.categoria.padEnd(28, ' ')} | ${latencyMs}ms | ${tokens.total}tok`);
      if (!overallPass) {
        if (factsDetails.length) console.log(`      Fallos Hechos: ${factsDetails.join('; ')}`);
        if (qualityDetails.length) console.log(`      Fallos Calidad: ${qualityDetails.join('; ')}`);
      }

      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CALLS_MS));
    }
    console.log('');
  }

  // Métricas Consolidadas
  let totalFactsPassed = 0;
  let totalQualityPassed = 0;
  let totalOverallPassed = 0;
  let totalLatency = 0;
  let totalTokens = 0;
  const totalTurns = dataset.length * RUNS_PER_CASE;

  const resultsList = Array.from(caseSummaries.values());
  for (const s of resultsList) {
    s.avgLatencyMs = Math.round(s.runs.reduce((acc, r) => acc + r.latencyMs, 0) / s.runs.length);
    s.avgTokens = Math.round(s.runs.reduce((acc, r) => acc + r.tokens.total, 0) / s.runs.length);

    totalFactsPassed += s.factsPassed;
    totalQualityPassed += s.qualityPassed;
    totalOverallPassed += s.overallPassed;
    totalLatency += s.runs.reduce((acc, r) => acc + r.latencyMs, 0);
    totalTokens += s.runs.reduce((acc, r) => acc + r.tokens.total, 0);
  }

  const finalOutput = {
    meta: {
      timestamp: new Date().toISOString(),
      provider: config.llmProvider,
      model: config.gemini.model,
      embedModel: config.gemini.embedModel,
      totalCases: dataset.length,
      runsPerCase: RUNS_PER_CASE,
      totalTurns,
    },
    summary: {
      factsPassCount: totalFactsPassed,
      factsPassRate: Number(((totalFactsPassed / totalTurns) * 100).toFixed(1)),
      qualityPassCount: totalQualityPassed,
      qualityPassRate: Number(((totalQualityPassed / totalTurns) * 100).toFixed(1)),
      overallPassCount: totalOverallPassed,
      overallPassRate: Number(((totalOverallPassed / totalTurns) * 100).toFixed(1)),
      avgLatencyMs: Math.round(totalLatency / totalTurns),
      avgTokens: Math.round(totalTokens / totalTurns),
      totalTokens,
    },
    cases: resultsList,
  };

  writeFileSync(outputFile, JSON.stringify(finalOutput, null, 2));

  // Renderizado Tabular
  console.log(`\n========================================================================================================`);
  console.log(` RESUMEN TABULAR DE EVALUACIÓN (LÍNEA BASE "ANTES")`);
  console.log(`========================================================================================================`);
  console.log(
    `ID | Categoría                    | Hechos  | Calidad | Global  | Latencia | Tokens | Resultado Esperado`,
  );
  console.log(`--------------------------------------------------------------------------------------------------------`);
  for (const s of resultsList) {
    const factsStr = `${s.factsPassed}/${RUNS_PER_CASE}`.padStart(7, ' ');
    const qualStr = `${s.qualityPassed}/${RUNS_PER_CASE}`.padStart(7, ' ');
    const overStr = `${s.overallPassed}/${RUNS_PER_CASE}`.padStart(7, ' ');
    const latStr = `${s.avgLatencyMs}ms`.padStart(8, ' ');
    const tokStr = `${s.avgTokens}`.padStart(6, ' ');
    console.log(
      `${s.id.toString().padStart(2, ' ')} | ${s.categoria.padEnd(28, ' ')} | ${factsStr} | ${qualStr} | ${overStr} | ${latStr} | ${tokStr} | ${s.esperado.slice(0, 35)}`,
    );
  }
  console.log(`--------------------------------------------------------------------------------------------------------`);
  console.log(`TOTAL HECHOS:  ${totalFactsPassed}/${totalTurns} (${finalOutput.summary.factsPassRate}%)`);
  console.log(`TOTAL CALIDAD: ${totalQualityPassed}/${totalTurns} (${finalOutput.summary.qualityPassRate}%)`);
  console.log(`TOTAL GLOBAL:  ${totalOverallPassed}/${totalTurns} (${finalOutput.summary.overallPassRate}%)`);
  console.log(`LATENCIA PROM: ${finalOutput.summary.avgLatencyMs} ms`);
  console.log(`TOKENS PROM:   ${finalOutput.summary.avgTokens} tokens/turno`);
  console.log(`========================================================================================================`);
  console.log(`Archivo generado con éxito: ${outputFile}\n`);
}

main().catch((err) => {
  console.error('Error fatal durante la evaluación:', err);
  process.exit(1);
});
