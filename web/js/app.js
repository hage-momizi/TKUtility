// メインアプリ統合ファイル
document.addEventListener('DOMContentLoaded', function() {
    console.log('🪙 TKUC Trading Panel initialized');

    // チャートマネージャーにアラートマネージャーを設定
    chartManager.setAlertManager(alertManager);

    // 定期的なバランス更新（30秒ごと）
    setInterval(() => {
        if (authManager.isLoggedIn()) {
            authManager.updateBalance();
        }
    }, 30000);

    // ページ表示時の初期化
    initializeApp();

    // キーボードショートカット
    document.addEventListener('keydown', function(e) {
        // ESCでモーダルを閉じる
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal.show');
            modals.forEach(modal => {
                const bsModal = bootstrap.Modal.getInstance(modal);
                if (bsModal) bsModal.hide();
            });
        }

        // Ctrl/Cmd + R でレート更新（手動）
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            chartManager.updateCurrentRate();
            tradeManager.updateCurrentRate();
        }
    });

    // ブラウザの戻るボタン/進むボタン対応
    window.addEventListener('popstate', function(e) {
        // 必要に応じて状態管理を実装
    });

    // ページの可視性変更時の処理
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            // ページが非表示になったとき
            console.log('Page hidden - pausing updates');
        } else {
            // ページが表示されたとき
            console.log('Page visible - resuming updates');
            // 必要に応じてデータを更新
            if (authManager.isLoggedIn()) {
                chartManager.updateCurrentRate();
                authManager.updateBalance();
            }
        }
    });
});

function initializeApp() {
    // ローディング画面を表示
    showSplashScreen();

    // 基本的な機能チェック
    checkBrowserSupport();

    // 初期化完了後にスプラッシュを非表示
    setTimeout(() => {
        hideSplashScreen();
        showWelcomeMessage();
    }, 1000);
}

function showSplashScreen() {
    const splash = document.createElement('div');
    splash.id = 'splash-screen';
    splash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, var(--darker) 0%, var(--dark) 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        color: var(--light);
        font-family: var(--font-family);
    `;

    splash.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🪙</div>
            <h1 style="font-size: 2rem; margin-bottom: 0.5rem; background: linear-gradient(45deg, var(--primary), #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                TKUC Trading Panel
            </h1>
            <p style="color: var(--gray-400); margin-bottom: 2rem;">Loading...</p>
            <div style="width: 40px; height: 40px; border: 4px solid rgba(255, 255, 255, 0.1); border-left: 4px solid var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        </div>
    `;

    document.body.appendChild(splash);
}

function hideSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.style.animation = 'fadeOut 0.5s ease';
        setTimeout(() => splash.remove(), 500);
    }
}

function showWelcomeMessage() {
    if (!authManager.isLoggedIn()) {
        // 初回訪問時のウェルカムメッセージ
        const hasVisited = localStorage.getItem('tkuc_visited');
        if (!hasVisited) {
            setTimeout(() => {
                authManager.showModal('ようこそ', 'TKUC Trading Panelへようこそ！\n\nDiscordの/tk-tokenコマンドでAPIキーを取得して、取引を開始しましょう。');
                localStorage.setItem('tkuc_visited', 'true');
            }, 1000);
        }
    }
}

function checkBrowserSupport() {
    const issues = [];

    // Web Audio APIサポートチェック
    if (!window.AudioContext && !window.webkitAudioContext) {
        issues.push('Web Audio API');
    }

    // LocalStorageサポートチェック
    try {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
    } catch (e) {
        issues.push('LocalStorage');
    }

    // Fetch APIサポートチェック
    if (!window.fetch) {
        issues.push('Fetch API');
    }

    // Lightweight Chartsサポートチェック
    if (typeof LightweightCharts === 'undefined') {
        issues.push('Lightweight Charts library');
    }

    if (issues.length > 0) {
        console.warn('Browser compatibility issues detected:', issues);
        // 必要に応じてユーザーに通知
        setTimeout(() => {
            authManager.showModal('ブラウザ互換性', `一部の機能がサポートされていない可能性があります:\n${issues.join(', ')}\n\n最新のブラウザを使用することを推奨します。`);
        }, 2000);
    }
}

// グローバルエラーハンドリング
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    // 必要に応じてエラーレポート
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    // 必要に応じてエラーレポート
});

// サービスワーカー（PWA対応、将来拡張用）
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // 将来のPWA実装用
        // navigator.serviceWorker.register('/sw.js');
    });
}

// 開発者コンソール用ヘルパー関数
window.TKUC = {
    // デバッグ情報表示
    debug: function() {
        console.log('=== TKUC Debug Info ===');
        console.log('User:', authManager.user);
        console.log('Logged in:', authManager.isLoggedIn());
        console.log('Chart type:', chartManager.currentChartType);
        console.log('Current rate:', tradeManager.currentRate);
        console.log('Audio enabled:', !!alertManager.audioContext);
    },

    // テスト取引
    testTrade: function(type, amount) {
        if (!authManager.isLoggedIn()) {
            console.error('Not logged in');
            return;
        }
        console.log(`Testing ${type} trade: ${amount} TKUC`);
        // 実際の取引は実行しない
    },

    // 通知テスト
    testNotification: function() {
        alertManager.testBrowserNotification();
        alertManager.playTradeAlert();
    },

    // レートアラートテスト
    testRateAlert: function(change = 5.5) {
        alertManager.triggerRateAlert(change, tradeManager.currentRate);
    }
};

// 追加のCSSアニメーション
const additionalStyles = document.createElement('style');
additionalStyles.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }

    /* 開発者モード時の視覚インジケーター */
    .dev-mode {
        position: fixed;
        bottom: 10px;
        left: 10px;
        background: var(--warning);
        color: var(--darker);
        padding: 0.25rem 0.5rem;
        border-radius: var(--border-radius);
        font-size: 0.75rem;
        font-weight: bold;
        z-index: 1000;
    }
`;
document.head.appendChild(additionalStyles);

// 開発環境での追加機能
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const devIndicator = document.createElement('div');
    devIndicator.className = 'dev-mode';
    devIndicator.textContent = 'DEV';
    devIndicator.title = '開発モード - F12でデバッグコンソールを開けます';
    document.body.appendChild(devIndicator);

    console.log('🚀 Development mode enabled');
    console.log('Available commands: TKUC.debug(), TKUC.testTrade(), TKUC.testNotification()');
}

console.log('✅ TKUC Trading Panel ready!');
