const { FILES } = require('../config/constants');
const { loadJSON, saveJSON } = require('./fileStorage');

function resolveToken(token) {
  if (!token) return null;

  const tokens = loadJSON(FILES.PRIVATE_TOKENS);
  for (const [guildId, guildData] of Object.entries(tokens)) {
    for (const [userId, tokenData] of Object.entries(guildData)) {
      if (tokenData.token === token) {
        return { guildId, userId, tokenData };
      }
    }
  }
  return null;
}

function getOrCreateToken(guildId, userId, generator) {
  const tokens = loadJSON(FILES.PRIVATE_TOKENS);
  if (!tokens[guildId]) tokens[guildId] = {};

  if (!tokens[guildId][userId]) {
    tokens[guildId][userId] = {
      token: generator(),
      createdAt: Date.now()
    };
    saveJSON(FILES.PRIVATE_TOKENS, tokens);
  }

  return tokens[guildId][userId];
}

module.exports = {
  resolveToken,
  getOrCreateToken
};
