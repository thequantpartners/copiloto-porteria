import { config } from '../config.ts';
import { GeminiClient } from './gemini.ts';
import { OpenAiClient } from './openai.ts';
import type { Embedder, LlmClient } from './types.ts';

let llm: LlmClient | undefined;
let currentProvider: string | undefined;
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
  if (!llm || currentProvider !== config.llmProvider) {
    let client: LlmClient;
    switch (config.llmProvider) {
      case 'gemini':
        client = new GeminiClient(config.gemini.apiKey, config.gemini.model, config.gemini.embedModel);
        break;
      case 'groq':
        client = new OpenAiClient({
          name: 'groq',
          apiKey: config.groq.apiKey,
          model: config.groq.model,
          baseUrl: config.groq.baseUrl,
        });
        break;
      case 'openrouter':
        client = new OpenAiClient({
          name: 'openrouter',
          apiKey: config.openrouter.apiKey,
          model: config.openrouter.model,
          baseUrl: config.openrouter.baseUrl,
        });
        break;
      case 'openai':
        client = new OpenAiClient({
          name: 'openai',
          apiKey: config.openai.apiKey,
          model: config.openai.model,
          baseUrl: config.openai.baseUrl,
        });
        break;
      default:
        throw new Error(`Proveedor desconocido: ${config.llmProvider}`);
    }
    currentProvider = config.llmProvider;
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
