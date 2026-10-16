import type { ChatMessage, ChatRequest, ChatResponse, LlmClient, ToolCall } from './types.ts';

export interface OpenAiClientOptions {
  name?: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export class OpenAiClient implements LlmClient {
  readonly name: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: OpenAiClientOptions) {
    this.name = options.name ?? 'openai';
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');

    if (!this.apiKey) {
      throw new Error(`Falta API Key para proveedor "${this.name}". Configúrala en .env`);
    }
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const formattedMessages: Record<string, unknown>[] = [];

    // Inyectar system prompt
    if (req.system) {
      formattedMessages.push({
        role: 'system',
        content: req.system,
      });
    }

    // Convertir historial canónico a esquema OpenAI
    for (const m of req.messages) {
      if (m.role === 'user') {
        formattedMessages.push({
          role: 'user',
          content: m.content,
        });
      } else if (m.role === 'assistant') {
        const assistantMsg: Record<string, unknown> = {
          role: 'assistant',
          content: m.content || null,
        };

        if (m.toolCalls && m.toolCalls.length > 0) {
          assistantMsg.tool_calls = m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args),
            },
          }));
        }

        formattedMessages.push(assistantMsg);
      } else if (m.role === 'tool') {
        formattedMessages.push({
          role: 'tool',
          tool_call_id: m.toolCallId,
          content: m.content,
        });
      }
    }

    // Mapeo de herramientas (Function Calling)
    const tools = req.tools?.length
      ? req.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }))
      : undefined;

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: formattedMessages,
      temperature: 0,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (this.name === 'openrouter') {
      headers['HTTP-Referer'] = 'https://copiloto-porteria.local';
      headers['X-Title'] = 'Copiloto Porteria';
    }

    const url = `${this.baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      let parsedMsg = errorText;
      try {
        const errJson = JSON.parse(errorText);
        parsedMsg = errJson.error?.message || errorText;
      } catch {
        // use raw errorText
      }
      throw new Error(`[${this.name}] HTTP ${res.status} ${res.statusText}: ${parsedMsg}`);
    }

    const data = (await res.json()) as any;
    const choice = data.choices?.[0];
    const message = choice?.message;

    const text = message?.content ?? '';

    const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((tc: any, i: number) => {
      let args: Record<string, unknown> = {};
      if (typeof tc.function?.arguments === 'string') {
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }
      } else if (typeof tc.function?.arguments === 'object' && tc.function.arguments !== null) {
        args = tc.function.arguments;
      }

      return {
        id: tc.id ?? `call_${i}`,
        name: tc.function?.name ?? '',
        args,
      };
    });

    const usage = {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };

    return {
      text,
      toolCalls,
      usage,
      providerData: message,
    };
  }
}
