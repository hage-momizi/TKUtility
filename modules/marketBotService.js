const { FILES } = require('../config/constants');
const { loadJSON, saveJSON } = require('./fileStorage');
const { buyTKUC } = require('./economyService');

// MarketBot設定
const BOT_USER_ID = 'market_bot'; // BOTのユーザーID
const INACTIVE_TIMEOUT = 10 * 60 * 1000; // 10分
const ACTION_INTERVAL_MIN = 3 * 60 * 1000; // 3分
const ACTION_INTERVAL_MAX = 10 * 60 * 1000; // 10分
const MAX_ACTIONS_PER_HOUR = 12; // 1時間あたり最大12回
const SPEAK_PROBABILITY = 0.25; // 発言確率25%

// BOT状態
let isRunning = false;
let lastHumanActivity = Date.now();
let actionTimer = null;
let actionCountThisHour = 0;
let lastActionTime = 0;

// BOTの発言リスト
const BOT_SPEECHES = [
  'ちょっと安い気がした',
  '最近静かだな',
  '上がりすぎな気もする',
  '下がりすぎな気もする',
  '今が買い時かも',
  '今が売り時かも',
  '相場が面白いね',
  'しばらく観察してみよう',
];

/**
 * BOTチャンネルを取得
 * @param {string} guildId - ギルドID
 * @param {object} client - Discordクライアント
 * @returns {object|null} チャンネルオブジェクトまたはnull
 */
function getBotChannel(guildId, client) {
  try {
    const config = loadJSON(FILES.BOT_CHANNEL_CONFIG);
    const channelId = config[guildId]?.botSpeakChannelId;

    if (channelId && client.channels.cache.has(channelId)) {
      return client.channels.cache.get(channelId);
    }
  } catch (error) {
    console.error('BOTチャンネル取得エラー:', error.message);
  }
  return null;
}

/**
 * BOTの発言を送信
 * @param {string} message - 発言内容
 * @param {string} guildId - ギルドID
 * @param {object} client - Discordクライアント
 */
async function sendBotMessage(message, guildId, client) {
  const channel = getBotChannel(guildId, client);
  if (channel) {
    try {
      await channel.send(`🤖 MarketBot: ${message}`);
      console.log(`🤖 BOT発言: ${message}`);
    } catch (error) {
      console.error('BOT発言エラー:', error.message);
    }
  }
}

/**
 * BOT取引を実行
 * @param {string} guildId - ギルドID
 * @param {object} client - Discordクライアント
 */
async function performBotTrade(guildId, client) {
  try {
    // レート取得
    const rateData = loadJSON(FILES.TKUC_RATE);
    const currentRate = rateData.currentRate || 500;

    // 取引量決定（1-5 TKUC）
    const tradeAmount = Math.floor(Math.random() * 5) + 1;

    // 必要TKUP計算
    const requiredTKUP = tradeAmount * currentRate * 1.03; // 手数料込み

    // BOT残高確認（仮想残高として常に十分）
    const botBalance = { tkup: 100000, tkuc: 1000 }; // 仮想残高

    if (botBalance.tkup < requiredTKUP) {
      console.log('🤖 BOT取引スキップ: TKUP不足');
      return false;
    }

    // 取引実行
    const result = buyTKUC(BOT_USER_ID, tradeAmount);

    if (result.success) {
      // 取引ログ送信
      const channel = getBotChannel(guildId, client);
      if (channel) {
        await channel.send(`🤖 MarketBot が ${tradeAmount} TKUC を買いました`);
      }
      console.log(`🤖 BOT取引: ${tradeAmount} TKUC 購入`);
      return true;
    } else {
      console.log('🤖 BOT取引失敗:', result.message);
      return false;
    }
  } catch (error) {
    console.error('BOT取引エラー:', error.message);
    return false;
  }
}

/**
 * BOT行動実行
 * @param {string} guildId - ギルドID
 * @param {object} client - Discordクライアント
 */
async function performBotAction(guildId, client) {
  // 1時間あたりの行動回数制限
  const now = Date.now();
  if (now - lastActionTime > 60 * 60 * 1000) {
    actionCountThisHour = 0;
  }

  if (actionCountThisHour >= MAX_ACTIONS_PER_HOUR) {
    console.log('🤖 BOT行動スキップ: 1時間上限到達');
    return;
  }

  actionCountThisHour++;
  lastActionTime = now;

  // 取引実行
  const tradeSuccess = await performBotTrade(guildId, client);

  // 発言（取引成功時のみ、または独立）
  if (Math.random() < SPEAK_PROBABILITY) {
    const speech = BOT_SPEECHES[Math.floor(Math.random() * BOT_SPEECHES.length)];
    await sendBotMessage(speech, guildId, client);
  }
}

/**
 * BOTを起動
 * @param {string} guildId - ギルドID
 * @param {object} client - Discordクライアント
 */
function startBot(guildId, client) {
  if (isRunning) {
    console.log('🤖 BOT起動スキップ: 既に実行中');
    return;
  }

  console.log('🤖 MarketBot 起動');
  isRunning = true;
  lastHumanActivity = Date.now();

  // 定期行動タイマー設定
  const scheduleNextAction = () => {
    if (!isRunning) return;

    const delay = Math.random() * (ACTION_INTERVAL_MAX - ACTION_INTERVAL_MIN) + ACTION_INTERVAL_MIN;
    actionTimer = setTimeout(async () => {
      // 非アクティブ時間が10分以上なら行動
      if (Date.now() - lastHumanActivity >= INACTIVE_TIMEOUT) {
        await performBotAction(guildId, client);
      }
      scheduleNextAction();
    }, delay);
  };

  scheduleNextAction();
}

/**
 * BOTを停止
 */
function stopBot() {
  if (!isRunning) return;

  console.log('🤖 MarketBot 停止');
  isRunning = false;

  if (actionTimer) {
    clearTimeout(actionTimer);
    actionTimer = null;
  }
}

/**
 * 人間の活動を検知（BOT停止トリガー）
 */
function onHumanActivity() {
  lastHumanActivity = Date.now();
  if (isRunning) {
    stopBot();
  }
}

/**
 * BOT状態を取得
 * @returns {object} BOT状態
 */
function getBotStatus() {
  return {
    isRunning,
    lastHumanActivity,
    actionCountThisHour,
    timeSinceLastActivity: Date.now() - lastHumanActivity,
  };
}

module.exports = {
  startBot,
  stopBot,
  onHumanActivity,
  getBotStatus,
  getBotChannel,
};
