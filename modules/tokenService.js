const crypto = require('crypto');
const { FILES } = require('../constants');
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

function resolveAccessKey(accessKey) {
  if (!accessKey) return null;

  const tokens = loadJSON(FILES.PRIVATE_TOKENS);
  for (const [guildId, guildData] of Object.entries(tokens)) {
    for (const [userId, tokenData] of Object.entries(guildData)) {
      if (tokenData.accessKey === accessKey) {
        return { guildId, userId, tokenData };
      }
    }
  }
  return null;
}

function generateApiKeys() {
  const accessKey = crypto.randomBytes(16).toString('hex').toUpperCase();
  const secretKey = crypto.randomBytes(32).toString('hex');

  return {
    accessKey: `TKU-${accessKey}`,
    secretKey
  };
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

function getOrCreateApiKeys(guildId, userId) {
  const tokens = loadJSON(FILES.PRIVATE_TOKENS);
  if (!tokens[guildId]) tokens[guildId] = {};

  if (!tokens[guildId][userId] || !tokens[guildId][userId].accessKey) {
    const keys = generateApiKeys();
    tokens[guildId][userId] = {
      ...tokens[guildId][userId], // 既存のtokenを保持
      accessKey: keys.accessKey,
      secretKey: keys.secretKey,
      createdAt: Date.now()
    };
    saveJSON(FILES.PRIVATE_TOKENS, tokens);
  }

  return tokens[guildId][userId];
}

function verifyApiSignature(accessKey, signature, timestamp, body) {
  const userData = resolveAccessKey(accessKey);
  if (!userData) return false;

  const secretKey = userData.secretKey;
  const message = timestamp + JSON.stringify(body);

  const expectedSignature = crypto.createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');

  return signature === expectedSignature;
}

module.exports = {
  resolveToken,
  resolveAccessKey,
  getOrCreateToken,
  getOrCreateApiKeys,
  verifyApiSignature
};
