// アラート管理クラス
class AlertManager {
    constructor() {
        this.audioContext = null;
        this.audioBuffers = {};
        this.init();
    }

    async init() {
        try {
            // AudioContextの初期化（ユーザーインタラクションが必要）
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            await this.loadAudioBuffers();
        } catch (error) {
            console.warn('Audio context initialization failed:', error);
        }
    }

    async loadAudioBuffers() {
        if (!this.audioContext) return;

        // シンプルな音声生成（Web Audio API）
        this.createTradeSound();
        this.createRateChangeSound();
    }

    createTradeSound() {
        // 取引完了時の「カチン」という音
        const duration = 0.1;
        const sampleRate = this.audioContext.sampleRate;
        const frameCount = sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
        const channelData = buffer.getChannelData(0);

        for (let i = 0; i < frameCount; i++) {
            const t = i / sampleRate;
            // 急速に減衰するクリック音
            channelData[i] = Math.sin(1000 * Math.PI * t) * Math.exp(-t * 50) * 0.3;
        }

        this.audioBuffers.trade = buffer;
    }

    createRateChangeSound() {
        // レート変動時の「ピロン」という音
        const duration = 0.3;
        const sampleRate = this.audioContext.sampleRate;
        const frameCount = sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
        const channelData = buffer.getChannelData(0);

        for (let i = 0; i < frameCount; i++) {
            const t = i / sampleRate;
            // 徐々に上昇するトーン
            const frequency = 800 + (t * 200);
            channelData[i] = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 2) * 0.2;
        }

        this.audioBuffers.rateChange = buffer;
    }

    async playTradeAlert() {
        if (!this.audioContext || !this.audioBuffers.trade) return;

        try {
            // AudioContextがサスペンド状態の場合、再開
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            const source = this.audioContext.createBufferSource();
            source.buffer = this.audioBuffers.trade;
            source.connect(this.audioContext.destination);
            source.start();

            console.log('🎵 Trade alert sound played');
        } catch (error) {
            console.warn('Failed to play trade alert:', error);
        }
    }

    async playRateChangeAlert() {
        if (!this.audioContext || !this.audioBuffers.rateChange) return;

        try {
            // AudioContextがサスペンド状態の場合、再開
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            const source = this.audioContext.createBufferSource();
            source.buffer = this.audioBuffers.rateChange;
            source.connect(this.audioContext.destination);
            source.start();

            console.log('🎵 Rate change alert sound played');
        } catch (error) {
            console.warn('Failed to play rate change alert:', error);
        }
    }

    triggerRateAlert(changePercent, currentRate) {
        if (!document.getElementById('rate-alerts').checked) return;

        const direction = changePercent > 0 ? '上昇' : '下降';
        const message = `レート${direction}: ${Math.abs(changePercent).toFixed(2)}% (${currentRate.toFixed(2)} TKUP)`;

        // 通知表示
        this.showNotification('レート変動', message, 'warning');

        // 音声アラート
        this.playRateChangeAlert();
    }

    showNotification(title, message, type = 'info') {
        // ブラウザの通知APIを使用（許可されている場合）
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: '/favicon.ico', // 必要に応じて変更
                tag: 'tkuc-alert'
            });
        }

        // 画面内通知も表示
        this.showInAppNotification(title, message, type);
    }

    showInAppNotification(title, message, type) {
        // 既存の通知を削除
        const existingNotifications = document.querySelectorAll('.notification-toast');
        existingNotifications.forEach(notification => notification.remove());

        // 新しい通知を作成
        const notification = document.createElement('div');
        notification.className = `notification-toast ${type}`;
        notification.innerHTML = `
            <div class="notification-header">
                <strong>${title}</strong>
                <button class="notification-close">&times;</button>
            </div>
            <div class="notification-body">
                ${message}
            </div>
        `;

        // スタイル追加
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--darker);
            border: 1px solid var(--gray-600);
            border-radius: var(--border-radius);
            padding: 1rem;
            max-width: 300px;
            z-index: 1001;
            box-shadow: var(--shadow-lg);
            animation: slideInRight 0.3s ease;
            color: var(--light);
        `;

        // タイプ別の色設定
        if (type === 'success') {
            notification.style.borderColor = 'var(--success)';
        } else if (type === 'warning') {
            notification.style.borderColor = 'var(--warning)';
        } else if (type === 'danger') {
            notification.style.borderColor = 'var(--danger)';
        }

        // 閉じるボタン
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });

        // 自動削除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);

        document.body.appendChild(notification);
    }

    // 通知権限のリクエスト
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    console.log('Notification permission granted');
                }
            });
        }
    }

    // ブラウザ通知のテスト
    testBrowserNotification() {
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification('TKUC Alert Test', {
                    body: 'これは通知テストです',
                    icon: '/favicon.ico'
                });
            } else if (Notification.permission === 'default') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        this.testBrowserNotification();
                    }
                });
            }
        }
    }
}

// CSSアニメーションの追加
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }

    .notification-toast {
        font-family: var(--font-family);
        font-size: 0.875rem;
    }

    .notification-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }

    .notification-close {
        background: none;
        border: none;
        color: var(--gray-400);
        cursor: pointer;
        font-size: 1.25rem;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .notification-close:hover {
        color: var(--light);
    }
`;
document.head.appendChild(style);

// グローバルインスタンス
const alertManager = new AlertManager();

// ページ読み込み時に通知権限をリクエスト
document.addEventListener('DOMContentLoaded', () => {
    alertManager.requestNotificationPermission();
});
