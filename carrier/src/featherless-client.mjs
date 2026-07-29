// featherless-client.mjs
//
// The honest role of the Featherless key in Zariia. Featherless
// (api.featherless.ai/v1, OpenAI-compatible) serves open-weight LLMs — the same
// account zetizeti already uses. It has NOTHING to do with audio compression (that is
// the local neural codec in ../compress). Its place here is the language layer: the
// model behind the messaging tool that the sealed channel is meant to carry, and any
// text work around a drop (a liner note, a scene bulletin, a bundled NOTE entry).
//
// Scope note (CLAUDE.md ): a model must NEVER sit in the trust/routing path
// client is for *content authored around* the object, not for deciding what to relay,
// drop or display. Keep that line.
//
// Model choice follows the global rule (~/CLAUDE.md "AI Model Selection"): cheapest
// capable open-weight model, no vendor mandate. Default below is a small open model;
// swap freely.
//
// The key is read from the FEATHERLESS_API_KEY environment variable. It is NOT
// hardcoded and NOT committed — see .env (gitignored) and .env.example.

const BASE = 'https://api.featherless.ai/v1';
const DEFAULT_MODEL = 'Qwen/Qwen3-30B-A3B-Instruct-2507';

function key() {
  const k = process.env.FEATHERLESS_API_KEY;
  if (!k) throw new Error('FEATHERLESS_API_KEY is not set. Copy .env.example to .env and fill it in.');
  return k;
}

/**
 * One chat completion against an open-weight model on Featherless.
 * @param {Array<{role:string, content:string}>} messages
 * @param {{model?:string, temperature?:number, max_tokens?:number}} [opts]
 * @returns {Promise<string>}
 */
export async function chat(messages, opts = {}) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key()}` },
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 512,
    }),
  });
  if (!res.ok) throw new Error(`Featherless ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/** List models the account can serve (sanity check that the key works). */
export async function listModels() {
  const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${key()}` } });
  if (!res.ok) throw new Error(`Featherless ${res.status}: ${await res.text()}`);
  return res.json();
}

// CLI smoke test: `node src/featherless-client.mjs "write a two-line liner note"`
if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv.slice(2).join(' ') || 'Say the single word: ok';
  chat([{ role: 'user', content: prompt }])
    .then((r) => console.log(r))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
