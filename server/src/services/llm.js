const OpenAI = require('openai');

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn('[LLM] ⚠️  OPENAI_API_KEY not set — LLM calls will fail. Set it in .env');
}

const openai = new OpenAI({ apiKey: apiKey || 'sk-missing' });

/**
 * Call OpenAI chat completion with JSON mode.
 * Includes retry logic and clear error messages.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} temperature
 * @param {number} retries
 * @returns {Promise<object>} parsed JSON response
 */
async function chatJSON(systemPrompt, userPrompt, temperature = 0, retries = 2) {
  if (!apiKey) {
    throw Object.assign(new Error('OpenAI API key not configured. Set OPENAI_API_KEY in .env'), { status: 503 });
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const raw = completion.choices[0].message.content;
      return JSON.parse(raw);
    } catch (err) {
      const isRetryable = err.status === 429 || err.status === 500 || err.status === 503 || err.code === 'ECONNRESET';

      if (isRetryable && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000; // exponential backoff: 1s, 2s
        console.warn(`[LLM] Retryable error (attempt ${attempt + 1}/${retries + 1}): ${err.message}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Map common errors to user-friendly messages
      if (err.status === 401) {
        throw Object.assign(new Error('Invalid OpenAI API key. Check your OPENAI_API_KEY.'), { status: 503 });
      }
      if (err.status === 429) {
        throw Object.assign(new Error('OpenAI rate limit exceeded. Please try again in a moment.'), { status: 429 });
      }
      if (err.status === 402) {
        throw Object.assign(new Error('OpenAI billing quota exceeded. Add credits at platform.openai.com.'), { status: 503 });
      }

      console.error('[LLM] Error:', err.message);
      throw Object.assign(new Error(`AI generation failed: ${err.message}`), { status: err.status || 500 });
    }
  }
}

module.exports = { chatJSON };
