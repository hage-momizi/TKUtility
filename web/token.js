let authToken = null;
let balancePoller = null;
let lastBalance = null;
let alertConfig = null;

const tokenInput = document.getElementById('tokenInput');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginStatus = document.getElementById('loginStatus');
const balanceInfo = document.getElementById('balanceInfo');
const balanceTimestamp = document.getElementById('balanceTimestamp');
const currentRateDisplay = document.getElementById('currentRateDisplay');
const tradeSummary = document.getElementById('tradeSummary');
const tradeResult = document.getElementById('tradeResult');
const tradeLog = document.getElementById('tradeLog');
const executeTradeBtn = document.getElementById('executeTradeBtn');
const tradeAmountInput = document.getElementById('tradeAmount');
const tradeTypeInputs = document.querySelectorAll('input[name="tradeType"]');
const alertRateInput = document.getElementById('alertRate');
const confirmTradeModalEl = document.getElementById('tradeConfirmModal');
const confirmTradeBtn = document.getElementById('confirmTradeBtn');
const confirmType = document.getElementById('confirmType');
const confirmAmount = document.getElementById('confirmAmount');
const confirmEstimate = document.getElementById('confirmEstimate');
const confirmTradeTypeInput = document.getElementById('confirmTradeType');
let confirmModalInstance = null;
const alertDirectionSelect = document.getElementById('alertDirection');
const setAlertBtn = document.getElementById('setAlertBtn');
const clearAlertBtn = document.getElementById('clearAlertBtn');
const alertSound = document.getElementById('alertSound');

function setLoading(state, message = '') {
  loginBtn.disabled = state;
  loginBtn.textContent = state ? 'ログイン中...' : 'ログイン';
  if (message) {
    loginStatus.textContent = message;
  }
}

function getTradeEstimate(amount, type, rate) {
    if (type === 'buy') {
        const tkupNeeded = Math.round(amount * rate * 1.03 * 100) / 100;
        return `${tkupNeeded.toFixed(2)} TKUP (手数料3%)`;
    }
    const gross = amount * rate;
    const fee = Math.round(gross * 0.02 * 100) / 100;
    const tkupReceived = Math.round((gross - fee) * 100) / 100;
    return `${tkupReceived.toFixed(2)} TKUP (手数料2%)`;
}

function updateTradeSummary() {
    const amount = Number(tradeAmountInput.value) || 0;
    const type = document.querySelector('input[name="tradeType"]:checked').value;
    if (!lastBalance) {
        tradeSummary.textContent = '取引内容: --';
        return;
    }
    const rate = lastBalance.rate;
    const estimate = getTradeEstimate(amount, type, rate);
    tradeSummary.textContent = `${type === 'buy' ? '購入' : '売却'}: ${amount.toFixed(2)} TKUC / ${estimate}`;
}

function renderBalance(data) {
  if (!data) {
    balanceInfo.innerHTML = '<div class="text-muted">残高情報を取得できませんでした。</div>';
    return;
  }

  const { balance, rate } = data;
  balanceInfo.innerHTML = `
    <div class="balance-line">TKUP: <strong>${balance.tkup.toFixed(2)}</strong></div>
    <div class="balance-line">TKUC: <strong>${balance.tkuc.toFixed(2)}</strong></div>
    <div class="balance-line mt-2">現在レート: <strong>${rate.toFixed(2)} TKUP</strong></div>
  `;

  currentRateDisplay.textContent = `${rate.toFixed(2)}`;
  balanceTimestamp.textContent = new Date().toLocaleTimeString('ja-JP');

  checkAlert(rate);
}

function appendTradeLog(entry) {
  const li = document.createElement('li');
  li.className = 'trade-log-entry';
  li.innerHTML = `
    <div class="trade-log-title">${entry.title}</div>
    <div class="trade-log-body">${entry.detail}</div>
    <div class="trade-log-time">${new Date().toLocaleString('ja-JP')}</div>
  `;
  tradeLog.prepend(li);
}

function setTradeState(enabled) {
  executeTradeBtn.disabled = !enabled;
  tradeAmountInput.disabled = !enabled;
  tradeTypeInputs.forEach(input => input.disabled = !enabled);
}

async function login(isAutoLogin = false) {
  const token = (tokenInput.value || '').trim();
  if (!token) {
    if (!isAutoLogin) {
      loginStatus.textContent = 'トークンを入力してください。';
    }
    return;
  }

  if (!isAutoLogin) {
    setLoading(true, '認証中...');
  }
  try {
    const response = await fetch('/api/token-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error((await response.json()).error || 'ログインに失敗しました。');
    }

    const data = await response.json();
    authToken = token;
    // トークンをローカルストレージに保存
    localStorage.setItem('tkuc_token', authToken);
    if (!isAutoLogin) {
      loginStatus.textContent = `ログイン成功: ${data.user.displayName || data.user.username}`;
    } else {
      loginStatus.textContent = `自動ログイン成功: ${data.user.displayName || data.user.username}`;
    }
    loginBtn.disabled = true;
    logoutBtn.disabled = false;
    tokenInput.disabled = true;
    lastBalance = data;
    renderBalance(data);
    setTradeState(true);
    startPolling();
  } catch (error) {
    authToken = null;
    if (!isAutoLogin) {
      loginStatus.textContent = error.message;
      balanceInfo.innerHTML = '<div class="text-danger">認証に失敗しました。</div>';
    } else {
      // 自動ログイン失敗時はローカルストレージから削除
      localStorage.removeItem('tkuc_token');
      loginStatus.textContent = '自動ログインに失敗しました。';
      balanceInfo.innerHTML = '<div class="text-muted">ログインして残高を表示</div>';
    }
    setTradeState(false);
  } finally {
    if (!isAutoLogin) {
      setLoading(false);
    }
  }
}

function logout() {
  stopPolling();
  authToken = null;
  // ローカルストレージからトークンを削除
  localStorage.removeItem('tkuc_token');
  tokenInput.disabled = false;
  loginBtn.disabled = false;
  logoutBtn.disabled = true;
  tokenInput.value = '';
  balanceInfo.innerHTML = '<div class="text-muted">ログインして残高を表示</div>';
  currentRateDisplay.textContent = '--.--';
  balanceTimestamp.textContent = '';
  tradeResult.textContent = '';
  tradeSummary.textContent = '取引内容: --';
  lastBalance = null;
  loginStatus.textContent = 'ログアウトしました。';
  setTradeState(false);
}

function startPolling() {
  stopPolling();
  balancePoller = setInterval(fetchBalance, 2000);
  fetchBalance();
}

function stopPolling() {
  if (balancePoller) {
    clearInterval(balancePoller);
    balancePoller = null;
  }
}

async function fetchBalance() {
  if (!authToken) return;
  try {
    const url = `/api/token-balance?token=${encodeURIComponent(authToken)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('残高取得に失敗しました');
    }
    const data = await response.json();
    lastBalance = data;
    renderBalance(data);
    updateTradeSummary();
  } catch (error) {
    console.error(error);
    loginStatus.textContent = '残高更新中にエラーが発生しました。';
  }
}

async function executeTrade() {
    if (!authToken) return;
    const amount = Number(tradeAmountInput.value);
    if (!amount || amount <= 0) {
        tradeResult.innerHTML = '<div class="text-danger">数量を入力してください。</div>';
        return;
    }
    const type = document.querySelector('input[name="tradeType"]:checked').value;

    executeTradeBtn.disabled = true;
    tradeResult.innerHTML = '<div class="text-muted">取引実行中...</div>';
    try {
        const response = await fetch('/api/token-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: authToken, type, amount })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || '取引に失敗しました。');
        }

        lastBalance = data;
        renderBalance(data);
        appendTradeLog({
            title: type === 'buy' ? '購入成功' : '売却成功',
            detail: data.message
        });
        tradeResult.innerHTML = `<div class="text-success">${data.message}</div>`;
        tradeAmountInput.value = '';
        updateTradeSummary();
    } catch (error) {
        appendTradeLog({
            title: '取引エラー',
            detail: error.message
        });
        tradeResult.innerHTML = `<div class="text-danger">${error.message}</div>`;
    } finally {
        executeTradeBtn.disabled = false;
    }
}

function openTradeConfirmModal() {
    if (!authToken) return;
    const amount = Number(tradeAmountInput.value);
    if (!amount || amount <= 0) {
        tradeResult.innerHTML = '<div class="text-danger">数量を入力してください。</div>';
        return;
    }
    if (!lastBalance) {
        tradeResult.innerHTML = '<div class="text-danger">レート情報が取得できていません。</div>';
        return;
    }
    const type = document.querySelector('input[name="tradeType"]:checked').value;
    const estimate = getTradeEstimate(amount, type, lastBalance.rate);

    if (confirmType) confirmType.textContent = type === 'buy' ? '購入' : '売却';
    if (confirmAmount) confirmAmount.textContent = `${amount.toFixed(2)} TKUC`;
    if (confirmEstimate) confirmEstimate.textContent = estimate;
    if (confirmTradeTypeInput) confirmTradeTypeInput.value = type;

    if (!confirmModalInstance && confirmTradeModalEl && window.bootstrap) {
        confirmModalInstance = new bootstrap.Modal(confirmTradeModalEl);
    }
    if (confirmModalInstance) {
        confirmModalInstance.show();
    }
}

async function confirmTradeExecution() {
    if (confirmModalInstance) {
        confirmModalInstance.hide();
    }
    await executeTrade();
}

function setAlert() {
  const rate = Number(alertRateInput.value);
  if (!rate || rate <= 0) {
    loginStatus.textContent = '有効なレートを入力してください。';
    return;
  }
  alertConfig = {
    rate,
    direction: alertDirectionSelect.value,
    triggered: false
  };
  loginStatus.textContent = `アラート設定: レート ${rate} TKUP ${alertConfig.direction === 'above' ? '以上' : '以下'}で通知します。`;
}

function clearAlert() {
  alertConfig = null;
  loginStatus.textContent = 'アラートを解除しました。';
}

function checkAlert(currentRate) {
  if (!alertConfig || alertConfig.triggered) return;
  if (
    (alertConfig.direction === 'above' && currentRate >= alertConfig.rate) ||
    (alertConfig.direction === 'below' && currentRate <= alertConfig.rate)
  ) {
    alertConfig.triggered = true;
    loginStatus.textContent = `アラート: レートが ${currentRate.toFixed(2)} TKUP になりました。`;
    alertSound.currentTime = 0;
    alertSound.play().catch(() => {});
  }
}

loginBtn.addEventListener('click', login);
logoutBtn.addEventListener('click', logout);
executeTradeBtn.addEventListener('click', openTradeConfirmModal);
tradeAmountInput.addEventListener('input', updateTradeSummary);
tradeTypeInputs.forEach(input => input.addEventListener('change', updateTradeSummary));
setAlertBtn.addEventListener('click', setAlert);
clearAlertBtn.addEventListener('click', clearAlert);
if (confirmTradeBtn) {
    confirmTradeBtn.addEventListener('click', confirmTradeExecution);
}

updateTradeSummary();
setTradeState(false);

// ページロード時にローカルストレージからトークンを復元して自動ログイン
document.addEventListener('DOMContentLoaded', async () => {
  const savedToken = localStorage.getItem('tkuc_token');
  if (savedToken) {
    tokenInput.value = savedToken;
    await login(true);
  }
});
