const crypto = require('crypto');

/**
 * Generate a deterministic seed for a topic on a given day.
 * Randomize mode generates a unique seed each call.
 * @param {number} topicId
 * @param {boolean} randomize
 * @returns {string} 12-char hex seed
 */
function makeSeed(topicId, randomize = false) {
  const base = randomize
    ? `${topicId}:${Date.now()}:${Math.random()}`
    : `${topicId}:${new Date().toISOString().slice(0, 10)}:v1`;
  return crypto.createHash('sha256').update(base).digest('hex').slice(0, 12);
}

module.exports = { makeSeed };
