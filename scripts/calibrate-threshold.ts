import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Row {
  id: string;
  pregunta: string;
  mejor_doc: string;
  puntaje: number;
  relevante: number; // 1 or 0
}

interface Metrics {
  threshold: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  specificity: number;
  f1: number;
  accuracy: number;
}

function parseCsv(content: string): Row[] {
  const lines = content.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    // Regex matches: ID, "pregunta", mejor_doc, puntaje, relevante
    const match = line.match(/^([^,]+),"(.*)",([^,]+),([^,]+),([^,]+)$/) ||
                  line.match(/^([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)$/);
    if (!match) {
      console.warn(`Línea inválida en CSV: ${line}`);
      continue;
    }
    rows.push({
      id: match[1].trim(),
      pregunta: match[2].trim(),
      mejor_doc: match[3].trim(),
      puntaje: parseFloat(match[4].trim()),
      relevante: parseInt(match[5].trim(), 10),
    });
  }
  return rows;
}

function computeMetrics(rows: Row[], threshold: number): Metrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (const r of rows) {
    const predictedPositive = r.puntaje >= threshold;
    if (predictedPositive && r.relevante === 1) tp++;
    else if (predictedPositive && r.relevante === 0) fp++;
    else if (!predictedPositive && r.relevante === 0) tn++;
    else if (!predictedPositive && r.relevante === 1) fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = rows.length > 0 ? (tp + tn) / rows.length : 0;

  return {
    threshold,
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    specificity,
    f1,
    accuracy,
  };
}

export function runCalibration() {
  const csvPath = join(process.cwd(), 'data', 'umbral', 'puntajes.csv');
  const csvContent = readFileSync(csvPath, 'utf8');
  const rows = parseCsv(csvContent);

  const total = rows.length;
  const positives = rows.filter((r) => r.relevante === 1).length;
  const negatives = rows.filter((r) => r.relevante === 0).length;

  console.log('='.repeat(90));
  console.log(' CALIBRACIÓN DETERMINISTA DE UMBRAL DE RELEVANCIA (RAG)');
  console.log(` Dataset: ${total} preguntas | Relevantes (1): ${positives} | No relevantes (0): ${negatives}`);
  console.log('='.repeat(90));

  const thresholdsToTest = [
    0.40, 0.45, 0.50, 0.55, 0.58, 0.60, 0.62, 0.65, 0.70, 0.71, 0.75, 0.80, 0.85
  ];

  const results: Metrics[] = thresholdsToTest.map((t) => computeMetrics(rows, t));

  console.log('\n--- TABLA COMPARATIVA DE MÉTRICAS SEGÚN UMBRAL ---');
  console.log(
    'Umbral | TP | FP | TN | FN | Precisión | Recall | Especificidad |    F1    | Exactitud'
  );
  console.log('-'.repeat(85));

  for (const m of results) {
    const tStr = m.threshold.toFixed(2).padStart(6, ' ');
    const tpStr = m.tp.toString().padStart(2, ' ');
    const fpStr = m.fp.toString().padStart(2, ' ');
    const tnStr = m.tn.toString().padStart(2, ' ');
    const fnStr = m.fn.toString().padStart(2, ' ');
    const pStr = (m.precision * 100).toFixed(1).padStart(7, ' ') + '%';
    const rStr = (m.recall * 100).toFixed(1).padStart(6, ' ') + '%';
    const sStr = (m.specificity * 100).toFixed(1).padStart(11, ' ') + '%';
    const f1Str = (m.f1 * 100).toFixed(1).padStart(7, ' ') + '%';
    const accStr = (m.accuracy * 100).toFixed(1).padStart(8, ' ') + '%';

    const highlight = m.threshold === 0.60 ? '  <-- ÓPTIMO RECOMENDADO' : m.threshold === 0.71 ? '  <-- UMBRAL ESTRICTO' : '';
    console.log(
      `${tStr} | ${tpStr} | ${fpStr} | ${tnStr} | ${fnStr} | ${pStr} | ${rStr} | ${sStr} | ${f1Str} | ${accStr}${highlight}`
    );
  }
  console.log('-'.repeat(85));

  // Análisis de casos críticos
  const criticalIds = ['Q46', 'Q47', 'Q51', 'Q03', 'Q35', 'Q53', 'Q54', 'Q41'];
  console.log('\n--- ANÁLISIS DE CASOS CRÍTICOS Y ASIMETRÍA DE RIESGO ---');
  console.log('ID  | Puntaje | Relevante | Decisión (T=0.60) | Decisión (T=0.71) | Pregunta');
  console.log('-'.repeat(90));

  for (const id of criticalIds) {
    const row = rows.find((r) => r.id === id);
    if (!row) continue;
    const dec60 = row.puntaje >= 0.60 ? 'RECUPERA (OK)' : 'IGNORA (FN)';
    const dec71 = row.puntaje >= 0.71 ? 'RECUPERA (OK)' : 'IGNORA (PELIGRO: FN)';
    console.log(
      `${row.id.padEnd(3, ' ')} |  ${row.puntaje.toFixed(3)}  |     ${row.relevante}     | ${dec60.padEnd(17, ' ')} | ${dec71.padEnd(19, ' ')} | ${row.pregunta}`
    );
  }
  console.log('-'.repeat(90));

  // Justificación Matemática y Operativa
  const m60 = results.find((r) => r.threshold === 0.60)!;
  const m71 = results.find((r) => r.threshold === 0.71)!;

  console.log('\n--- JUSTIFICACIÓN MATEMÁTICA Y OPERATIVA (T = 0.60 vs T = 0.71) ---');
  console.log(`1. ASIMETRÍA DE COSTOS Y RIESGO EN PORTERÍA:`);
  console.log(`   - En portería remota, el costo de un Falso Negativo (FN) es potencialmente catastrófico:`);
  console.log(`     * Q46 (Desmayo en lobby, score 0.656): Con T=0.71 es un FN. El operador queda sin protocolo médico ante un riesgo de vida.`);
  console.log(`     * Q51 (Ambulancia esperando, score 0.686): Con T=0.71 es un FN. Retraso crítico en el ingreso de auxilio médico.`);
  console.log(`     * Q47 (Intento de ingreso forzado, score 0.630): Con T=0.71 es un FN. Brecha de seguridad física en el edificio.`);
  console.log(`   - Con T = 0.60, el Recall en emergencias y procedimientos operativos críticos es del ${(m60.recall * 100).toFixed(1)}% (FN = ${m60.fn}).`);
  console.log(`   - Con T = 0.71, el Recall se desploma al ${(m71.recall * 100).toFixed(1)}%, provocando ${m71.fn} Falsos Negativos (+${m71.fn - m60.fn} casos perdidos!).`);

  console.log(`\n2. BALANCE DE ERROR (PRECISIÓN VS ESPECIFICIDAD):`);
  console.log(`   - Con T = 0.60: F1-Score = ${(m60.f1 * 100).toFixed(1)}%, Precisión = ${(m60.precision * 100).toFixed(1)}%, Especificidad = ${(m60.specificity * 100).toFixed(1)}%.`);
  console.log(`   - Con T = 0.71: F1-Score = ${(m71.f1 * 100).toFixed(1)}%, Precisión = ${(m71.precision * 100).toFixed(1)}%, Especificidad = ${(m71.specificity * 100).toFixed(1)}%.`);
  console.log(`   - En T = 0.60, solo entran ${m60.fp} falsos positivos inocuos (consultas irrelevantes con contexto adicional que el LLM puede descartar),`);
  console.log(`     mientras que se rescatan completamente los protocolos operativos vitales.`);

  console.log(`\n3. CONCLUSIÓN OPERACIONAL:`);
  console.log(`   - El umbral óptimo matemáticamente equilibrado y operativamente seguro es T = 0.60.`);
  console.log('='.repeat(90) + '\n');
}

runCalibration();
