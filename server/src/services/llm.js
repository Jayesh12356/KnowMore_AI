/**
 * LLM service — provider-agnostic chat completion with fallback.
 *
 * chatJSON(systemPrompt, userPrompt, temperature?, providerName?)
 *   → tries requested provider, falls back to default on failure.
 */
const { getProvider, getDefaultProviderName } = require('./providers');

/**
 * Call LLM chat completion with JSON mode.
 * Routes to the requested provider with automatic fallback.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} temperature
 * @param {string} [providerName] — optional provider name (uses default if omitted)
 * @param {number} [retries=2] — retries per provider
 * @returns {Promise<object>} parsed JSON response
 */
async function chatJSON(systemPrompt, userPrompt, temperature = 0, providerName = null, retries = 2) {
  const defaultName = getDefaultProviderName();
  const requestedName = providerName || defaultName;

  if (!requestedName) {
    throw Object.assign(new Error('No LLM provider configured. Set at least one API key in .env'), { status: 503 });
  }

  // Try requested provider first
  try {
    return await callWithRetries(requestedName, systemPrompt, userPrompt, temperature, retries);
  } catch (primaryErr) {
    // If requested provider is not the default, try fallback
    if (requestedName !== defaultName && defaultName) {
      console.warn(`[LLM] ${requestedName} failed: ${primaryErr.message}. Falling back to ${defaultName}...`);
      try {
        return await callWithRetries(defaultName, systemPrompt, userPrompt, temperature, retries);
      } catch (fallbackErr) {
        console.error(`[LLM] Fallback ${defaultName} also failed: ${fallbackErr.message}`);
        throw Object.assign(
          new Error(`AI generation failed. Both ${requestedName} and ${defaultName} are unavailable.`),
          { status: 503 }
        );
      }
    }
    throw primaryErr;
  }
}

/**
 * Call a specific provider with retry logic.
 */
async function callWithRetries(providerName, systemPrompt, userPrompt, temperature, retries) {
  const provider = getProvider(providerName);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await provider.chatJSON(systemPrompt, userPrompt, temperature);
    } catch (err) {
      const isRetryable =
        err.status === 429 || err.status === 500 || err.status === 503 ||
        err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';

      if (isRetryable && attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[LLM:${providerName}] Retryable error (${attempt + 1}/${retries + 1}): ${err.message}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Map common errors
      if (err.status === 401) {
        throw Object.assign(new Error(`Invalid ${providerName} API key. Check your environment variables.`), { status: 503 });
      }
      if (err.status === 429) {
        throw Object.assign(new Error(`${providerName} rate limit exceeded. Try again shortly.`), { status: 429 });
      }
      if (err.status === 402) {
        throw Object.assign(new Error(`${providerName} billing quota exceeded.`), { status: 503 });
      }

      console.error(`[LLM:${providerName}] Error:`, err.message);
      throw Object.assign(new Error(`${providerName} generation failed: ${err.message}`), { status: err.status || 500 });
    }
  }
}

module.exports = { chatJSON };
