const OpenAI = require('openai');

const apiKey = process.env.GROK_API_KEY;
const MODEL = process.env.GROK_MODEL || 'grok-3-mini-fast';

let client = null;
if (apiKey) {
  client = new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
  });
}

/**
 * Grok (xAI) provider — uses OpenAI-compatible API at api.x.ai.
 */
async function chatJSON(systemPrompt, userPrompt, temperature = 0) {
  if (!client) {
    throw Object.assign(new Error('Grok API key not configured'), { status: 503 });
  }

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices[0].message.content;

  // Clean any markdown wrapping
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  return JSON.parse(cleaned);
}

function isAvailable() {
  return !!apiKey;
}

module.exports = { chatJSON, isAvailable, name: 'grok', label: 'Grok (xAI)', icon: '⚡' };
