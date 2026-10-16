import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  llmProvider: process.env.LLM_PROVIDER ?? 'gemini',
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite',
    embedModel: process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001',
  },
  referenceDate: process.env.FECHA_ACTUAL ?? '2026-10-16',
};
