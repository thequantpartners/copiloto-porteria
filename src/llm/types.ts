/**
 * Contrato entre el agente y cualquier proveedor de modelo.
 * Para agregar un proveedor, implementa LlmClient y regístralo en ./index.ts.
 */

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema de los argumentos. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      toolCalls?: ToolCall[];
      /**
       * Lo que el proveedor necesite para reconstruir este turno tal cual
       * (algunos modelos exigen reenviar su respuesta original). Opaco para el agente.
       */
      providerData?: unknown;
    }
  | { role: 'tool'; toolCallId: string; toolName: string; content: string };

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
  providerData?: unknown;
}

export interface LlmClient {
  readonly name: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

/** Embeddings para la búsqueda. El índice de data/index.json se generó con Gemini. */
export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}
