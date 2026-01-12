const { FILES } = require('../config/constants');
const { loadJSON, saveJSON } = require('./fileStorage');
const OpenAI = require('openai');
const { createCanvas } = require('canvas');

// OpenRouterクライアント初期化
let openRouterClient = null;

try {
  if (process.env.OPENROUTER_API_KEY) {
    openRouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    console.log('✓ OpenRouter client initialized');
  } else {
    console.warn('⚠ OPENROUTER_API_KEY not found in environment');
  }
} catch (err) {
  console.warn('⚠ Error initializing OpenRouter client:', err.message);
}

/**
 * ユーザー残高を取得
 * @param {string} userId - ユーザーID
 * @returns {object} 残高データ
 */
function getUserBalance(userId) {
  const balances = loadJSON(FILES.USER_BALANCES);
  const balance = balances[userId] || { tkup: 0, tkuc: 0, earnedHistory: [], lastPenalty: null };

  // データ構造の互換性を確保（古いデータ対応）
  if (!balance.earnedHistory) {
    balance.earnedHistory = [];
  }
  if (!balance.earnedTimestamps) {
    balance.earnedTimestamps = [];
  }

  return balance;
}

/**
 * ユーザー残高を保存
 * @param {string} userId - ユーザーID
 * @param {object} balance - 残高データ
 */
function saveUserBalance(userId, balance) {
  const balances = loadJSON(FILES.USER_BALANCES);
  balances[userId] = balance;
  saveJSON(FILES.USER_BALANCES, balances);
}

/**
 * TKUP獲得を計算
 * @param {string} content - メッセージ内容
 * @param {boolean} hasImage - 画像付きかどうか
 * @returns {number} 獲得TKUP
 */
function calculateTKUPGain(content, hasImage = false) {
  let gain = 0;

  if (hasImage) {
    gain += 8;
  }

  // テキスト投稿
  if (content && content.trim()) {
    const charCount = content.length;
    gain += 4 + Math.min(20, charCount);
  }

  return Math.floor(gain);
}

/**
 * TKUP獲得上限チェック（1時間1000TKUP）
 * @param {Array} history - 獲得履歴配列 [{timestamp, amount}, ...]
 * @returns {boolean} 上限内かどうか
 */
function checkTKUPHourlyLimit(history) {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  // 過去1時間の獲得履歴をフィルタ
  const recentHistory = history.filter(entry => now - entry.timestamp < oneHour);

  // 累計獲得量を計算
  let totalEarned = 0;
  recentHistory.forEach(entry => {
    totalEarned += entry.amount;
  });

  return totalEarned < 1000;
}

/**
 * TKUPを獲得
 * @param {string} userId - ユーザーID
 * @param {number} amount - 獲得量
 */
function earnTKUP(userId, amount) {
  const balance = getUserBalance(userId);
  balance.tkup += amount;
  balance.earnedHistory.push({ timestamp: Date.now(), amount });

  // 古い履歴を削除（過去24時間以上前）
  const oneDay = 24 * 60 * 60 * 1000;
  balance.earnedHistory = balance.earnedHistory.filter(entry => Date.now() - entry.timestamp < oneDay);

  saveUserBalance(userId, balance);
}

/**
 * TKUCレートを取得
 * @returns {object} レートデータ
 */
function getTKUCRate() {
  const rateData = loadJSON(FILES.TKUC_RATE);
  return rateData.currentRate || 500;
}

/**
 * TKUCレートを更新（プログラム計算）
 */
async function updateTKUCRate() {
  try {
    const currentRate = getTKUCRate();
    const rateData = loadJSON(FILES.TKUC_RATE);

    // プログラムで変動を生成（-10% ～ +10% のランダム変動）
    const changePercent = (Math.random() - 0.5) * 20; // -10% to +10%
    const minChange = 0.1; // 最小変動0.1%

    // 変動が小さすぎる場合は調整
    const adjustedChange = Math.abs(changePercent) < minChange ?
      (changePercent >= 0 ? minChange : -minChange) : changePercent;

    const newRate = currentRate * (1 + adjustedChange / 100);

    console.log('Rate calculation:', {
      current: currentRate,
      changePercent: adjustedChange.toFixed(2) + '%',
      newRate: newRate.toFixed(2)
    });

    // レート範囲チェック（最低100 TKUP、最高2000 TKUP）
    const clampedRate = Math.max(100, Math.min(2000, newRate));

    // レート更新
    rateData.currentRate = Math.round(clampedRate * 100) / 100; // 小数点2桁
    rateData.lastUpdate = Date.now();
    rateData.history = rateData.history || [];
    rateData.history.push({ timestamp: Date.now(), rate: rateData.currentRate });

    // 履歴を最新50件に制限
    if (rateData.history.length > 50) {
      rateData.history = rateData.history.slice(-50);
    }

    saveJSON(FILES.TKUC_RATE, rateData);
    console.log(`✅ TKUCレート更新成功: ${currentRate} → ${rateData.currentRate} TKUP (+${adjustedChange.toFixed(2)}%)`);

  } catch (error) {
    console.error('❌ TKUCレート更新エラー:', error.message);
    // フォールバック: 前回レート維持
  }
}

/**
 * TKUCを購入
 * @param {string} userId - ユーザーID
 * @param {number} tkucAmount - 購入TKUC量
 * @returns {object} 結果 {success, message, tkupSpent, tkucReceived}
 */
function buyTKUC(userId, tkucAmount) {
  const balance = getUserBalance(userId);
  const rate = getTKUCRate();

  // 手数料込みの必要TKUP
  const tkupNeeded = tkucAmount * rate * 1.05; // 5%手数料

  if (balance.tkup < tkupNeeded) {
    return { success: false, message: 'TKUP残高が不足しています。' };
  }

  // 取引実行
  balance.tkup -= tkupNeeded;
  balance.tkuc += tkucAmount;

  saveUserBalance(userId, balance);
  recordTransaction(userId, 'buy', { tkucAmount, tkupSpent: tkupNeeded, rate });

  return {
    success: true,
    message: `${tkucAmount} TKUCを購入しました。（${tkupNeeded} TKUP消費、手数料5%）`,
    tkupSpent: tkupNeeded,
    tkucReceived: tkucAmount
  };
}

/**
 * TKUPを送金
 * @param {string} fromUserId - 送信者ID
 * @param {string} toUserId - 受信者ID
 * @param {number} amount - 送金額
 * @returns {object} 結果
 */
function transferTKUP(fromUserId, toUserId, amount) {
  if (fromUserId === toUserId) {
    return { success: false, message: '自分自身には送金できません。' };
  }

  const fromBalance = getUserBalance(fromUserId);
  const toBalance = getUserBalance(toUserId);

  if (fromBalance.tkup < amount) {
    return { success: false, message: 'TKUP残高が不足しています。' };
  }

  // 取引実行
  fromBalance.tkup -= amount;
  toBalance.tkup += amount; // TKUPを受取人のtkupに加算

  saveUserBalance(fromUserId, fromBalance);
  saveUserBalance(toUserId, toBalance);

  recordTransaction(fromUserId, 'transfer_tkup', { toUserId, amount });
  recordTransaction(toUserId, 'receive_tkup', { fromUserId, amount });

  return { success: true, message: `${amount} TKUPを送金しました。` };
}

/**
 * TKUCを送金
 * @param {string} fromUserId - 送信者ID
 * @param {string} toUserId - 受信者ID
 * @param {number} amount - 送金額
 * @returns {object} 結果
 */
function transferTKUC(fromUserId, toUserId, amount) {
  if (fromUserId === toUserId) {
    return { success: false, message: '自分自身には送金できません。' };
  }

  const fromBalance = getUserBalance(fromUserId);
  const toBalance = getUserBalance(toUserId);

  if (fromBalance.tkuc < amount) {
    return { success: false, message: 'TKUC残高が不足しています。' };
  }

  // 取引実行
  fromBalance.tkuc -= amount;
  toBalance.tkuc += amount;

  saveUserBalance(fromUserId, fromBalance);
  saveUserBalance(toUserId, toBalance);

  recordTransaction(fromUserId, 'transfer_tkuc', { toUserId, amount });
  recordTransaction(toUserId, 'receive_tkuc', { fromUserId, amount });

  return { success: true, message: `${amount} TKUCを送金しました。` };
}

/**
 * TKUPを出金
 * @param {string} userId - ユーザーID
 * @param {number} amount - 出金額
 * @returns {object} 結果
 */
function withdrawTKUP(userId, amount) {
  const balance = getUserBalance(userId);

  if (balance.tkup < amount) {
    return { success: false, message: 'TKUP残高が不足しています。' };
  }

  // 手数料10%差し引き
  const withdrawAmount = amount * 0.9;

  balance.tkup -= amount;
  saveUserBalance(userId, balance);

  recordTransaction(userId, 'withdraw', { amount, withdrawAmount, fee: amount * 0.1 });

  return {
    success: true,
    message: `${withdrawAmount}円を出金しました。（手数料10%）`,
    withdrawn: withdrawAmount
  };
}

/**
 * TKUCギャンブル
 * @param {string} userId - ユーザーID
 * @param {number} betAmount - ベット額
 * @returns {object} 結果
 */
function gambleTKUC(userId, betAmount) {
  const balance = getUserBalance(userId);

  if (balance.tkuc < betAmount) {
    return { success: false, message: 'TKUC残高が不足しています。' };
  }

  // 2倍チャンス
  const won = Math.random() < 0.5;

  if (won) {
    balance.tkuc += betAmount; // ベット額獲得
    const result = { success: true, message: `🎉 勝利！ ${betAmount * 2} TKUCになりました！`, won: true };
    recordTransaction(userId, 'gamble_win', { betAmount, won: betAmount });
    saveUserBalance(userId, balance);
    return result;
  } else {
    balance.tkuc -= betAmount; // ベット額損失
    const result = { success: true, message: `💔 敗北... ${betAmount} TKUCを失いました。`, lost: betAmount };
    recordTransaction(userId, 'gamble_lose', { betAmount, lost: betAmount });
    saveUserBalance(userId, balance);
    return result;
  }
}

/**
 * 取引を記録
 * @param {string} userId - ユーザーID
 * @param {string} type - 取引タイプ
 * @param {object} details - 詳細データ
 */
function recordTransaction(userId, type, details) {
  const history = loadJSON(FILES.TRANSACTION_HISTORY);
  if (!history[userId]) {
    history[userId] = {};
  }
  if (!history[userId][type]) {
    history[userId][type] = [];
  }

  history[userId][type].push({
    ...details,
    timestamp: Date.now()
  });

  // 各タイプの履歴を最新100件に制限
  if (history[userId][type].length > 100) {
    history[userId][type] = history[userId][type].slice(-100);
  }

  saveJSON(FILES.TRANSACTION_HISTORY, history);
}

/**
 * レートチャートを生成
 * @param {number} points - データポイント数（デフォルト50）
 * @returns {Buffer} PNG画像バッファ
 */
function generateRateChart(points = 50) {
  const rateData = loadJSON(FILES.TKUC_RATE);
  const history = rateData.history || [];

  if (history.length === 0) {
    // 履歴がない場合はデフォルトチャート
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 800, 400);

    ctx.fillStyle = '#000000';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('レートデータがありません', 400, 200);

    return canvas.toBuffer('image/png');
  }

  // 最新points件を取得
  const data = history.slice(-points);
  const rates = data.map(h => h.rate);
  const timestamps = data.map(h => h.timestamp);

  // チャートサイズ
  const width = 800;
  const height = 400;
  const padding = 60;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 枠線
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, width, height);

  // データ範囲計算
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const rateRange = maxRate - minRate || 1;

  // スケール関数
  const dataLength = Math.max(data.length - 1, 1);
  const xScale = (index) => padding + (index / dataLength) * (width - 2 * padding);
  const yScale = (rate) => height - padding - ((rate - minRate) / rateRange) * (height - 2 * padding);

  // グリッド線
  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 1;

  // 水平グリッド
  for (let i = 0; i <= 5; i++) {
    const y = padding + (i / 5) * (height - 2 * padding);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  // 垂直グリッド
  for (let i = 0; i <= 10; i++) {
    const x = padding + (i / 10) * (width - 2 * padding);
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
  }

  // チャートライン
  ctx.strokeStyle = '#007bff';
  ctx.lineWidth = 3;
  ctx.beginPath();

  rates.forEach((rate, index) => {
    const x = xScale(index);
    const y = yScale(rate);

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // データポイント
  ctx.fillStyle = '#007bff';
  rates.forEach((rate, index) => {
    const x = xScale(index);
    const y = yScale(rate);

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
  });

  // 軸ラベル
  ctx.fillStyle = '#000000';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';

  // Y軸ラベル（レート）
  const yLabels = 5;
  for (let i = 0; i <= yLabels; i++) {
    const rate = minRate + (rateRange / yLabels) * i;
    const y = height - padding - (i / yLabels) * (height - 2 * padding);
    ctx.textAlign = 'right';
    ctx.fillText(rate.toFixed(1), padding - 10, y + 5);
  }

  // X軸ラベル（時間）- 日本時間表示
  ctx.textAlign = 'center';
  ctx.font = '12px "MS Gothic", "Yu Gothic", "Meiryo", Arial, sans-serif';
  const timeLabels = Math.min(5, Math.max(data.length, 1));
  for (let i = 0; i < timeLabels; i++) {
    const totalIndex = Math.max(data.length - 1, 1);
    const index = Math.floor((i / (timeLabels - 1 || 1)) * totalIndex);
    const x = xScale(index);
    const date = new Date(timestamps[index]);
    // 日本時間で表示（UTC+9）
    const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    const time = jstDate.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    });
    ctx.fillText(time, x, height - padding + 20);
  }

  // タイトル
  ctx.font = '18px "MS Gothic", "Yu Gothic", "Meiryo", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TKUCレート推移', width / 2, 30);

  // 現在のレート表示
  const currentRate = rates[rates.length - 1];
  const prevRate = rates[rates.length - 2] || currentRate;
  const change = currentRate - prevRate;
  const changePercent = ((change / prevRate) * 100);

  ctx.font = '14px "MS Gothic", "Yu Gothic", "Meiryo", Arial, sans-serif';
  ctx.fillText(`現在: ${currentRate} TKUP (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`,
               width / 2, height - 10);

  return canvas.toBuffer('image/png');
}

/**
 * 残高情報をフォーマット
 * @param {string} userId - ユーザーID
 * @returns {string} フォーマット済み文字列
 */
function formatBalance(userId) {
  const balance = getUserBalance(userId);

  // 過去1時間の獲得量を計算
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const recentHistory = balance.earnedHistory.filter(entry => now - entry.timestamp < oneHour);
  let totalEarned = 0;
  recentHistory.forEach(entry => {
    totalEarned += entry.amount;
  });

  const remaining = Math.max(0, 1000 - totalEarned);

  // リセットまでの残り時間を計算
  let resetInfo = '上限未到達';
  if (recentHistory.length > 0) {
    const earliestTimestamp = Math.min(...recentHistory.map(entry => entry.timestamp));
    const resetTimestamp = earliestTimestamp + oneHour;
    const remainingMs = resetTimestamp - now;

    if (remainingMs > 0) {
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      resetInfo = `${remainingMinutes}分後`;
    } else {
      resetInfo = 'リセット済み';
    }
  }

  return `TKUP: ${balance.tkup} | TKUC: ${balance.tkuc.toFixed(2)}\n` +
         `1時間上限残り: ${remaining} TKUP (${resetInfo})`;
}

/**
 * レート更新を手動テスト（デバッグ用）
 */
async function testRateUpdate() {
  console.log('🧪 レート更新テスト開始...');
  await updateTKUCRate();
  console.log('🧪 テスト完了');
}

/**
 * AI接続テスト（デバッグ用）
 */
async function testAIConnection() {
  console.log('🧪 AI接続テスト開始...');

  if (!openRouterClient) {
    console.error('❌ OpenRouter client not initialized');
    return;
  }

  try {
    const completion = await openRouterClient.chat.completions.create({
      model: 'openai/gpt-oss-120b:free',
      messages: [{ role: 'user', content: 'Say only: 42' }],
      max_tokens: 10,
    });

    const response = completion.choices[0].message.content.trim();
    console.log('✅ AI Response:', response);

  } catch (error) {
    console.error('❌ AI Test Error:', error.message);
  }

  console.log('🧪 AI接続テスト完了');
}

module.exports = {
  getUserBalance,
  saveUserBalance,
  calculateTKUPGain,
  checkTKUPHourlyLimit,
  earnTKUP,
  getTKUCRate,
  updateTKUCRate,
  buyTKUC,
  transferTKUP,
  transferTKUC,
  withdrawTKUP,
  gambleTKUC,
  recordTransaction,
  formatBalance,
  generateRateChart,
  testRateUpdate, // デバッグ用
  testAIConnection, // デバッグ用
};
