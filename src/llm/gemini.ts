import { GoogleGenAI, type Content, type Part } from '@google/genai';

import type { ChatRequest, ChatResponse, Embedder, LlmClient } from './types.ts';

export class GeminiClient implements LlmClient, Embedder {
  readonly name = 'gemini';
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly embedModel: string,
  ) {
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY en .env');
    this.ai = new GoogleGenAI({ apiKey });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const contents: Content[] = [];

    for (const m of req.messages) {
      if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: m.content }] });
      } else if (m.role === 'assistant') {
        if (m.providerData) {
          contents.push(m.providerData as Content);
        } else {
          const parts: Part[] = [];
          if (m.content) parts.push({ text: m.content });
          for (const c of m.toolCalls ?? []) parts.push({ functionCall: { id: c.id, name: c.name, args: c.args } });
          contents.push({ role: 'model', parts });
        }
      } else {
        const part: Part = {
          functionResponse: { id: m.toolCallId, name: m.toolName, response: { output: m.content } },
        };
        const last = contents.at(-1);
        if (last?.role === 'user' && last.parts?.every((p) => p.functionResponse)) last.parts.push(part);
        else contents.push({ role: 'user', parts: [part] });
      }
    }

    const res = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: req.system,
        tools: req.tools?.length
          ? [
              {
                functionDeclarations: req.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parametersJsonSchema: t.parameters,
                })),
              },
            ]
          : undefined,
      },
    });

    const toolCalls = (res.functionCalls ?? []).map((c, i) => ({
      id: c.id ?? `call_${i}`,
      name: c.name ?? '',
      args: c.args ?? {},
    }));

    const text = (res.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join('');

    return {
      text,
      toolCalls,
      usage: {
        inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
      },
      providerData: res.candidates?.[0]?.content,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.ai.models.embedContent({
      model: this.embedModel,
      contents: texts,
      config: { outputDimensionality: 768 },
    });
    return (res.embeddings ?? []).map((e) => e.values ?? []);
  }
}
