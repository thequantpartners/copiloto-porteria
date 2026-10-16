import { getLlm, getEmbedder } from '../src/llm/index.ts';
import { config } from '../src/config.ts';

async function main() {
  const activeModel =
    config.llmProvider === 'groq'
      ? config.groq.model
      : config.llmProvider === 'openrouter'
        ? config.openrouter.model
        : config.llmProvider === 'openai'
          ? config.openai.model
          : config.gemini.model;

  console.log(`Probando conexión con proveedor: ${config.llmProvider}`);
  console.log(`Modelo LLM: ${activeModel}`);
  console.log(`Modelo Embedder: ${config.gemini.embedModel}`);

  console.log('1. Probando Embedder...');
  const embedder = getEmbedder();
  const embeddings = await embedder.embed(['Hola mundo']);
  console.log(`Embeddings OK. Dimensiones: ${embeddings[0]?.length}`);

  console.log('2. Probando Chat LLM...');
  const llm = getLlm();
  const res = await llm.chat({
    system: 'Eres un asistente de prueba.',
    messages: [{ role: 'user', content: 'Di "OK" si me escuchas.' }],
  });
  console.log(`Respuesta LLM OK (${activeModel}): "${res.text.trim()}"`);
  console.log(`Tokens usados: input=${res.usage?.inputTokens}, output=${res.usage?.outputTokens}`);

  console.log('¡Conexión validada con éxito (Exit Code 0)!');
}

main().catch((e) => {
  console.error('Fallo fatal:', e);
  process.exit(1);
});
