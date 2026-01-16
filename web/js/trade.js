// 取引管理クラス
class TradeManager {
    constructor() {
        this.currentRate = 0;
        this.init();
    }

    init() {
        this.bindEvents();
        this.updateCurrentRate();
        // レート更新を定期的に実行
        setInterval(() => this.updateCurrentRate(), 10000);
    }

    bindEvents() {
        // 購入フォーム
        const buyForm = document.getElementById('buy-form');
        if (buyForm) {
            buyForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.executeBuy();
            });

            document.getElementById('buy-amount').addEventListener('input', (e) => {
                this.updateBuyCost();
            });
        }

        // 売却フォーム
        const sellForm = document.getElementById('sell-form');
        if (sellForm) {
            sellForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.executeSell();
            });

            document.getElementById('sell-amount').addEventListener('input', (e) => {
                this.updateSellReward();
            });
        }

        // 現在のレートで計算を更新
        this.updateCurrentRate();
    }

    switchTradeTab(tab) {
        const buyTab = document.getElementById('buy-tab');
        const sellTab = document.getElementById('sell-tab');
        const buyForm = document.getElementById('buy-form');
        const sellForm = document.getElementById('sell-form');

        if (tab === 'buy') {
            buyTab.classList.add('active');
            sellTab.classList.remove('active');
            buyForm.classList.remove('hidden');
            sellForm.classList.add('hidden');
        } else {
            sellTab.classList.add('active');
            buyTab.classList.remove('active');
            sellForm.classList.remove('hidden');
            buyForm.classList.add('hidden');
        }
    }

    async updateCurrentRate() {
        try {
            const response = await fetch('/api/current-rate');
            const data = await response.json();

            if (data.success) {
                this.currentRate = data.rate;
                this.updateCalculations();
            }
        } catch (error) {
            console.error('Failed to update current rate:', error);
        }
    }

    updateCalculations() {
        this.updateBuyCost();
        this.updateSellReward();
    }

    updateBuyCost() {
        const amount = parseFloat(document.getElementById('buy-amount').value) || 0;
        const cost = amount * this.currentRate * 1.03; // 3%手数料込み
        document.getElementById('buy-cost').textContent = cost.toFixed(2) + ' TKUP';
    }

    updateSellReward() {
        const amount = parseFloat(document.getElementById('sell-amount').value) || 0;
        const gross = amount * this.currentRate;
        const fee = gross * 0.02; // 2%手数料
        const reward = gross - fee;
        document.getElementById('sell-reward').textContent = reward.toFixed(2) + ' TKUP';
    }

    async executeBuy() {
        if (!authManager.isLoggedIn()) {
            authManager.showError('ログインが必要です。');
            return;
        }

        const amount = parseFloat(document.getElementById('buy-amount').value);
        if (!amount || amount <= 0) {
            authManager.showError('有効な数量を入力してください。');
            return;
        }

        authManager.showLoading('購入処理中...');

        try {
            const response = await fetch('/api/token-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token: authManager.sessionToken,
                    type: 'buy',
                    amount: amount
                })
            });

            const data = await response.json();

            if (data.success) {
                authManager.showModal('購入成功', data.message);
                this.updateBalances(data.balance);
                document.getElementById('buy-amount').value = '';

                // 音声アラート
                if (document.getElementById('trade-alerts').checked) {
                    alertManager.playTradeAlert();
                }
            } else {
                authManager.showError(data.error || '購入に失敗しました。');
            }
        } catch (error) {
            console.error('Buy error:', error);
            authManager.showError('ネットワークエラーが発生しました。');
        } finally {
            authManager.hideLoading();
        }
    }

    async executeSell() {
        if (!authManager.isLoggedIn()) {
            authManager.showError('ログインが必要です。');
            return;
        }

        const amount = parseFloat(document.getElementById('sell-amount').value);
        if (!amount || amount <= 0) {
            authManager.showError('有効な数量を入力してください。');
            return;
        }

        authManager.showLoading('売却処理中...');

        try {
            const response = await fetch('/api/token-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token: authManager.sessionToken,
                    type: 'sell',
                    amount: amount
                })
            });

            const data = await response.json();

            if (data.success) {
                authManager.showModal('売却成功', data.message);
                this.updateBalances(data.balance);
                document.getElementById('sell-amount').value = '';

                // 音声アラート
                if (document.getElementById('trade-alerts').checked) {
                    alertManager.playTradeAlert();
                }
            } else {
                authManager.showError(data.error || '売却に失敗しました。');
            }
        } catch (error) {
            console.error('Sell error:', error);
            authManager.showError('ネットワークエラーが発生しました。');
        } finally {
            authManager.hideLoading();
        }
    }

    updateBalances(balance) {
        if (balance) {
            document.getElementById('tkup-balance').textContent = balance.tkup.toLocaleString();
            document.getElementById('tkuc-balance').textContent = balance.tkuc.toFixed(2);
        }
    }

    // バランス更新を外部から呼び出し可能
    refreshBalances() {
        if (authManager.isLoggedIn()) {
            authManager.updateBalance();
        }
    }
}

// グローバルインスタンス
const tradeManager = new TradeManager();
