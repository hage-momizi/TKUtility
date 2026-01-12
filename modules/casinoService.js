const { getUserBalance, saveUserBalance, recordTransaction } = require('./economyService');

/**
 * カジノゲームサービス
 */

// ゲームセッション管理
const gameSessions = new Map();

// ブラックジャックゲームセッション管理
const blackjackSessions = new Map();

/**
 * ブラックジャックゲーム開始
 * @param {string} userId - ユーザーID
 * @param {number} betAmount - ベット額
 * @param {string} currency - 通貨タイプ
 * @returns {object} 結果
 */
function startBlackjack(userId, betAmount, currency) {
  const balance = getUserBalance(userId);

  // 残高チェック
  if ((currency === 'TKUP' && balance.tkup < betAmount) ||
      (currency === 'TKUC' && balance.tkuc < betAmount)) {
    return { success: false, message: `${currency}残高が不足しています。` };
  }

  // 手数料計算（20%みかじめ料）
  const fee = Math.ceil(betAmount * 0.2);
  const netBet = betAmount - fee;

  // ゲーム開始
  const playerCards = dealCards(2);
  const dealerCards = dealCards(1); // ディーラーは1枚のみ表
  const dealerHiddenCard = dealCards(1)[0]; // 隠しカード

  const playerScore = calculateScore(playerCards);
  const dealerVisibleScore = calculateScore(dealerCards);

  // ブラックジャック判定（プレイヤーのみ）
  const isBlackjack = playerCards.length === 2 && playerScore === 21;

  const sessionId = `bj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const session = {
    id: sessionId,
    userId,
    betAmount,
    currency,
    fee,
    netBet,
    playerCards,
    dealerCards,
    dealerHiddenCard,
    playerScore,
    dealerVisibleScore,
    isBlackjack,
    status: isBlackjack ? 'blackjack' : 'playing',
    createdAt: Date.now()
  };

  blackjackSessions.set(sessionId, session);

  let message = `🃏 ブラックジャックを開始しました！\n\n` +
                `あなたのカード: ${formatCards(playerCards)} (${playerScore}点)\n` +
                `ディーラーのカード: ${formatCards(dealerCards)} + [隠し] (${dealerVisibleScore}+?点)\n\n`;

  if (isBlackjack) {
    message += `🎉 ブラックジャック！ 自動勝利です！`;
    return finishBlackjack(sessionId, 'stand');
  } else {
    message += `ヒット（追加カード）またはスタンド（止める）を選択してください。`;
  }

  return {
    success: true,
    message,
    sessionId,
    interactive: true
  };
}

/**
 * ブラックジャック行動実行
 * @param {string} sessionId - セッションID
 * @param {string} action - 行動（hit/stand）
 * @returns {object} 結果
 */
function playBlackjackAction(sessionId, action) {
  const session = blackjackSessions.get(sessionId);
  if (!session) {
    return { success: false, message: 'ゲームセッションが見つかりません。' };
  }

  if (session.status !== 'playing') {
    return { success: false, message: 'このゲームは既に終了しています。' };
  }

  if (action === 'hit') {
    // ヒット：カードを1枚追加
    const newCard = dealCard();
    session.playerCards.push(newCard);
    session.playerScore = calculateScore(session.playerCards);

    if (session.playerScore > 21) {
      // バースト
      return finishBlackjack(sessionId, 'bust');
    } else {
      // 継続
      return {
        success: true,
        message: `ヒットしました！\n\n` +
                 `あなたのカード: ${formatCards(session.playerCards)} (${session.playerScore}点)\n` +
                 `ディーラーのカード: ${formatCards(session.dealerCards)} + [隠し] (${session.dealerVisibleScore}+?点)\n\n` +
                 `ヒットまたはスタンドを選択してください。`,
        sessionId,
        interactive: true
      };
    }
  } else if (action === 'stand') {
    // スタンド：ディーラーのターン
    return finishBlackjack(sessionId, 'stand');
  }

  return { success: false, message: '無効な行動です。' };
}

/**
 * ブラックジャックゲーム終了
 * @param {string} sessionId - セッションID
 * @param {string} reason - 終了理由
 * @returns {object} 結果
 */
function finishBlackjack(sessionId, reason) {
  const session = blackjackSessions.get(sessionId);
  if (!session) {
    return { success: false, message: 'ゲームセッションが見つかりません。' };
  }

  // ディーラーの隠しカードを公開
  session.dealerCards.push(session.dealerHiddenCard);
  let dealerScore = calculateScore(session.dealerCards);

  // ディーラールール：17以上でストップ
  while (dealerScore < 17) {
    session.dealerCards.push(dealCard());
    dealerScore = calculateScore(session.dealerCards);
  }

  // 勝敗判定
  let result, winnings = 0;

  if (reason === 'bust') {
    result = 'lose';
    winnings = 0;
  } else if (session.isBlackjack) {
    result = 'blackjack';
    winnings = session.netBet * 1.5; // 3:2
  } else if (dealerScore > 21) {
    result = 'win';
    winnings = session.netBet; // 1:1
  } else if (session.playerScore > dealerScore) {
    result = 'win';
    winnings = session.netBet; // 1:1
  } else if (session.playerScore === dealerScore) {
    result = 'tie';
    winnings = session.netBet * 0.5; // プッシュ
  } else {
    result = 'lose';
    winnings = 0;
  }

  // 残高更新
  const balance = getUserBalance(session.userId);
  if (session.currency === 'TKUP') {
    balance.tkup -= session.betAmount;
    if (winnings > 0) balance.tkup += winnings;
  } else {
    balance.tkuc -= session.betAmount;
    if (winnings > 0) balance.tkuc += winnings;
  }

  saveUserBalance(session.userId, balance);

  // 取引記録
  recordTransaction(session.userId, 'casino_blackjack', {
    betAmount: session.betAmount,
    currency: session.currency,
    fee: session.fee,
    result,
    winnings,
    playerCards: session.playerCards,
    dealerCards: session.dealerCards,
    actions: reason
  });

  // セッション削除
  blackjackSessions.delete(sessionId);

  const resultText = {
    win: '勝利',
    lose: '敗北',
    tie: 'プッシュ',
    blackjack: 'ブラックジャック',
    bust: 'バースト'
  }[result];

  return {
    success: true,
    message: `ブラックジャック: ${resultText}\n` +
             `あなたのカード: ${formatCards(session.playerCards)} (${session.playerScore}点)\n` +
             `ディーラーのカード: ${formatCards(session.dealerCards)} (${dealerScore}点)\n` +
             `ベット: ${session.betAmount} ${session.currency} | 手数料: ${session.fee} ${session.currency} | 獲得: ${winnings} ${session.currency}`,
    result,
    winnings
  };
}

/**
 * スロットゲーム
 * @param {string} userId - ユーザーID
 * @param {number} betAmount - ベット額
 * @param {string} currency - 通貨タイプ
 * @returns {object} 結果
 */
function playSlot(userId, betAmount, currency) {
  const balance = getUserBalance(userId);

  if ((currency === 'TKUP' && balance.tkup < betAmount) ||
      (currency === 'TKUC' && balance.tkuc < betAmount)) {
    return { success: false, message: `${currency}残高が不足しています。` };
  }

  // 手数料計算（20%みかじめ料）
  const fee = Math.ceil(betAmount * 0.2);
  const netBet = betAmount - fee;

  // スロット実行（3リール、7シンボル）
  const symbols = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '⭐'];
  const reel1 = symbols[Math.floor(Math.random() * symbols.length)];
  const reel2 = symbols[Math.floor(Math.random() * symbols.length)];
  const reel3 = symbols[Math.floor(Math.random() * symbols.length)];

  // 当たり判定
  let multiplier = 0;
  if (reel1 === reel2 && reel2 === reel3) {
    // 3つ同じ（ジャックポット）
    multiplier = 10;
  } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
    // 2つ同じ
    multiplier = 2;
  } else if (reel1 === '🍒' || reel2 === '🍒' || reel3 === '🍒') {
    // チェリー
    multiplier = 5;
  }

  const winnings = multiplier > 0 ? netBet * multiplier : 0;

  // 残高更新
  if (currency === 'TKUP') {
    balance.tkup -= betAmount;
    if (winnings > 0) balance.tkup += winnings;
  } else {
    balance.tkuc -= betAmount;
    if (winnings > 0) balance.tkuc += winnings;
  }

  saveUserBalance(userId, balance);

  // 取引記録
  recordTransaction(userId, 'casino_slot', {
    betAmount,
    currency,
    fee,
    reels: [reel1, reel2, reel3],
    multiplier,
    winnings
  });

  const resultText = multiplier > 0 ? `当たり! ${multiplier}倍` : 'ハズレ';

  return {
    success: true,
    message: `スロット: ${resultText}\n` +
             `リール: ${reel1} | ${reel2} | ${reel3}\n` +
             `ベット: ${betAmount} ${currency} | 手数料: ${fee} ${currency} | 獲得: ${winnings} ${currency}`,
    reels: [reel1, reel2, reel3],
    winnings
  };
}

/**
 * ルーレットゲーム
 * @param {string} userId - ユーザーID
 * @param {number} betAmount - ベット額
 * @param {string} currency - 通貨タイプ
 * @param {string} betType - ベットタイプ
 * @param {string|number} betValue - ベット値
 * @returns {object} 結果
 */
function playRoulette(userId, betAmount, currency, betType, betValue) {
  const balance = getUserBalance(userId);

  if ((currency === 'TKUP' && balance.tkup < betAmount) ||
      (currency === 'TKUC' && balance.tkuc < betAmount)) {
    return { success: false, message: `${currency}残高が不足しています。` };
  }

  // 手数料計算（20%みかじめ料）
  const fee = Math.ceil(betAmount * 0.2);
  const netBet = betAmount - fee;

  // ルーレット実行（ヨーロピアン：0-36）
  const result = Math.floor(Math.random() * 37); // 0-36

  // 当たり判定
  let multiplier = 0;
  let winDescription = '';

  switch (betType) {
    case 'number':
      if (parseInt(betValue) === result) {
        multiplier = 35; // 数字ベット 35倍
        winDescription = `数字 ${betValue}`;
      }
      break;
    case 'color':
      const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(result);
      const isBlack = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35].includes(result);

      if ((betValue === 'red' && isRed) || (betValue === 'black' && isBlack)) {
        multiplier = 1; // 色ベット 1倍
        winDescription = `${betValue === 'red' ? '赤' : '黒'}`;
      }
      break;
    case 'parity':
      const isEven = result !== 0 && result % 2 === 0;
      const isOdd = result !== 0 && result % 2 === 1;

      if ((betValue === 'even' && isEven) || (betValue === 'odd' && isOdd)) {
        multiplier = 1; // 偶奇ベット 1倍
        winDescription = `${betValue === 'even' ? '偶数' : '奇数'}`;
      }
      break;
    case 'range':
      const isLow = result >= 1 && result <= 18;
      const isHigh = result >= 19 && result <= 36;

      if ((betValue === 'low' && isLow) || (betValue === 'high' && isHigh)) {
        multiplier = 1; // 範囲ベット 1倍
        winDescription = `${betValue === 'low' ? '1-18' : '19-36'}`;
      }
      break;
  }

  const winnings = multiplier > 0 ? netBet * multiplier : 0;

  // 残高更新
  if (currency === 'TKUP') {
    balance.tkup -= betAmount;
    if (winnings > 0) balance.tkup += winnings;
  } else {
    balance.tkuc -= betAmount;
    if (winnings > 0) balance.tkuc += winnings;
  }

  saveUserBalance(userId, balance);

  // 取引記録
  recordTransaction(userId, 'casino_roulette', {
    betAmount,
    currency,
    fee,
    betType,
    betValue,
    result,
    multiplier,
    winnings
  });

  const resultText = multiplier > 0 ? `当たり! ${winDescription}` : 'ハズレ';

  return {
    success: true,
    message: `ルーレット: ${resultText}\n` +
             `結果: ${result} | ベット: ${betType} ${betValue}\n` +
             `ベット: ${betAmount} ${currency} | 手数料: ${fee} ${currency} | 獲得: ${winnings} ${currency}`,
    result,
    winnings
  };
}

/**
 * 掛け金ゲーム開始
 * @param {string} userId - ホストユーザーID
 * @param {number} betAmount - 掛け金
 * @param {string} currency - 通貨タイプ
 * @param {number} maxPlayers - 最大参加人数
 * @returns {object} 結果
 */
function startKakeGame(userId, betAmount, currency, maxPlayers) {
  const balance = getUserBalance(userId);

  if ((currency === 'TKUP' && balance.tkup < betAmount) ||
      (currency === 'TKUC' && balance.tkuc < betAmount)) {
    return { success: false, message: `${currency}残高が不足しています。` };
  }

  const gameId = `kake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const gameSession = {
    id: gameId,
    host: userId,
    betAmount,
    currency,
    maxPlayers,
    participants: [userId],
    status: 'waiting',
    createdAt: Date.now(),
    expiresAt: Date.now() + (60 * 1000), // 1分間
  };

  gameSessions.set(gameId, gameSession);

  return {
    success: true,
    message: `掛け金ゲームを開始しました！\n` +
             `ゲームID: ${gameId}\n` +
             `掛け金: ${betAmount} ${currency}\n` +
             `参加人数: ${maxPlayers}人\n` +
             `制限時間: 1分\n\n` +
             `他の人が参加ボタンを押すとゲームが開始されます。`,
    gameId
  };
}

/**
 * 掛け金ゲーム参加
 * @param {string} userId - 参加ユーザーID
 * @param {string} gameId - ゲームID
 * @returns {object} 結果
 */
function joinKakeGame(userId, gameId) {
  const gameSession = gameSessions.get(gameId);

  if (!gameSession) {
    return { success: false, message: 'ゲームが見つかりません。' };
  }

  if (gameSession.status !== 'waiting') {
    return { success: false, message: 'このゲームは既に開始されています。' };
  }

  if (gameSession.participants.includes(userId)) {
    return { success: false, message: '既にこのゲームに参加しています。' };
  }

  if (gameSession.participants.length >= gameSession.maxPlayers) {
    return { success: false, message: 'このゲームは満員です。' };
  }

  // 残高チェック
  const balance = getUserBalance(userId);
  if ((gameSession.currency === 'TKUP' && balance.tkup < gameSession.betAmount) ||
      (gameSession.currency === 'TKUC' && balance.tkuc < gameSession.betAmount)) {
    return { success: false, message: `${gameSession.currency}残高が不足しています。` };
  }

  gameSession.participants.push(userId);

  // 満員になったらゲーム開始
  if (gameSession.participants.length === gameSession.maxPlayers) {
    return executeKakeGame(gameSession);
  }

  gameSessions.set(gameId, gameSession);

  return {
    success: true,
    message: `ゲームに参加しました！\n現在の参加者: ${gameSession.participants.length}/${gameSession.maxPlayers}人`
  };
}

/**
 * 掛け金ゲーム実行
 * @param {object} gameSession - ゲームセッション
 * @returns {object} 結果
 */
function executeKakeGame(gameSession) {
  gameSession.status = 'completed';

  const totalPot = gameSession.betAmount * gameSession.participants.length;

  // 手数料計算（20%みかじめ料）
  const fee = Math.ceil(totalPot * 0.2);
  const distributable = totalPot - fee;

  // 勝者選定（ランダム）
  const winnerIndex = Math.floor(Math.random() * gameSession.participants.length);
  const winner = gameSession.participants[winnerIndex];

  // 勝者に分配（90%）
  const winnerPrize = Math.floor(distributable * 0.9);

  // 参加者全員の残高更新
  gameSession.participants.forEach(participantId => {
    const balance = getUserBalance(participantId);

    if (gameSession.currency === 'TKUP') {
      balance.tkup -= gameSession.betAmount;
      if (participantId === winner) {
        balance.tkup += winnerPrize;
      }
    } else {
      balance.tkuc -= gameSession.betAmount;
      if (participantId === winner) {
        balance.tkuc += winnerPrize;
      }
    }

    saveUserBalance(participantId, balance);

    // 取引記録
    recordTransaction(participantId, 'casino_kake', {
      gameId: gameSession.id,
      betAmount: gameSession.betAmount,
      currency: gameSession.currency,
      isWinner: participantId === winner,
      prize: participantId === winner ? winnerPrize : 0,
      totalParticipants: gameSession.participants.length
    });
  });

  // セッション削除
  gameSessions.delete(gameSession.id);

  return {
    success: true,
    message: `掛け金ゲームが終了しました！\n\n` +
             `🎉 勝者: <@${winner}>\n` +
             `💰 賞金: ${winnerPrize} ${gameSession.currency}\n` +
             `👥 参加者数: ${gameSession.participants.length}人\n` +
             `💵 総掛け金: ${totalPot} ${gameSession.currency}\n` +
             `💸 手数料: ${fee} ${gameSession.currency}\n\n` +
             `参加者: ${gameSession.participants.map(id => `<@${id}>`).join(', ')}`,
    winner,
    winnerPrize
  };
}

/**
 * 期限切れゲームの処理
 */
function processExpiredGames() {
  const now = Date.now();

  for (const [gameId, gameSession] of gameSessions.entries()) {
    if (gameSession.status === 'waiting' && now > gameSession.expiresAt) {
      // 返金処理
      gameSession.participants.forEach(participantId => {
        // 実際には返金処理は行わない（参加表明のみなので）
      });

      gameSessions.delete(gameId);
      console.log(`掛け金ゲーム ${gameId} が期限切れで終了しました。`);
    }
  }
}

// 定期的に期限切れゲームを処理
setInterval(processExpiredGames, 10000); // 10秒毎

// ヘルパー関数
function dealCards(count) {
  const deck = [];
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  suits.forEach(suit => {
    values.forEach(value => {
      deck.push({ suit, value });
    });
  });

  const cards = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * deck.length);
    cards.push(deck.splice(index, 1)[0]);
  }

  return cards;
}

function dealCard() {
  return dealCards(1)[0];
}

function calculateScore(cards) {
  let score = 0;
  let aces = 0;

  cards.forEach(card => {
    if (card.value === 'A') {
      aces++;
      score += 11;
    } else if (['J', 'Q', 'K'].includes(card.value)) {
      score += 10;
    } else {
      score += parseInt(card.value);
    }
  });

  // エースの調整
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }

  return score;
}

function formatCards(cards) {
  return cards.map(card => `${card.suit}${card.value}`).join(' ');
}

module.exports = {
  startBlackjack,
  playBlackjackAction,
  finishBlackjack,
  playSlot,
  playRoulette,
  startKakeGame,
  joinKakeGame,
  executeKakeGame
};
