let authToken = null;
let accessKey = null;
let secretKey = null;
let balancePoller = null;
let lastBalance = null;
let alertConfig = null;

let loginBtn, logoutBtn, loginStatus, keyFileInput, manualTokenInput;
let balanceInfo, balanceTimestamp, currentRateDisplay;
let tradeSummary, tradeResult, tradeLog;
let executeTradeBtn, tradeAmountInput, tradeTypeInputs;
let alertRateInput, confirmTradeModalEl, confirmTradeBtn;
let confirmType, confirmAmount, confirmEstimate, confirmTradeTypeInput;
let confirmModalInstance = null;
let alertDirectionSelect, setAlertBtn, clearAlertBtn, alertSound;

function setLoading(state, message = '') {
  if (loginBtn) {
    loginBtn.disabled = state;
    loginBtn.textContent = state ? 'ログイン中...' : 'ログイン';
  }
  if (loginStatus && message) {
    loginStatus.textContent = message;
  }
}

function setLogoutBtnSidebarState(disabled) {
  const logoutBtnSidebar = document.getElementById('logoutBtnSidebar');
  if (logoutBtnSidebar) {
    logoutBtnSidebar.disabled = disabled;
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
    if (!tradeAmountInput || !tradeSummary) return;

    const amount = Number(tradeAmountInput.value) || 0;
    const tradeTypeInput = document.querySelector('input[name="tradeType"]:checked');
    if (!tradeTypeInput) {
        tradeSummary.textContent = '取引内容: --';
        return;
    }

    const type = tradeTypeInput.value;
    if (!lastBalance) {
        tradeSummary.textContent = '取引内容: --';
        return;
    }
    const rate = lastBalance.rate;
    const estimate = getTradeEstimate(amount, type, rate);
    tradeSummary.textContent = `${type === 'buy' ? '購入' : '売却'}: ${amount.toFixed(2)} TKUC / ${estimate}`;
}

function renderBalance(data) {
  if (!data || !balanceInfo) {
    if (balanceInfo) {
      balanceInfo.innerHTML = '<div class="text-muted">残高情報を取得できませんでした。</div>';
    }
    return;
  }

  const { balance, rate } = data;
  balanceInfo.innerHTML = `
    <div class="balance-line">TKUP: <strong>${balance.tkup.toFixed(2)}</strong></div>
    <div class="balance-line">TKUC: <strong>${balance.tkuc.toFixed(2)}</strong></div>
    <div class="balance-line mt-2">現在レート: <strong>${rate.toFixed(2)} TKUP</strong></div>
  `;

  if (currentRateDisplay) currentRateDisplay.textContent = `${rate.toFixed(2)}`;
  if (balanceTimestamp) balanceTimestamp.textContent = new Date().toLocaleTimeString('ja-JP');

  checkAlert(rate);
}

function appendTradeLog(entry) {
  if (!tradeLog) return;

  const li = document.createElement('li');
  li.className = 'trade-log-entry';
  li.innerHTML = `
    <div class="trade-log-title">${entry.title}</div>
    <div class="trade-log-body">${entry.detail}</div>
    <div class="trade-log-time">${new Date().toLocaleString('ja-JP')}</div>
  `;
  tradeLog.prepend(li);
}

function setTradeState(loggedIn) {
  if (executeTradeBtn) {
    executeTradeBtn.disabled = false;
    if (loggedIn) {
      executeTradeBtn.onclick = openTradeConfirmModal;
    } else {
      executeTradeBtn.onclick = showLoginModal;
    }
  }
  if (tradeAmountInput) tradeAmountInput.disabled = !loggedIn;
  if (tradeTypeInputs) tradeTypeInputs.forEach(input => input.disabled = !loggedIn);
}

// 古いlogin関数は削除 - loginWithModal関数を使用

function logout() {
  stopPolling();
  accessKey = null;
  secretKey = null;

  // モーダルを閉じる
  const modalEl = document.getElementById('loginModal');
  if (modalEl && window.Bootstrap) {
    const modal = window.Bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  // ナビゲーションボタン更新
  const navLoginBtn = document.getElementById('loginBtnNav');
  const navLogoutBtn = document.getElementById('logoutBtnNav');
  if (navLoginBtn) navLoginBtn.style.display = 'inline-block';
  if (navLogoutBtn) navLogoutBtn.disabled = true;

  // 入力をリセット
  if (keyFileInput) keyFileInput.value = '';
  if (manualTokenInput) manualTokenInput.value = '';
  if (loginStatus) loginStatus.textContent = '';
  if (balanceInfo) balanceInfo.innerHTML = '<div class="text-muted">ログインして残高を表示</div>';
  if (currentRateDisplay) currentRateDisplay.textContent = '--.--';
  if (balanceTimestamp) balanceTimestamp.textContent = '';
  if (tradeResult) tradeResult.textContent = '';
  if (tradeSummary) tradeSummary.textContent = '取引内容: --';
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
    if (loginStatus) loginStatus.textContent = '残高更新中にエラーが発生しました。';
  }
}

async function executeTrade() {
    if (!accessKey || !secretKey) return;

    // nullチェック
    if (!tradeAmountInput || !tradeResult) {
        if (tradeResult) {
          tradeResult.innerHTML = '<div class="text-danger">入力要素が見つかりません。</div>';
        }
        return;
    }

    const amount = Number(tradeAmountInput.value);
    if (!amount || amount <= 0) {
        tradeResult.innerHTML = '<div class="text-danger">数量を入力してください。</div>';
        return;
    }

    const tradeTypeInput = document.querySelector('input[name="tradeType"]:checked');
    if (!tradeTypeInput) {
        tradeResult.innerHTML = '<div class="text-danger">取引種別が選択されていません。</div>';
        return;
    }

    const type = tradeTypeInput.value;

    const timestamp = Date.now().toString();
    const body = { type, amount };
    const message = timestamp + JSON.stringify(body);
    const signature = crypto.createHmac('sha256', secretKey)
      .update(message)
      .digest('hex');

    if (executeTradeBtn) executeTradeBtn.disabled = true;
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
        if (executeTradeBtn) executeTradeBtn.disabled = false;
    }
}

function openTradeConfirmModal() {
    if (!accessKey || !secretKey) return;

    // nullチェック
    if (!tradeAmountInput || !tradeResult) return;

    const amount = Number(tradeAmountInput.value);
    if (!amount || amount <= 0) {
        tradeResult.innerHTML = '<div class="text-danger">数量を入力してください。</div>';
        return;
    }
    if (!lastBalance) {
        tradeResult.innerHTML = '<div class="text-danger">レート情報が取得できていません。</div>';
        return;
    }

    const tradeTypeInput = document.querySelector('input[name="tradeType"]:checked');
    if (!tradeTypeInput) {
        tradeResult.innerHTML = '<div class="text-danger">取引種別が選択されていません。</div>';
        return;
    }

    const type = tradeTypeInput.value;
    const estimate = getTradeEstimate(amount, type, lastBalance.rate);

    if (confirmType) confirmType.textContent = type === 'buy' ? '購入' : '売却';
    if (confirmAmount) confirmAmount.textContent = `${amount.toFixed(2)} TKUC`;
    if (confirmEstimate) confirmEstimate.textContent = estimate;
    if (confirmTradeTypeInput) confirmTradeTypeInput.value = type;

    if (!confirmModalInstance && confirmTradeModalEl && window.Bootstrap) {
        confirmModalInstance = new window.Bootstrap.Modal(confirmTradeModalEl);
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

// イベントリスナーはDOMContentLoaded内で設定

function showLoginModal() {
  // モーダルを表示
  const modalEl = document.getElementById('loginModal');
  if (modalEl && window.Bootstrap) {
    const modal = new window.Bootstrap.Modal(modalEl);
    modal.show();
  }
}

async function loginWithModal() {
  // nullチェック - DOM要素が取得できているか確認
  if (!keyFileInput || !manualTokenInput || !loginStatus) {
    console.error('ログインに必要なDOM要素が見つかりません');
    return;
  }

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

  // モーダル内ボタンの状態変更
  const modalLoginBtn = document.getElementById('modalLoginBtn');
  if (modalLoginBtn) {
    modalLoginBtn.disabled = true;
    modalLoginBtn.textContent = '認証中...';
  }
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
    if (modalEl && window.Bootstrap) {
      const modal = window.Bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    // ユーザー情報表示
    const userInfoEl = document.getElementById('userInfo');
    if (userInfoEl) {
      userInfoEl.innerHTML = `
        <div><strong>${data.user.displayName || data.user.username}</strong></div>
        <div class="text-muted small">${data.guild.name}</div>
      `;
    }

    // ナビゲーションボタン更新
    const navLoginBtn = document.getElementById('loginBtnNav');
    const navLogoutBtn = document.getElementById('logoutBtnNav');
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
    // モーダル内ボタンの状態リセット
    const modalLoginBtn = document.getElementById('modalLoginBtn');
    if (modalLoginBtn) {
      modalLoginBtn.disabled = false;
      modalLoginBtn.textContent = '認証';
    }
    // ログインボタンの状態リセット
    setLoading(false);
  }
}

// グローバル関数として公開
window.showLoginModal = showLoginModal;
window.logout = logout;

// DOMContentLoadedイベントで初期化
document.addEventListener('DOMContentLoaded', function() {
  // DOM要素の取得
  loginBtn = document.getElementById('loginBtnNav');
  logoutBtn = document.getElementById('logoutBtnNav');
  loginStatus = document.getElementById('loginStatus');
  keyFileInput = document.getElementById('keyFileInput');
  manualTokenInput = document.getElementById('manualTokenInput');
  balanceInfo = document.getElementById('balanceInfo');
  balanceTimestamp = document.getElementById('balanceTimestamp');
  currentRateDisplay = document.getElementById('currentRateDisplay');
  tradeSummary = document.getElementById('tradeSummary');
  tradeResult = document.getElementById('tradeResult');
  tradeLog = document.getElementById('tradeLog');
  executeTradeBtn = document.getElementById('executeTradeBtn');
  tradeAmountInput = document.getElementById('tradeAmount');
  tradeTypeInputs = document.querySelectorAll('input[name="tradeType"]');
  alertRateInput = document.getElementById('alertRate');
  confirmTradeModalEl = document.getElementById('tradeConfirmModal');
  confirmTradeBtn = document.getElementById('confirmTradeBtn');
  confirmType = document.getElementById('confirmType');
  confirmAmount = document.getElementById('confirmAmount');
  confirmEstimate = document.getElementById('confirmEstimate');
  confirmTradeTypeInput = document.getElementById('confirmTradeType');
  alertDirectionSelect = document.getElementById('alertDirection');
  setAlertBtn = document.getElementById('setAlertBtn');
  clearAlertBtn = document.getElementById('clearAlertBtn');
  alertSound = document.getElementById('alertSound');

  // イベントリスナーの設定
  if (loginBtn) loginBtn.addEventListener('click', showLoginModal);
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
  if (tradeAmountInput) tradeAmountInput.addEventListener('input', updateTradeSummary);
  if (tradeTypeInputs) tradeTypeInputs.forEach(input => input.addEventListener('change', updateTradeSummary));
  if (setAlertBtn) setAlertBtn.addEventListener('click', setAlert);
  if (clearAlertBtn) clearAlertBtn.addEventListener('click', clearAlert);
  if (confirmTradeBtn) confirmTradeBtn.addEventListener('click', confirmTradeExecution);

  // モーダルのログインボタン
  const modalLoginBtn = document.getElementById('modalLoginBtn');
  if (modalLoginBtn) {
    modalLoginBtn.addEventListener('click', loginWithModal);
  }

  // 初期化
  updateTradeSummary();
  setTradeState(false);
});
