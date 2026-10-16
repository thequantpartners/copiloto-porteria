import { config } from '../config.ts';
import { GeminiClient } from './gemini.ts';
import type { Embedder, LlmClient } from './types.ts';

let llm: LlmClient | undefined;
let embedder: Embedder | undefined;

export const tokenTracker = {
  inputTokens: 0,
  outputTokens: 0,
  reset() {
    this.inputTokens = 0;
    this.outputTokens = 0;
  },
  record(usage?: { inputTokens: number; outputTokens: number }) {
    if (usage) {
      this.inputTokens += usage.inputTokens;
      this.outputTokens += usage.outputTokens;
    }
  },
};

export function getLlm(): LlmClient {
  if (!llm) {
    let client: LlmClient;
    switch (config.llmProvider) {
      case 'gemini':
        client = new GeminiClient(config.gemini.apiKey, config.gemini.model, config.gemini.embedModel);
        break;
      default:
        throw new Error(`Proveedor desconocido: ${config.llmProvider}`);
    }
    llm = {
      name: client.name,
      async chat(req) {
        const res = await client.chat(req);
        tokenTracker.record(res.usage);
        return res;
      },
    };
  }
  return llm;
}

export function getEmbedder(): Embedder {
  embedder ??= new GeminiClient(config.gemini.apiKey, config.gemini.model, config.gemini.embedModel);
  return embedder;
}
