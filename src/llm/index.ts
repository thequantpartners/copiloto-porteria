import { config } from '../config.ts';
import { GeminiClient } from './gemini.ts';
import type { Embedder, LlmClient } from './types.ts';

let llm: LlmClient | undefined;
let embedder: Embedder | undefined;

export function getLlm(): LlmClient {
  if (!llm) {
    switch (config.llmProvider) {
      case 'gemini':
        llm = new GeminiClient(config.gemini.apiKey, config.gemini.model, config.gemini.embedModel);
        break;
      default:
        throw new Error(`Proveedor desconocido: ${config.llmProvider}`);
    }
  }
  return llm;
}

export function getEmbedder(): Embedder {
  embedder ??= new GeminiClient(config.gemini.apiKey, config.gemini.model, config.gemini.embedModel);
  return embedder;
}
