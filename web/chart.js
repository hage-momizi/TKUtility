// TKUCレートチャート - リアルタイム更新
let chart;
let currentTimeframe = '1m';
let updateInterval;

const API_BASE = window.location.origin;

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    try {
        initializeChart();
        loadInitialData();
        startRealTimeUpdates();

        // ページ離脱時に更新停止
        window.addEventListener('beforeunload', stopRealTimeUpdates);
    } catch (error) {
        console.error('初期化エラー:', error);
        showError('チャートの初期化に失敗しました。ページをリロードしてください。');
    }
});

// チャート初期化
function initializeChart() {
    const ctx = document.getElementById('rateChart').getContext('2d');

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'TKUC/USD',
                data: [],
                borderColor: '#007bff',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#007bff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `レート: ${context.parsed.y.toFixed(2)} TKUP`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    adapters: {
                        date: {
                            locale: 'ja'
                        }
                    },
                    time: {
                        unit: 'minute',
                        displayFormats: {
                            minute: 'HH:mm',
                            hour: 'MM/dd HH:mm'
                        }
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(2) + ' TKUP';
                        }
                    }
                }
            },
            elements: {
                point: {
                    hoverRadius: 8
                }
            }
        }
    });
}

// 初期データ読み込み
async function loadInitialData() {
    try {
        const response = await fetch(`${API_BASE}/api/rate-history?points=50`);
        const data = await response.json();

        if (data.success && data.history.length > 0) {
            updateChart(data.history);
            updateStats(data.currentRate, data.history);
        }
    } catch (error) {
        console.error('初期データ読み込みエラー:', error);
    }
}

// リアルタイム更新開始
function startRealTimeUpdates() {
    updateInterval = setInterval(async () => {
        try {
            // レートデータ更新
            const response = await fetch(`${API_BASE}/api/current-rate`);
            const data = await response.json();

            if (data.success) {
                updateNavbarRate(data.rate);
                updateStats(data.rate);

                // チャートに新規データを追加
                addDataPoint(data.rate, new Date());
            }

            // オーダー板更新
            await updateOrderBook();

        } catch (error) {
            console.error('リアルタイム更新エラー:', error);
        }
    }, 5000); // 5秒毎更新
}

// リアルタイム更新停止
function stopRealTimeUpdates() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
}

// タイムフレーム変更
function setTimeframe(timeframe) {
    currentTimeframe = timeframe;

    // ボタンのアクティブ状態更新
    document.querySelectorAll('.btn-outline-primary').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // チャート再読み込み
    loadTimeframeData(timeframe);
}

// タイムフレーム別データ読み込み
async function loadTimeframeData(timeframe) {
    try {
        const response = await fetch(`${API_BASE}/api/rate-history?timeframe=${timeframe}`);
        const data = await response.json();

        if (data.success) {
            updateChart(data.history);
        }
    } catch (error) {
        console.error('タイムフレームデータ読み込みエラー:', error);
    }
}

// チャート更新
function updateChart(history) {
    const labels = history.map(h => new Date(h.timestamp));
    const data = history.map(h => h.rate);

    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update('none'); // アニメーションなしで更新
}

// チャートにデータポイント追加
function addDataPoint(rate, timestamp) {
    chart.data.labels.push(timestamp);
    chart.data.datasets[0].data.push(rate);

    // 古いデータを削除（最新50件のみ保持）
    if (chart.data.labels.length > 50) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }

    chart.update('none');
}

// ナビバーレート更新
function updateNavbarRate(rate) {
    const rateElement = document.getElementById('current-rate');
    rateElement.textContent = `${rate.toFixed(2)} TKUP`;
}

// 統計情報更新
function updateStats(currentRate, history = []) {
    // 現在レート
    document.getElementById('stats-current-rate').textContent = `${currentRate.toFixed(2)} TKUP`;

    // 24h変動
    if (history.length > 1) {
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const dayHistory = history.filter(h => h.timestamp > dayAgo);

        if (dayHistory.length > 1) {
            const startRate = dayHistory[0].rate;
            const change = ((currentRate - startRate) / startRate) * 100;
            const changeElement = document.getElementById('stats-change');

            changeElement.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
            changeElement.className = change >= 0 ? 'price-up' : 'price-down';
        }
    }

    // 取引高（ダミーデータ）
    document.getElementById('stats-volume').textContent = '1,234 TKUC';
}

// オーダー板更新
async function updateOrderBook() {
    try {
        const response = await fetch(`${API_BASE}/api/order-book`);
        const data = await response.json();

        if (data.success) {
            renderOrderBook(data.buyOrders, data.sellOrders);
        }
    } catch (error) {
        console.error('オーダー板更新エラー:', error);
    }
}

// オーダー板表示
function renderOrderBook(buyOrders, sellOrders) {
    const container = document.getElementById('order-book');

    let html = '';

    // 買い注文
    if (buyOrders && buyOrders.length > 0) {
        html += '<h6 class="buy-order">買い注文</h6>';
        buyOrders.slice(0, 5).forEach(order => {
            html += `<div class="d-flex justify-content-between buy-order">
                        <span>${order.price} TKUP</span>
                        <span>${order.remaining} TKUC</span>
                     </div>`;
        });
    }

    // 売り注文
    if (sellOrders && sellOrders.length > 0) {
        html += '<h6 class="sell-order mt-2">売り注文</h6>';
        sellOrders.slice(0, 5).forEach(order => {
            html += `<div class="d-flex justify-content-between sell-order">
                        <span>${order.price} TKUP</span>
                        <span>${order.remaining} TKUC</span>
                     </div>`;
        });
    }

    if (!html) {
        html = '<div class="text-center text-muted">注文なし</div>';
    }

    container.innerHTML = html;
}

// クイック取引機能
function quickBuy() {
    const amount = parseFloat(document.getElementById('trade-amount').value) || 1.0;
    // Discord連携で買い注文を実行
    alert(`買い注文: ${amount} TKUC\n（実際の取引はDiscordで実行してください）`);
}

function quickSell() {
    const amount = parseFloat(document.getElementById('trade-amount').value) || 1.0;
    // Discord連携で売り注文を実行
    alert(`売り注文: ${amount} TKUC\n（実際の取引はDiscordで実行してください）`);
}

// 市場ニュース更新
function updateMarketNews(aiAnalysis) {
    const container = document.getElementById('market-news');

    if (aiAnalysis) {
        container.innerHTML = `
            <div class="alert alert-primary">
                <i class="fas fa-robot"></i> <strong>AI分析:</strong> ${aiAnalysis}
            </div>
        `;
    }
}

// エラー表示関数
function showError(message) {
    const container = document.getElementById('market-news') || document.body;
    container.innerHTML = `
        <div class="alert alert-danger">
            <i class="fas fa-exclamation-triangle"></i> ${message}
        </div>
    `;
}

// グローバル関数として公開
window.setTimeframe = setTimeframe;
window.quickBuy = quickBuy;
window.quickSell = quickSell;
window.updateMarketNews = updateMarketNews;
window.showError = showError;
