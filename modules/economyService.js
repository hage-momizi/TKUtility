const { FILES } = require('../config/constants');
const { loadJSON, saveJSON } = require('./fileStorage');
const OpenAI = require('openai');
const { createCanvas } = require('canvas');

// AIクライアント初期化関数
function initializeAIClient() {
  const aiConfig = loadJSON(FILES.AI_CONFIG) || { provider: 'openrouter' };
  const provider = aiConfig.provider || 'openrouter';

  try {
    if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
      return new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
      });
    } else if (provider === 'perplexity' && process.env.PERPLEXITY_API_KEY) {
      return new OpenAI({
        baseURL: 'https://api.perplexity.ai',
        apiKey: process.env.PERPLEXITY_API_KEY,
      });
    } else {
      console.warn(`⚠ AI provider ${provider} not available or API key missing`);
      return null;
    }
  } catch (err) {
    console.warn('⚠ Error initializing AI client:', err.message);
    return null;
  }
}

// AIクライアント（動的初期化）
let aiClient = initializeAIClient();

// オーダーブック・取引履歴最終リセット時刻
let lastOrderBookReset = Date.now();
let lastTransactionHistoryReset = Date.now();
const ORDER_BOOK_RESET_INTERVAL = 24 * 60 * 60 * 1000; // 24時間
const TRANSACTION_RESET_INTERVAL = 24 * 60 * 60 * 1000; // 24時間

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
 * TKUP獲得量を計算
 * @param {string} content - メッセージ内容
 * @param {boolean} hasImage - 画像付きかどうか
 * @returns {number} 獲得TKUP量
 */
function calculateTKUPGain(content, hasImage) {
  let gain = 0;

  if (hasImage) {
    gain += 8; // 画像投稿ボーナス
  }

  if (content && content.trim()) {
    const charCount = content.length;
    gain += 4 + Math.min(20, charCount); // テキストメッセージ基本 + 文字数ボーナス
  }

  return Math.floor(gain);
}

/**
 * 基準価格を取得（移動平均フェア価格）
 * @returns {number} 基準価格
 */
function getFairPrice() {
  const rateData = loadJSON(FILES.TKUC_RATE);
  return rateData.fairPrice || 5000; // 移動平均フェア価格を返す
}

/**
 * 需要影響を計算（tick方式）
 * @param {number} netDemand - 正味需要
 * @param {object} marketData - 市場データ
 * @returns {number} 需要影響（±0.5%程度）
 */
function calculateDemandImpact(netDemand, marketData) {
  if (netDemand === 0) return 0;

  // 過去10分の需要を ±0.5%程度の影響に変換（5倍強化）
  const demandScale = 0.005; // 1需要あたり0.005%
  let impact = netDemand * demandScale;

  // 最大±0.5%に制限
  return Math.max(-0.5, Math.min(0.5, impact));
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

  // ブースター適用
  const booster = getActiveBooster(userId);
  if (booster) {
    amount = Math.floor(amount * booster.multiplier);
  }

  balance.tkup += amount;
  balance.earnedHistory.push({ timestamp: Date.now(), amount });

  // 古い履歴を削除（過去24時間以上前）
  const oneDay = 24 * 60 * 60 * 1000;
  balance.earnedHistory = balance.earnedHistory.filter(entry => Date.now() - entry.timestamp < oneDay);

  saveUserBalance(userId, balance);
}

/**
 * カジノデイリーボーナスチェック・付与
 * @param {string} userId - ユーザーID
 * @returns {object} ボーナス情報 {claimed: boolean, amount: number}
 */
function checkCasinoDailyBonus(userId) {
  const balance = getUserBalance(userId);
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD形式

  // 今日初めてのカジノプレイかをチェック
  if (balance.lastCasinoPlay !== today) {
    // デイリーボーナス付与
    const bonusAmount = 500;
    balance.tkup += bonusAmount;
    balance.lastCasinoPlay = today;

    saveUserBalance(userId, balance);

    recordTransaction(userId, 'casino_daily_bonus', {
      amount: bonusAmount,
      date: today
    });

    console.log(`🎰 カジノデイリーボーナス: ${userId} (+${bonusAmount} TKUP)`);

    return { claimed: true, amount: bonusAmount };
  }

  return { claimed: false, amount: 0 };
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
 * 動的上限を計算
 * @param {object} marketData - 市場データ
 * @returns {number} 動的上限レート
 */
function getDynamicUpperLimit(marketData) {
  const baseLimit = 1000; // 基本上限
  const userCount = marketData.userCount || 1;
  const totalTKUP = marketData.totalTKUP || 0;

  // ユーザー数に応じて上限を引き上げる
  const userMultiplier = Math.min(5, Math.max(1, Math.sqrt(userCount) / 2));

  // 総TKUP量に応じて上限を引き上げる
  const tkupMultiplier = Math.min(3, Math.max(1, Math.log10(totalTKUP + 1) / 2));

  const dynamicLimit = Math.floor(baseLimit * userMultiplier * tkupMultiplier);

  // 最低1000、最高10000
  return Math.min(10000, Math.max(1000, dynamicLimit));
}

// トレンド慣性用変数
let lastRateChange = 0;

// マーケット状態管理
let marketState = {
  regime: 1.0,           // 現在の機嫌倍率
  nextRegimeChange: 0,   // 次回変更時刻
  trendPower: 0          // トレンド強さ
};

// レジーム定義
const REGIMES = {
  calm: 0.5,     // おとなしい
  normal: 1.0,   // 普通
  wild: 1.8,     // 荒れてる
  crazy: 3.0     // バブル/クラッシュ
};

/**
 * TKUCレートを更新（tick方式 - 2秒ごと）
 */
async function updateTKUCRate() {
  try {
    // 24時間ごとのオーダーブック自動リセット
    const now = Date.now();
    if (now - lastOrderBookReset >= ORDER_BOOK_RESET_INTERVAL) {
      console.log('📊 24時間経過: オーダーブックをリセットします');
      const orderBook = getOrderBook();

      // 全ユーザーに対して、ロック済みの金額を返却
      for (const order of [...orderBook.buyOrders, ...orderBook.sellOrders]) {
        const balance = getUserBalance(order.userId);
        if (order.type === 'buy') {
          balance.tkup += order.remaining * order.price; // ロック済みTKUPを返却
        } else if (order.type === 'sell') {
          balance.tkuc += order.remaining; // ロック済みTKUCを返却
        }
        saveUserBalance(order.userId, balance);
      }

      // オーダーブックをリセット
      saveJSON(FILES.ORDER_BOOK, { buyOrders: [], sellOrders: [] });
      lastOrderBookReset = now;
      console.log('✅ オーダーブック自動リセット完了（ユーザーにロック額を返却）');
    }

    // 24時間ごとの取引履歴リセット（レート計算用データをリセット）
    if (now - lastTransactionHistoryReset >= TRANSACTION_RESET_INTERVAL) {
      console.log('📊 24時間経過: レート計算用取引履歴をリセットします');
      const history = loadJSON(FILES.TRANSACTION_HISTORY);

      // 全ユーザーの取引履歴をクリア（レート計算に使う過去取引データをリセット）
      for (const userId in history) {
        history[userId] = {};
      }

      saveJSON(FILES.TRANSACTION_HISTORY, history);
      lastTransactionHistoryReset = now;
      console.log('✅ レート計算用取引履歴リセット完了');
    }

    const currentRate = getTKUCRate();
    const rateData = loadJSON(FILES.TKUC_RATE);

    // フェア価格を移動平均更新（高速化）
    if (!rateData.fairPrice) rateData.fairPrice = 5000; // 初回初期化
    rateData.fairPrice = rateData.fairPrice * 0.99 + currentRate * 0.01;
    const fairPrice = rateData.fairPrice;

    // 市場状況を取得
    const marketData = analyzeMarketCondition();

    // 新しい要因を取得
    const chatActivity = analyzeChatActivity(); // チャット盛り上がり度
    const top3Ratio = analyzeTop3Ratio(); // 上位3人の保有割合
    const recentTrades = getRecentTradeCount(); // 最近の取引数
    const netDemand = getNetDemand(); // 正味需要（買-売）

    console.log(`🔍 デバッグ: recentTrades=${recentTrades}, chatActivity=${chatActivity.toFixed(1)}, top3Ratio=${top3Ratio.toFixed(2)}, netDemand=${netDemand}`);

    let changePercent;

    // シンプル計算のみを使用（安定性重視）
    console.log('📊 プログラム計算を使用');
    changePercent = calculateSmartRateChange(marketData, chatActivity, top3Ratio, recentTrades, netDemand);
    console.log(`📊 スマート計算: ${changePercent.toFixed(2)}%`);

    // 追加の市場調整（売り圧力影響を大幅緩和）
    const pressureDiff = marketData.buyPressure - marketData.sellPressure;
    if (pressureDiff > 0) {
      changePercent += Math.min(0.5, pressureDiff * 0.02); // 0.1 → 0.02に緩和（5分の1）
    } else if (pressureDiff < 0) {
      changePercent += Math.max(-0.5, pressureDiff * 0.02); // 0.1 → 0.02に緩和（5分の1）
    }

    // トレンド抑制（緩和）
    const recentChanges = getRecentRateChanges();
    if (recentChanges.length >= 3) {
      const avgChange = recentChanges.reduce((a, b) => a + b, 0) / recentChanges.length;
      if (Math.abs(avgChange) > 3) {
        changePercent -= avgChange * 0.05;
      }
    }

    // 最小変動保証
    const minChange = 0.05; // 0.05%
    if (Math.abs(changePercent) < minChange) {
      changePercent = changePercent >= 0 ? minChange : -minChange;
    }

    // 変動幅を制限（最大±5%）
    changePercent = Math.max(-5, Math.min(5, changePercent));

    // 自動調整：上限接近時の追加下降圧力
    const upperLimit = getDynamicUpperLimit(marketData);
    const lowerLimit = 100;

    if (currentRate > upperLimit * 0.95) { // 上限の95%を超えたら
      const excessRatio = (currentRate - upperLimit * 0.95) / (upperLimit * 0.05);
      const additionalPressure = Math.min(2, excessRatio * 2); // 最大-2%追加
      changePercent -= additionalPressure;
      console.log(`📈 上限接近調整: -${additionalPressure.toFixed(2)}%追加下降`);
    }

    // 常時更新のため間隔制御を削除

    // 下限保護強化（クッション化）
    if (currentRate <= lowerLimit * 1.1) { // 下限の110%以下
      // 強制的に上昇させる（最低+0.3%保証）- バネからクッションへ
      changePercent = Math.max(0.3, changePercent);
      console.log(`🚨 下限保護発動: 強制上昇 +${changePercent.toFixed(2)}%`);
    } else if (currentRate < lowerLimit * 1.2) { // 下限の120%未満
      // 通常の下限接近調整
      const deficitRatio = (lowerLimit * 1.2 - currentRate) / (lowerLimit * 0.2);
      const additionalBoost = Math.min(0.5, deficitRatio * 0.5); // 最大+0.5%追加
      changePercent += additionalBoost;
      console.log(`📉 下限接近調整: +${additionalBoost.toFixed(1)}%追加上昇`);
    }

    const newRate = currentRate * (1 + changePercent / 100);

    console.log('Rate calculation:', {
      current: currentRate,
      changePercent: changePercent.toFixed(2) + '%',
      newRate: newRate.toFixed(2),
      upperLimit,
      buyPressure: marketData.buyPressure,
      sellPressure: marketData.sellPressure
    });

    // レート範囲チェック（動的上限・下限）
    const clampedRate = Math.max(lowerLimit, Math.min(upperLimit, newRate));

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
    console.log(`✅ TKUCレート更新成功: ${currentRate} → ${rateData.currentRate} TKUP (+${changePercent.toFixed(2)}%)`);

  } catch (error) {
    console.error('❌ TKUCレート更新エラー:', error.message);
    // フォールバック: 前回レート維持
  }
}

/**
 * 市場状況を分析
 * @returns {object} 市場データ
 */
function analyzeMarketCondition() {
  const orderBook = getOrderBook();
  const balances = loadJSON(FILES.USER_BALANCES);

  // 注文数ベースの圧力計算
  const buyOrders = orderBook.buyOrders || [];
  const sellOrders = orderBook.sellOrders || [];

  const buyPressure = buyOrders.length;
  const sellPressure = sellOrders.length;

  // 保有量ベースの圧力計算
  let totalTKUP = 0;
  let totalTKUC = 0;
  let userCount = 0;

  for (const [userId, balance] of Object.entries(balances)) {
    if (balance) {
      totalTKUP += balance.tkup || 0;
      totalTKUC += balance.tkuc || 0;
      userCount++;
    }
  }

  // TKUP/TKUC比率で市場トレンドを判断
  const tkupTkucRatio = totalTKUP / (totalTKUC * 500 || 1); // TKUCをTKUP換算

  return {
    buyPressure,
    sellPressure,
    totalTKUP,
    totalTKUC,
    userCount,
    tkupTkucRatio
  };
}

/**
 * 最近のレート変動を取得
 * @param {number} count - 取得する変動数
 * @returns {Array} 変動率の配列
 */
function getRecentRateChanges(count = 5) {
  const rateData = loadJSON(FILES.TKUC_RATE);
  const history = rateData.history || [];

  if (history.length < 2) return [];

  const changes = [];
  for (let i = history.length - 1; i > Math.max(0, history.length - count - 1); i--) {
    const current = history[i];
    const previous = history[i - 1];
    if (previous) {
      const change = ((current.rate - previous.rate) / previous.rate) * 100;
      changes.push(change);
    }
  }

  return changes.reverse();
}

/**
 * TKUCを購入
 * @param {string} userId - ユーザーID
 * @param {number} tkucAmount - 購入TKUC量
 * @returns {object} 結果 {success, message, tkupSpent, tkucReceived}
 */
function buyTKUC(userId, tkucAmount, options = {}) {
  const balance = getUserBalance(userId);
  const rate = getTKUCRate();

  if (tkucAmount <= 0 || Number.isNaN(tkucAmount)) {
    return { success: false, message: '購入数量が不正です。' };
  }

  const roundedAmount = Math.round(tkucAmount * 100) / 100;
  tkucAmount = roundedAmount;

  // 手数料込みの必要TKUP
  const tkupNeeded = Math.round(tkucAmount * rate * 1.03 * 100) / 100; // 3%手数料、小数点2桁

  // BOTの場合は無限資金（残高チェックスキップ）
  const isBot = userId === 'market_bot';
  if (!isBot && balance.tkup < tkupNeeded) {
    return { success: false, message: 'TKUP残高が不足しています。' };
  }

  // 取引実行
  balance.tkup = Math.round((balance.tkup - tkupNeeded) * 100) / 100;
  balance.tkuc = Math.round((balance.tkuc + tkucAmount) * 100) / 100;

  saveUserBalance(userId, balance);
  recordTransaction(userId, 'buy', { tkucAmount, tkupSpent: tkupNeeded, rate });

  return {
    success: true,
    message: `${tkucAmount} TKUCを購入しました。（${tkupNeeded} TKUP消費、手数料3%）`,
    tkupSpent: tkupNeeded,
    tkucReceived: tkucAmount,
    embedThumbnail: 'https://cdn.999i.org/momizisan/anigif.gif'
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

  // 手数料計算（3%）
  const fee = Math.ceil(amount * 0.03); // 切り上げ
  const totalCost = amount + fee;

  const fromBalance = getUserBalance(fromUserId);
  const toBalance = getUserBalance(toUserId);

  if (fromBalance.tkup < totalCost) {
    return { success: false, message: 'TKUP残高が不足しています。' };
  }

  // 取引実行
  fromBalance.tkup -= totalCost;
  toBalance.tkup += amount; // 手数料を引いた金額を受取人へ

  saveUserBalance(fromUserId, fromBalance);
  saveUserBalance(toUserId, toBalance);

  recordTransaction(fromUserId, 'transfer_tkup', { toUserId, amount, fee });
  recordTransaction(toUserId, 'receive_tkup', { fromUserId, amount });

  return { success: true, message: `${amount} TKUPを送金しました。（手数料: ${fee} TKUP）` };
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

  // 手数料計算（0.1%、最小0.001 TKUC、最大0.1 TKUC）
  const fee = Math.min(0.1, Math.max(0.001, amount * 0.001));

  const fromBalance = getUserBalance(fromUserId);
  const toBalance = getUserBalance(toUserId);

  if (fromBalance.tkuc < amount + fee) {
    return { success: false, message: 'TKUC残高が不足しています。' };
  }

  // 取引実行
  fromBalance.tkuc -= (amount + fee);
  toBalance.tkuc += amount;

  saveUserBalance(fromUserId, fromBalance);
  saveUserBalance(toUserId, toBalance);

  recordTransaction(fromUserId, 'transfer_tkuc', { toUserId, amount, fee });
  recordTransaction(toUserId, 'receive_tkuc', { fromUserId, amount });

  return { success: true, message: `${amount} TKUCを送金しました。（手数料: ${fee} TKUC）` };
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

  // 手数料3%差し引き
  const withdrawAmount = amount * 0.97;

  balance.tkup -= amount;
  saveUserBalance(userId, balance);

  recordTransaction(userId, 'withdraw', { amount, withdrawAmount, fee: amount * 0.03 });

  return {
    success: true,
    message: `${withdrawAmount} TKUP相当を出金しました。（手数料3%）`,
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
    // 日本時間で表示（タイムゾーンを考慮）
    const time = date.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
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
 * 需要影響テスト（デバッグ用）
 */
function testDemandImpact() {
  console.log('🧪 需要影響テスト開始...');

  // テストケース1: 買い需要が多い
  const testMarketData1 = {
    totalTKUP: 10000,
    totalTKUC: 50,
    buyPressure: 5,
    sellPressure: 2,
    tkupTkucRatio: 1.0
  };
  const result1 = calculateSmartRateChange(testMarketData1, 30, 0.5, 8, 20);
  console.log(`テスト1 (買い需要20): ${result1.toFixed(2)}%`);

  // テストケース2: 売り需要が多い
  const testMarketData2 = {
    totalTKUP: 10000,
    totalTKUC: 50,
    buyPressure: 2,
    sellPressure: 5,
    tkupTkucRatio: 1.0
  };
  const result2 = calculateSmartRateChange(testMarketData2, 30, 0.5, 8, -20);
  console.log(`テスト2 (売り需要20): ${result2.toFixed(2)}%`);

  // テストケース3: クジラ大量購入
  const testMarketData3 = {
    totalTKUP: 10000,
    totalTKUC: 50,
    buyPressure: 5,
    sellPressure: 2,
    tkupTkucRatio: 1.0
  };
  const result3 = calculateSmartRateChange(testMarketData3, 30, 0.5, 8, 100);
  console.log(`テスト3 (クジラ購入100): ${result3.toFixed(2)}%`);

  // テストケース4: 小規模市場
  const testMarketData4 = {
    totalTKUP: 100,
    totalTKUC: 1,
    buyPressure: 5,
    sellPressure: 2,
    tkupTkucRatio: 1.0
  };
  const result4 = calculateSmartRateChange(testMarketData4, 30, 0.5, 8, 20);
  console.log(`テスト4 (小規模市場): ${result4.toFixed(2)}%`);

  console.log('🧪 需要影響テスト完了');
}

/**
 * TKUPランキングを取得
 * @param {number} limit - 上位表示数
 * @returns {Array} ランキング配列
 */
function getTKUPRanking(limit = 10) {
  const balances = loadJSON(FILES.USER_BALANCES);
  const rankings = [];

  for (const [userId, balance] of Object.entries(balances)) {
    if (balance && typeof balance.tkup === 'number' && balance.tkup > 0) {
      rankings.push({
        userId,
        tkup: balance.tkup,
        tkuc: balance.tkuc || 0
      });
    }
  }

  // TKUPでソート（降順）
  rankings.sort((a, b) => b.tkup - a.tkup);

  return rankings.slice(0, limit);
}

/**
 * TKUCランキングを取得
 * @param {number} limit - 上位表示数
 * @returns {Array} ランキング配列
 */
function getTKUCRanking(limit = 10) {
  const balances = loadJSON(FILES.USER_BALANCES);
  const rankings = [];

  for (const [userId, balance] of Object.entries(balances)) {
    if (balance && typeof balance.tkuc === 'number' && balance.tkuc > 0) {
      rankings.push({
        userId,
        tkup: balance.tkup || 0,
        tkuc: balance.tkuc
      });
    }
  }

  // TKUCでソート（降順）
  rankings.sort((a, b) => b.tkuc - a.tkuc);

  return rankings.slice(0, limit);
}

/**
 * オーダーID生成
 * @returns {string} 一意のオーダーID
 */
function generateOrderId() {
  return `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * オーダーブックを取得
 * @returns {object} オーダーブック
 */
function getOrderBook() {
  const orderBook = loadJSON(FILES.ORDER_BOOK);
  return orderBook || { buyOrders: [], sellOrders: [] };
}

/**
 * オーダーブックを保存
 * @param {object} orderBook - オーダーブック
 */
function saveOrderBook(orderBook) {
  saveJSON(FILES.ORDER_BOOK, orderBook);
}

/**
 * 買い注文追加
 * @param {string} userId - ユーザーID
 * @param {number} price - 注文価格
 * @param {number} amount - 注文数量
 * @returns {object} 結果
 */
function placeBuyOrder(userId, price, amount) {
  const balance = getUserBalance(userId);
  const totalCost = price * amount;

  if (balance.tkup < totalCost) {
    return { success: false, message: 'TKUP残高が不足しています。' };
  }

  // 注文追加
  const orderBook = getOrderBook();
  const order = {
    id: generateOrderId(),
    userId,
    type: 'buy',
    price,
    amount,
    remaining: amount,
    timestamp: Date.now(),
    lockedAmount: totalCost  // ロック額を記録
  };

  // TKUP残高をロック
  balance.tkup -= totalCost;
  saveUserBalance(userId, balance);

  orderBook.buyOrders.push(order);
  saveOrderBook(orderBook);

  // マッチング実行
  matchOrders();

  return { success: true, message: `買い注文を追加しました。（ID: ${order.id}）` };
}

/**
 * 売り注文追加
 * @param {string} userId - ユーザーID
 * @param {number} price - 注文価格
 * @param {number} amount - 注文数量
 * @returns {object} 結果
 */
function placeSellOrder(userId, price, amount) {
  const balance = getUserBalance(userId);

  if (balance.tkuc < amount) {
    return { success: false, message: 'TKUC残高が不足しています。' };
  }

  // 注文追加
  const orderBook = getOrderBook();
  const order = {
    id: generateOrderId(),
    userId,
    type: 'sell',
    price,
    amount,
    remaining: amount,
    timestamp: Date.now(),
    lockedAmount: amount  // ロック額を記録
  };

  // TKUC残高をロック
  balance.tkuc -= amount;
  saveUserBalance(userId, balance);

  orderBook.sellOrders.push(order);
  saveOrderBook(orderBook);

  // マッチング実行
  matchOrders();

  return { success: true, message: `売り注文を追加しました。（ID: ${order.id}）` };
}

/**
 * 注文キャンセル
 * @param {string} userId - ユーザーID
 * @param {string} orderId - 注文ID
 * @returns {object} 結果
 */
function cancelOrder(userId, orderId) {
  const orderBook = getOrderBook();
  let found = false;

  // 買い注文から検索・削除
  orderBook.buyOrders = orderBook.buyOrders.filter(order => {
    if (order.id === orderId && order.userId === userId) {
      found = true;
      return false; // 削除
    }
    return true;
  });

  // 売り注文から検索・削除
  orderBook.sellOrders = orderBook.sellOrders.filter(order => {
    if (order.id === orderId && order.userId === userId) {
      found = true;
      return false; // 削除
    }
    return true;
  });

  if (!found) {
    return { success: false, message: '注文が見つからないか、権限がありません。' };
  }

  saveOrderBook(orderBook);
  return { success: true, message: '注文をキャンセルしました。' };
}

/**
 * オーダーマッチングエンジン
 */
function matchOrders() {
  const orderBook = getOrderBook();

  // 買い注文を価格降順でソート（高い価格優先）
  orderBook.buyOrders.sort((a, b) => b.price - a.price);
  // 売り注文を価格昇順でソート（安い価格優先）
  orderBook.sellOrders.sort((a, b) => a.price - b.price);

  const matchedTrades = [];

  for (const buyOrder of orderBook.buyOrders) {
    if (buyOrder.remaining <= 0) continue;

    for (const sellOrder of orderBook.sellOrders) {
      if (sellOrder.remaining <= 0) continue;

      // マッチング条件: 買い価格 >= 売り価格
      if (buyOrder.price >= sellOrder.price) {
        const tradeAmount = Math.min(buyOrder.remaining, sellOrder.remaining);
        const tradePrice = sellOrder.price; // 売り手の価格で約定

        // 取引実行
        executeTrade(buyOrder, sellOrder, tradeAmount, tradePrice);
        matchedTrades.push({ buyOrder: buyOrder.id, sellOrder: sellOrder.id, amount: tradeAmount, price: tradePrice });

        // 注文残高更新
        buyOrder.remaining -= tradeAmount;
        sellOrder.remaining -= tradeAmount;
      }
    }
  }

  // 完了した注文を削除
  orderBook.buyOrders = orderBook.buyOrders.filter(order => order.remaining > 0);
  orderBook.sellOrders = orderBook.sellOrders.filter(order => order.remaining > 0);

  saveOrderBook(orderBook);

  // レート更新（取引があった場合）
  if (matchedTrades.length > 0) {
    updateRateFromTrades(matchedTrades);
  }
}

/**
 * 取引実行
 * @param {object} buyOrder - 買い注文
 * @param {object} sellOrder - 売り注文
 * @param {number} amount - 取引数量
 * @param {number} price - 取引価格
 */
function executeTrade(buyOrder, sellOrder, amount, price) {
  const totalCost = amount * price;

  // 買い手: TKUP既にロック済み、TKUC受け取り
  const buyerBalance = getUserBalance(buyOrder.userId);
  buyerBalance.tkuc += amount;
  saveUserBalance(buyOrder.userId, buyerBalance);

  // 売り手: TKUC既にロック済み、TKUP受け取り
  const sellerBalance = getUserBalance(sellOrder.userId);
  sellerBalance.tkup += totalCost;
  saveUserBalance(sellOrder.userId, sellerBalance);

  // 取引履歴記録
  recordTransaction(buyOrder.userId, 'market_buy', { tkucAmount: amount, tkupCost: totalCost, price });
  recordTransaction(sellOrder.userId, 'market_sell', { tkucAmount: amount, tkupEarned: totalCost, price });

  console.log(`取引成立: ${amount} TKUC @ ${price} TKUP (${buyOrder.userId} ← ${sellOrder.userId})`);
}

/**
 * 取引情報からレート更新
 * @param {Array} trades - 取引情報
 */
function updateRateFromTrades(trades) {
  if (trades.length === 0) return;

  // 最新取引価格でレート更新
  const latestTrade = trades[trades.length - 1];
  const rateData = loadJSON(FILES.TKUC_RATE);

  rateData.currentRate = Math.round(latestTrade.price * 100) / 100;
  rateData.lastUpdate = Date.now();
  rateData.history = rateData.history || [];
  rateData.history.push({ timestamp: Date.now(), rate: rateData.currentRate });

  // 履歴を最新50件に制限
  if (rateData.history.length > 50) {
    rateData.history = rateData.history.slice(-50);
  }

  saveJSON(FILES.TKUC_RATE, rateData);
  console.log(`市場レート更新: ${rateData.currentRate} TKUP（取引価格反映）`);
}

/**
 * オーダー板表示
 * @returns {string} フォーマット済みオーダー板
 */
function formatOrderBook() {
  const orderBook = getOrderBook();

  let result = '**📊 オーダー板**\n\n';

  // 買い注文（ベスト5）
  result += '**買い注文（高い価格順）**\n';
  const topBuyOrders = orderBook.buyOrders
    .sort((a, b) => b.price - a.price)
    .slice(0, 5);

  if (topBuyOrders.length === 0) {
    result += '注文なし\n';
  } else {
    topBuyOrders.forEach(order => {
      result += `${order.price} TKUP × ${order.remaining} TKUC\n`;
    });
  }

  result += '\n';

  // 売り注文（ベスト5）
  result += '**売り注文（安い価格順）**\n';
  const topSellOrders = orderBook.sellOrders
    .sort((a, b) => a.price - b.price)
    .slice(0, 5);

  if (topSellOrders.length === 0) {
    result += '注文なし\n';
  } else {
    topSellOrders.forEach(order => {
      result += `${order.price} TKUP × ${order.remaining} TKUC\n`;
    });
  }

  return result;
}

/**
 * AI接続テスト（デバッグ用）
 */
async function testAIConnection() {
  console.log('🧪 AI接続テスト開始...');

  if (!aiClient) {
    console.error('❌ AI client not initialized');
    return;
  }

  try {
    const aiConfig = loadJSON(FILES.AI_CONFIG) || { provider: 'openrouter' };
    const model = aiConfig.model || 'openai/gpt-oss-120b:free';

    const completion = await aiClient.chat.completions.create({
      model: model,
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

/**
 * チャット盛り上がり度を分析
 * @returns {number} 盛り上がり度スコア（0-100）
 */
function analyzeChatActivity() {
  const balances = loadJSON(FILES.USER_BALANCES);
  const now = Date.now();
  const recentTime = 10 * 60 * 1000; // 過去10分

  let totalRecentEarned = 0;
  let activeUsers = 0;

  for (const [userId, balance] of Object.entries(balances)) {
    if (balance && balance.earnedHistory) {
      const recentHistory = balance.earnedHistory.filter(entry =>
        now - entry.timestamp < recentTime
      );

      const recentEarned = recentHistory.reduce((sum, entry) => sum + entry.amount, 0);
      totalRecentEarned += recentEarned;

      if (recentEarned > 0) {
        activeUsers++;
      }
    }
  }

  // 盛り上がり度を計算（0-100）
  const activityScore = Math.min(100, (totalRecentEarned / 50) * (activeUsers / 3) * 100);
  return activityScore;
}

/**
 * 上位3人の保有割合を分析
 * @returns {number} 上位3人の割合（0-1）
 */
function analyzeTop3Ratio() {
  const balances = loadJSON(FILES.USER_BALANCES);
  const rankings = [];

  for (const [userId, balance] of Object.entries(balances)) {
    if (balance && (balance.tkup > 0 || balance.tkuc > 0)) {
      rankings.push({
        userId,
        tkup: balance.tkup || 0,
        tkuc: balance.tkuc || 0
      });
    }
  }

  if (rankings.length === 0) return 0;

  // TKUP + TKUC換算でソート
  rankings.sort((a, b) => (b.tkup + b.tkuc * 500) - (a.tkup + a.tkuc * 500));

  const top3 = rankings.slice(0, 3);
  const totalTop3 = top3.reduce((sum, user) => sum + user.tkup + (user.tkuc * 500), 0);
  const totalAll = rankings.reduce((sum, user) => sum + user.tkup + (user.tkuc * 500), 0);

  return totalAll > 0 ? totalTop3 / totalAll : 0;
}

/**
 * 正味需要を計算（買-売）
 * @returns {number} 過去10分のTKUC正味需要
 */
function getNetDemand() {
  const history = loadJSON(FILES.TRANSACTION_HISTORY);
  const now = Date.now();
  const recentTime = 10 * 60 * 1000; // 過去10分

  let buyVolume = 0;
  let sellVolume = 0;

  for (const [userId, userHistory] of Object.entries(history)) {
    if (userHistory && typeof userHistory === 'object') {
      for (const [type, transactions] of Object.entries(userHistory)) {
        if (Array.isArray(transactions)) {
          const recentTrades = transactions.filter(tx =>
            tx && typeof tx.timestamp === 'number' && now - tx.timestamp < recentTime
          );

          for (const trade of recentTrades) {
            if (['buy', 'market_buy'].includes(type)) {
              // TKUC購入量
              buyVolume += trade.tkucAmount || 0;
            } else if (['sell', 'market_sell'].includes(type)) {
              // TKUC売却量
              sellVolume += trade.tkucAmount || 0;
            }
          }
        }
      }
    }
  }

  const netDemand = buyVolume - sellVolume;
  console.log(`📊 正味需要: ${netDemand} TKUC (買:${buyVolume} - 売:${sellVolume})`);
  return netDemand;
}

/**
 * TKUC保有者の総数をカウント
 * @returns {number} TKUCを1以上持っているユーザー数
 */
function getTKUCHoldersCount() {
  const balances = loadJSON(FILES.USER_BALANCES);
  let holdersCount = 0;

  for (const [userId, balance] of Object.entries(balances)) {
    if (balance && (balance.tkuc || 0) >= 1) {
      holdersCount++;
    }
  }

  return holdersCount;
}

/**
 * 最近の売り手数をカウント（ユニークユーザー）
 * @returns {number} 過去10分に売却したユニークユーザー数
 */
function getRecentSellersCount() {
  const history = loadJSON(FILES.TRANSACTION_HISTORY);
  const now = Date.now();
  const recentTime = 10 * 60 * 1000; // 過去10分

  const recentSellers = new Set();

  for (const [userId, userHistory] of Object.entries(history)) {
    if (userHistory && typeof userHistory === 'object') {
      for (const [type, transactions] of Object.entries(userHistory)) {
        // 売却タイプ：sell（直接売却）、market_sell（オーダー約定）
        if (['sell', 'market_sell'].includes(type)) {
          if (Array.isArray(transactions)) {
            const recentTrades = transactions.filter(tx =>
              tx && typeof tx.timestamp === 'number' && now - tx.timestamp < recentTime
            );

            if (recentTrades.length > 0) {
              recentSellers.add(userId);
            }
          }
        }
      }
    }
  }

  return recentSellers.size;
}

/**
 * 最近の取引数をカウント
 * @returns {number} 過去10分の取引数
 */
function getRecentTradeCount() {
  const history = loadJSON(FILES.TRANSACTION_HISTORY);
  const now = Date.now();
  const recentTime = 10 * 60 * 1000; // 過去10分

  let tradeCount = 0;

  for (const [userId, userHistory] of Object.entries(history)) {
    if (userHistory && typeof userHistory === 'object') {
      for (const [type, transactions] of Object.entries(userHistory)) {
        // 取引タイプ：buy（直接購入）、sell（直接売却）、market_buy（オーダー約定）、market_sell（オーダー約定）
        if (['buy', 'sell', 'market_buy', 'market_sell'].includes(type)) {
          // transactionsが配列であることを確認
          if (Array.isArray(transactions)) {
            const recentTrades = transactions.filter(tx =>
              tx && typeof tx.timestamp === 'number' && now - tx.timestamp < recentTime
            );
            tradeCount += recentTrades.length;

            // デバッグ：取引が見つかった場合のログ
            if (recentTrades.length > 0) {
              console.log(`🔍 [${userId}] ${type}: ${recentTrades.length}件の取引を検出`);
            }
          }
        }
      }
    }
  }

  console.log(`🔍 合計取引数: ${tradeCount}件（過去10分）`);
  return tradeCount;
}

/**
 * スマートレート計算（tick方式）
 * @param {object} marketData - 市場データ
 * @param {number} chatActivity - チャット盛り上がり度
 * @param {number} top3Ratio - 上位3人保有割合
 * @param {number} recentTrades - 最近の取引数
 * @param {number} netDemand - 正味需要（買-売）
 * @returns {number} 変動率
 */
function calculateSmartRateChange(marketData, chatActivity, top3Ratio, recentTrades, netDemand) {
  const currentRate = getTKUCRate();

  // レジーム変更チェック（5〜15分に1回）
  if (Date.now() > marketState.nextRegimeChange) {
    const keys = Object.keys(REGIMES);
    const key = keys[Math.floor(Math.random() * keys.length)];
    marketState.regime = REGIMES[key];
    marketState.nextRegimeChange = Date.now() + (5 + Math.random() * 10) * 60 * 1000;
    console.log(`🌪️ マーケット状態変更: ${key} (${marketState.regime}倍)`);
  }

  // ノイズ（強化） ±0.25%
  const noise = (Math.random() - 0.5) * 0.5;

  // 需要影響（過去10分）
  const demandImpact = calculateDemandImpact(netDemand, marketData);

  // トレンド慣性（前回変動の残り）
  const momentum = lastRateChange * 0.3;

  // ボラティリティ制御（取引活発度連動）
  let volatility = 1.0;
  if (recentTrades >= 5) volatility = 2.0;
  else if (recentTrades >= 2) volatility = 1.3;
  else if (recentTrades === 0 && netDemand === 0) volatility = 0.5;

  // 合成
  let changePercent = (noise + demandImpact + momentum) * volatility;



  // マーケットの機嫌倍率をかける
  changePercent *= marketState.regime;

  // トレンド強さの慣性
  marketState.trendPower = marketState.trendPower * 0.9 + Math.abs(changePercent) * 0.1;
  changePercent *= (1 + marketState.trendPower);

  // 1tick最大変動 ±0.5%
  changePercent = Math.max(-0.5, Math.min(0.5, changePercent));

  // 重力追加（基準価格からの距離）
  const fairPrice = getFairPrice(); // 動的基準価格
  const deviation = (currentRate - fairPrice) / fairPrice;
  const GRAVITY_K = 0.3;
  let gravity = -deviation * GRAVITY_K;
  gravity = Math.max(-0.3, Math.min(0.3, gravity)); // 安全クリップ
  changePercent += gravity;

  console.log(`🌍 乖離=${(deviation*100).toFixed(2)}% 重力=${(gravity*100).toFixed(4)}%`);

  // 逆方向抑制強化：買われてるのに下がりにくくする
  if (netDemand > 0 && changePercent < 0) {
    changePercent *= 0.2; // 5分の1に抑制
  }

  // チャット盛り上がり度をレート計算に追加
  let chatBoost = (chatActivity / 100) * 0.1; // 盛り上がり0-100% → 最大+0.1%
  if (recentTrades === 0 && netDemand === 0) {
    chatBoost *= 0.1;
  }
  changePercent += chatBoost;

  // トレンド慣性更新（減衰）
  lastRateChange = changePercent * 0.85; // 毎tick15%減衰

  // 下限・上限クッション
  if (currentRate < 100 * 1.1 && changePercent < 0) {
    changePercent *= 0.3; // 下方向を弱める
  }

  // 供給バランス調整（売り手割合ベース）
  const totalHolders = getTKUCHoldersCount();
  const recentSellers = getRecentSellersCount();
  let supplyAdjustment = 0;

  if (totalHolders > 0) {
    const sellerRatio = recentSellers / totalHolders;
    console.log(`📊 供給バランス: 保有者=${totalHolders}, 売り手=${recentSellers}, 割合=${(sellerRatio*100).toFixed(1)}%`);

    if (sellerRatio < 0.1) { // 売り手が10%未満（供給不足）
      supplyAdjustment = 0.3; // 上昇
    } else if (sellerRatio > 0.3) { // 売り手が30%超（供給過多）
      supplyAdjustment = -0.3; // 下落
    }
  }

  if (recentTrades === 0 && netDemand === 0) {
    supplyAdjustment *= 0.1;
  }

  changePercent += supplyAdjustment;

  console.log(`📈 Tick変動: ノイズ=${noise.toFixed(4)}%, 需要=${demandImpact.toFixed(4)}%, 慣性=${momentum.toFixed(4)}%, 重力=${gravity.toFixed(4)}%, 供給=${supplyAdjustment.toFixed(4)}%, チャット=${chatBoost.toFixed(4)}%, 最終=${changePercent.toFixed(4)}%`);

  // トレンド慣性更新
  lastRateChange = changePercent;

  return changePercent;
}

/**
 * 月末リセット処理
 * 全ユーザーのTKUPとTKUCを0にリセット
 */
function resetAllBalances() {
  const balances = loadJSON(FILES.USER_BALANCES);

  // 全ユーザーの残高をリセット
  for (const userId in balances) {
    if (balances[userId]) {
      balances[userId].tkup = 0;
      balances[userId].tkuc = 0;
      // earnedHistoryは残す（統計用）
    }
  }

  saveJSON(FILES.USER_BALANCES, balances);
  console.log('✅ 月末リセット: 全ユーザー残高を0にリセット');

  // オーダーブックもクリア
  saveJSON(FILES.ORDER_BOOK, { buyOrders: [], sellOrders: [] });
  console.log('✅ オーダーブックをクリア');
}

// ブースターアイテム定義
const BOOSTER_ITEMS = {
  '1h': { name: '1時間ブースター', duration: 3600000, multiplier: 1.5, tkup: 500, tkuc: 2 },
  '3h': { name: '3時間ブースター', duration: 10800000, multiplier: 2, tkup: 1200, tkuc: 4 },
  '6h': { name: '6時間ブースター', duration: 21600000, multiplier: 2.5, tkup: 2000, tkuc: 6 },
  '24h': { name: '24時間ブースター', duration: 86400000, multiplier: 3, tkup: 5000, tkuc: 15 }
};

/**
 * アクティブなブースターを取得
 * @param {string} userId - ユーザーID
 * @returns {object|null} ブースター情報またはnull
 */
function getActiveBooster(userId) {
  const balance = getUserBalance(userId);

  if (!balance.booster) return null;

  const now = Date.now();
  if (balance.booster.expiresAt > now) {
    return balance.booster;
  }

  // 期限切れのブースターを削除
  delete balance.booster;
  saveUserBalance(userId, balance);
  return null;
}

/**
 * ブースターアイテムを購入
 * @param {string} userId - ユーザーID
 * @param {string} itemType - アイテムタイプ (1h/3h/6h/24h)
 * @param {string} payment - 支払い方法 (tkup/tkuc)
 * @returns {object} 結果
 */
function buyBoosterItem(userId, itemType, payment) {
  const item = BOOSTER_ITEMS[itemType];
  if (!item) {
    return { success: false, message: '無効なアイテムタイプです。' };
  }

  const balance = getUserBalance(userId);

  // 支払い処理
  if (payment === 'tkup') {
    if (balance.tkup < item.tkup) {
      return { success: false, message: 'TKUP残高が不足しています。' };
    }
    balance.tkup -= item.tkup;
  } else if (payment === 'tkuc') {
    if (balance.tkuc < item.tkuc) {
      return { success: false, message: 'TKUC残高が不足しています。' };
    }
    balance.tkuc -= item.tkuc;
  } else {
    return { success: false, message: '無効な支払い方法です。' };
  }

  const now = Date.now();

  // 既存のブースターがある場合は時間を延長
  if (balance.booster && balance.booster.expiresAt > now) {
    balance.booster.expiresAt += item.duration;
    saveUserBalance(userId, balance);

    const remainingMs = balance.booster.expiresAt - now;
    const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
    const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

    recordTransaction(userId, 'booster_extend', { itemType, payment, duration: item.duration });

    return {
      success: true,
      message: `${item.name}を購入しました！効果時間が延長されました。\n残り時間: ${remainingHours}時間${remainingMinutes}分`,
      extended: true
    };
  }

  // 新規ブースター適用
  balance.booster = {
    type: itemType,
    name: item.name,
    multiplier: item.multiplier,
    expiresAt: now + item.duration
  };

  saveUserBalance(userId, balance);
  recordTransaction(userId, 'booster_purchase', { itemType, payment, multiplier: item.multiplier });

  return {
    success: true,
    message: `${item.name}を購入しました！TKUP獲得が${item.multiplier}倍になります。`,
    extended: false
  };
}

/**
 * ブースターアイテム一覧を取得
 * @returns {object} アイテム一覧
 */
function getBoosterItems() {
  return BOOSTER_ITEMS;
}

/**
 * ブースター情報をフォーマット
 * @param {string} userId - ユーザーID
 * @returns {string} フォーマット済み文字列
 */
function formatBoosterInfo(userId) {
  const booster = getActiveBooster(userId);

  if (!booster) {
    return 'ブースター: なし';
  }

  const now = Date.now();
  const remainingMs = booster.expiresAt - now;
  const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  return `🚀 ブースター: ${booster.name} (${booster.multiplier}倍)\n⏱️ 残り時間: ${remainingHours}時間${remainingMinutes}分`;
}

module.exports = {
  getUserBalance,
  saveUserBalance,
  calculateTKUPGain,
  checkTKUPHourlyLimit,
  earnTKUP,
  checkCasinoDailyBonus,
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
  getTKUPRanking,
  getTKUCRanking,
  resetAllBalances,
  formatOrderBook,
  placeBuyOrder,
  placeSellOrder,
  cancelOrder,
  getActiveBooster,
  buyBoosterItem,
  getBoosterItems,
  formatBoosterInfo,
  testRateUpdate, // デバッグ用
  testAIConnection, // デバッグ用
  testDemandImpact, // デバッグ用
};
