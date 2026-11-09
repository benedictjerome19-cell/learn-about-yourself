// One entry point for every optional LLM provider. Providers are tried in order and
// any failure falls through to the next; null means "no provider answered" and callers
// use their local heuristic instead.

// A slow or overloaded provider must never hang the app: give up and fall through.
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 25_000;

const PROVIDERS = [
  {
    name: 'Claude',
    enabled: () => process.env.ANTHROPIC_API_KEY,
    async call({ system, prompt, maxTokens }) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
          max_tokens: maxTokens,
          ...(system && { system }),
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      return (await res.json())?.content?.[0]?.text;
    },
  },
  {
    name: 'Gemini',
    enabled: () => process.env.GEMINI_API_KEY?.trim(),
    async call({ system, prompt, maxTokens }) {
      const key = process.env.GEMINI_API_KEY.trim();
      // AI Studio keys can start with "AIza" or "AQ."; only "ya29." is an OAuth access token.
      const isOAuth = key.startsWith('ya29.');
      // The "-latest" alias keeps working when Google retires a specific model version.
      const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Key goes in a header, not the URL, so it never lands in proxy or server logs.
        headers: { 'Content-Type': 'application/json', ...(isOAuth ? { Authorization: `Bearer ${key}` } : { 'x-goog-api-key': key }) },
        body: JSON.stringify({
          ...(system && { systemInstruction: { parts: [{ text: system }] } }),
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          // Newer Gemini models spend part of this budget on internal reasoning; leave headroom.
          generationConfig: { maxOutputTokens: maxTokens + 2048 },
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      const parts = (await res.json())?.candidates?.[0]?.content?.parts || [];
      return parts.map((p) => p.text || '').join('').trim();
    },
  },
  ...[
    ['Groq', 'GROQ_API_KEY', 'https://api.groq.com/openai/v1/chat/completions', 'GROQ_MODEL', 'llama-3.1-8b-instant'],
    ['OpenAI', 'OPENAI_API_KEY', 'https://api.openai.com/v1/chat/completions', 'OPENAI_MODEL', 'gpt-4o-mini'],
  ].map(([name, keyVar, url, modelVar, defaultModel]) => ({
    name,
    enabled: () => process.env[keyVar],
    async call({ system, prompt, maxTokens }) {
      const res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env[keyVar]}` },
        body: JSON.stringify({
          model: process.env[modelVar] || defaultModel,
          max_tokens: maxTokens,
          messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      return (await res.json())?.choices?.[0]?.message?.content;
    },
  })),
];

export const llmConfigured = () => PROVIDERS.some((p) => p.enabled());

export async function complete({ system, prompt, maxTokens = 800 }) {
  for (const p of PROVIDERS) {
    if (!p.enabled()) continue;
    try {
      const text = await p.call({ system, prompt, maxTokens });
      if (text?.trim()) return text.trim();
    } catch (e) {
      console.error(`[AI:${p.name}]`, e.message);
    }
  }
  return null;
}
