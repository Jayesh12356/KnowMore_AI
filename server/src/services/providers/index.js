/**
 * Provider registry — dynamically discovers which providers are configured.
 */
const openai = require('./openai');
const gemini = require('./gemini');
const grok = require('./grok');

const ALL_PROVIDERS = [openai, gemini, grok];

/**
 * Get a provider by name. Throws if not found or not configured.
 */
function getProvider(name) {
  const provider = ALL_PROVIDERS.find(p => p.name === name);
  if (!provider) {
    throw Object.assign(new Error(`Unknown provider: ${name}`), { status: 400 });
  }
  if (!provider.isAvailable()) {
    throw Object.assign(new Error(`Provider ${name} is not configured (missing API key)`), { status: 503 });
  }
  return provider;
}

/**
 * Get list of all available (configured) providers.
 */
function getAvailableProviders() {
  return ALL_PROVIDERS
    .filter(p => p.isAvailable())
    .map(p => ({ name: p.name, label: p.label, icon: p.icon }));
}

/**
 * Get the default provider name.
 */
function getDefaultProviderName() {
  const envDefault = (process.env.LLM_DEFAULT_PROVIDER || '').toLowerCase();
  if (envDefault) {
    const provider = ALL_PROVIDERS.find(p => p.name === envDefault);
    if (provider && provider.isAvailable()) return provider.name;
  }
  // Fall back to first available
  const first = ALL_PROVIDERS.find(p => p.isAvailable());
  return first ? first.name : null;
}

// Log available providers on startup
const available = getAvailableProviders();
console.log(`[LLM] Available providers: ${available.map(p => p.label).join(', ') || 'NONE — set API keys in .env'}`);
console.log(`[LLM] Default provider: ${getDefaultProviderName() || 'NONE'}`);

module.exports = { getProvider, getAvailableProviders, getDefaultProviderName };
