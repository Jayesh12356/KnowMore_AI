const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

let client = null;
if (apiKey) {
  client = new GoogleGenerativeAI(apiKey);
}

/**
 * Google Gemini provider — uses gemini-2.0-flash.
 * Wraps generateContent into the standard chatJSON interface.
 */
async function chatJSON(systemPrompt, userPrompt, temperature = 0) {
  if (!client) {
    throw Object.assign(new Error('Gemini API key not configured'), { status: 503 });
  }

  const model = client.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
    },
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userPrompt);
  const raw = result.response.text();

  // Parse JSON — Gemini may wrap in markdown code blocks
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  return JSON.parse(cleaned);
}

function isAvailable() {
  return !!apiKey;
}

module.exports = { chatJSON, isAvailable, name: 'gemini', label: 'Google Gemini', icon: '✨' };
