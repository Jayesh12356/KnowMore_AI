const OpenAI = require('openai');

const apiKey = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

let client = null;
if (apiKey) {
  client = new OpenAI({ apiKey });
}

/**
 * OpenAI provider — uses gpt-4o-mini with JSON mode.
 */
async function chatJSON(systemPrompt, userPrompt, temperature = 0) {
  if (!client) {
    throw Object.assign(new Error('OpenAI API key not configured'), { status: 503 });
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
  return JSON.parse(raw);
}

function isAvailable() {
  return !!apiKey;
}

module.exports = { chatJSON, isAvailable, name: 'openai', label: 'OpenAI GPT', icon: '🤖' };
