let authToken = null;
let accessKey = null;
let secretKey = null;
let balancePoller = null;
let lastBalance = null;
let alertConfig = null;

const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginStatus = document.getElementById('loginStatus');
const keyFileInput = document.getElementById('keyFileInput');
const manualTokenInput = document.getElementById('manualTokenInput');
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

// 古いlogin関数は削除 - loginWithModal関数を使用

function logout() {
  stopPolling();
  accessKey = null;
  secretKey = null;

  // UI切り替え: ログイン画面表示、メインコンテンツ非表示
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainContent').style.display = 'none';

  // ナビゲーションボタン更新
  const navLoginBtn = document.querySelector('#authButtons .btn-primary');
  const navLogoutBtn = document.querySelector('#authButtons .btn-outline-secondary');
  if (navLoginBtn) navLoginBtn.style.display = 'inline-block';
  if (navLogoutBtn) navLogoutBtn.disabled = true;

  balanceInfo.innerHTML = '<div class="text-muted">ログインして残高を表示</div>';
  currentRateDisplay.textContent = '--.--';
  balanceTimestamp.textContent = '';
  tradeResult.textContent = '';
  tradeSummary.textContent = '取引内容: --';
  lastBalance = null;
  setTradeState(false);

  // ユーザー情報クリア
  const userInfoEl = document.getElementById('userInfo');
  if (userInfoEl) {
    userInfoEl.innerHTML = 'ログインしていません';
  }
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
  if (!accessKey || !secretKey) return;

  const timestamp = Date.now().toString();
  const message = timestamp + JSON.stringify({});
  const signature = crypto.createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');

  try {
    const url = `/api/keys-balance?accessKey=${encodeURIComponent(accessKey)}&signature=${encodeURIComponent(signature)}&timestamp=${timestamp}`;
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
    if (!accessKey || !secretKey) return;
    const amount = Number(tradeAmountInput.value);
    if (!amount || amount <= 0) {
        tradeResult.innerHTML = '<div class="text-danger">数量を入力してください。</div>';
        return;
    }
    const type = document.querySelector('input[name="tradeType"]:checked').value;

    const timestamp = Date.now().toString();
    const body = { type, amount };
    const message = timestamp + JSON.stringify(body);
    const signature = crypto.createHmac('sha256', secretKey)
      .update(message)
      .digest('hex');

    executeTradeBtn.disabled = true;
    tradeResult.innerHTML = '<div class="text-muted">取引実行中...</div>';
    try {
        const response = await fetch('/api/keys-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-access-key': accessKey,
              'x-signature': signature,
              'x-timestamp': timestamp
            },
            body: JSON.stringify(body)
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
    if (!accessKey || !secretKey) return;
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

logoutBtn.addEventListener('click', logout);
executeTradeBtn.addEventListener('click', openTradeConfirmModal);
tradeAmountInput.addEventListener('input', updateTradeSummary);
tradeTypeInputs.forEach(input => input.addEventListener('change', updateTradeSummary));
setAlertBtn.addEventListener('click', setAlert);
clearAlertBtn.addEventListener('click', clearAlert);
if (confirmTradeBtn) {
    confirmTradeBtn.addEventListener('click', confirmTradeExecution);
}

function showLoginModal() {
  // モーダルを表示
  const modalEl = document.getElementById('loginModal');
  if (modalEl && window.bootstrap) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
}

async function loginWithModal() {
  let accessKeyInput, secretKeyInput;

  // ファイルが選択されている場合
  if (keyFileInput.files.length > 0) {
    const file = keyFileInput.files[0];
    try {
      const content = await file.text();
      const lines = content.split('\n');
      const accessKeyLine = lines.find(line => line.includes('Access Key:'));
      const secretKeyLine = lines.find(line => line.includes('Secret Key:'));

      if (accessKeyLine && secretKeyLine) {
        accessKeyInput = accessKeyLine.split('Access Key:')[1].trim();
        secretKeyInput = secretKeyLine.split('Secret Key:')[1].trim();
      } else {
        // JSON形式の場合
        const jsonData = JSON.parse(content);
        if (jsonData.token) {
          const parts = jsonData.token.split(':');
          if (parts.length === 2) {
            accessKeyInput = parts[0];
            secretKeyInput = parts[1];
          }
        }
      }
    } catch (error) {
      loginStatus.textContent = 'ファイルの読み込みに失敗しました。';
      return;
    }
  }
  // 手動入力の場合
  else if (manualTokenInput.value.trim()) {
    const parts = manualTokenInput.value.split(':');
    if (parts.length !== 2) {
      loginStatus.textContent = '形式: TKU-XXXXXX:YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY';
      return;
    }
    accessKeyInput = parts[0].trim();
    secretKeyInput = parts[1].trim();
  } else {
    loginStatus.textContent = 'ファイルを選択するか、手動で入力してください。';
    return;
  }

  if (!accessKeyInput.startsWith('TKU-')) {
    loginStatus.textContent = 'Access KeyはTKU-で始まる必要があります。';
    return;
  }

  setLoading(true, '認証中...');
  try {
    const response = await fetch('/api/keys-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessKey: accessKeyInput, secretKey: secretKeyInput })
    });

    if (!response.ok) {
      throw new Error((await response.json()).error || 'ログインに失敗しました。');
    }

    const data = await response.json();
    accessKey = accessKeyInput;
    secretKey = secretKeyInput;

    // モーダルを閉じる
    const modalEl = document.getElementById('loginModal');
    if (modalEl && window.bootstrap) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    // UI切り替え
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';

    // ユーザー情報表示
    const userInfoEl = document.getElementById('userInfo');
    if (userInfoEl) {
      userInfoEl.innerHTML = `
        <div><strong>${data.user.displayName || data.user.username}</strong></div>
        <div class="text-muted small">${data.guild.name}</div>
      `;
    }

    // ナビゲーションボタン更新
    const navLoginBtn = document.querySelector('#authButtons .btn-primary');
    const navLogoutBtn = document.querySelector('#authButtons .btn-outline-secondary');
    if (navLoginBtn) navLoginBtn.style.display = 'none';
    if (navLogoutBtn) navLogoutBtn.disabled = false;

    lastBalance = data;
    renderBalance(data);
    setTradeState(true);
    startPolling();

    // チャート初期化
    await initChart();
    await updateMarketData();
    startRealtimeUpdates();

  } catch (error) {
    accessKey = null;
    secretKey = null;
    loginStatus.textContent = error.message;
  } finally {
    setLoading(false);
  }
}

updateTradeSummary();
setTradeState(false);

// モーダルのログインボタンにイベントリスナーを追加
document.addEventListener('DOMContentLoaded', function() {
  const modalLoginBtn = document.querySelector('#loginModal .btn-primary');
  if (modalLoginBtn) {
    modalLoginBtn.addEventListener('click', loginWithModal);
  }
});
