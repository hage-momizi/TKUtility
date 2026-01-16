// チャート管理クラス
class ChartManager {
    constructor() {
        this.chart = null;
        this.series = null;
        this.currentChartType = 'candlestick';
        this.currentTimeframe = '1m';
        this.rateData = [];
        this.lastRate = null;
        this.updateInterval = null;
        this.init();
    }

    init() {
        this.createChart();
        this.bindEvents();
        this.startAutoUpdate();
    }

    createChart() {
        const container = document.getElementById('chart-container');

        // LightweightChartsの初期化
        this.chart = LightweightCharts.createChart(container, {
            layout: {
                background: { color: '#0f172a' },
                textColor: '#94a3b8',
                fontSize: 12,
                fontFamily: "'Segoe UI', 'Yu Gothic', 'Meiryo', sans-serif"
            },
            grid: {
                vertLines: { color: '#334155' },
                horzLines: { color: '#334155' }
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal
            },
            rightPriceScale: {
                borderColor: '#334155',
                textColor: '#94a3b8'
            },
            timeScale: {
                borderColor: '#334155',
                textColor: '#94a3b8',
                timeVisible: true,
                secondsVisible: false
            },
            width: container.clientWidth,
            height: container.clientHeight
        });

        // 初期シリーズ作成
        this.createSeries('candlestick');
        this.loadData();
    }

    createSeries(type) {
        // 既存のシリーズを削除
        if (this.series) {
            this.chart.removeSeries(this.series);
        }

        const commonOptions = {
            priceFormat: {
                type: 'price',
                precision: 2,
                minMove: 0.01
            }
        };

        switch (type) {
            case 'candlestick':
                this.series = this.chart.addCandlestickSeries({
                    ...commonOptions,
                    upColor: '#10b981',
                    downColor: '#ef4444',
                    borderVisible: false,
                    wickUpColor: '#10b981',
                    wickDownColor: '#ef4444'
                });
                break;

            case 'line':
                this.series = this.chart.addLineSeries({
                    ...commonOptions,
                    color: '#3b82f6',
                    lineWidth: 2,
                    priceLineVisible: false,
                    lastValueVisible: false
                });
                break;

            case 'bar':
                this.series = this.chart.addBarSeries({
                    ...commonOptions,
                    thinBars: false
                });
                break;

            case 'area':
                this.series = this.chart.addAreaSeries({
                    ...commonOptions,
                    topColor: 'rgba(59, 130, 246, 0.56)',
                    bottomColor: 'rgba(59, 130, 246, 0.04)',
                    lineColor: '#3b82f6',
                    lineWidth: 2,
                    priceLineVisible: false,
                    lastValueVisible: false
                });
                break;
        }
    }

    bindEvents() {
        // チャートタイプ切り替え (Bootstrap radio buttons)
        document.querySelectorAll('input[name="chartType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const type = e.target.id;
                    this.changeChartType(type);
                }
            });
        });

        // タイムフレーム切り替え (Bootstrap radio buttons)
        document.querySelectorAll('input[name="timeframe"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const timeframe = e.target.id;
                    this.changeTimeframe(timeframe);
                }
            });
        });

        // ウィンドウリサイズ対応
        window.addEventListener('resize', () => {
            if (this.chart) {
                this.chart.applyOptions({
                    width: document.getElementById('chart-container').clientWidth
                });
            }
        });
    }

    changeChartType(type) {
        if (this.currentChartType === type) return;

        // アクティブボタン更新
        document.querySelectorAll('.chart-type-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-type="${type}"]`).classList.add('active');

        this.currentChartType = type;
        this.createSeries(type);
        this.updateData();
    }

    changeTimeframe(timeframe) {
        if (this.currentTimeframe === timeframe) return;

        // アクティブボタン更新
        document.querySelectorAll('.timeframe-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-timeframe="${timeframe}"]`).classList.add('active');

        this.currentTimeframe = timeframe;
        this.loadData();
    }

    async loadData() {
        try {
            const response = await fetch(`/api/rate-history?points=100`);
            const data = await response.json();

            if (data.success && data.history) {
                this.rateData = data.history;
                this.updateData();
            }
        } catch (error) {
            console.error('Failed to load rate history:', error);
        }
    }

    updateData() {
        if (!this.series || !this.rateData.length) return;

        const data = this.processDataForType(this.rateData);
        this.series.setData(data);
        this.fitContent();
    }

    processDataForType(rawData) {
        switch (this.currentChartType) {
            case 'candlestick':
                return this.createCandlestickData(rawData);
            case 'line':
                return this.createLineData(rawData);
            case 'bar':
                return this.createBarData(rawData);
            case 'area':
                return this.createAreaData(rawData);
            default:
                return this.createLineData(rawData);
        }
    }

    createCandlestickData(data) {
        return data.map((item, index) => ({
            time: Math.floor(item.timestamp / 1000),
            open: item.rate,
            high: item.rate,
            low: item.rate,
            close: item.rate
        }));
    }

    createLineData(data) {
        return data.map((item, index) => ({
            time: Math.floor(item.timestamp / 1000),
            value: item.rate
        }));
    }

    createBarData(data) {
        return data.map((item, index) => ({
            time: Math.floor(item.timestamp / 1000),
            open: item.rate,
            high: item.rate,
            low: item.rate,
            close: item.rate
        }));
    }

    createAreaData(data) {
        return data.map((item, index) => ({
            time: Math.floor(item.timestamp / 1000),
            value: item.rate
        }));
    }

    async updateCurrentRate() {
        try {
            const response = await fetch('/api/current-rate');
            const data = await response.json();

            if (data.success) {
                const currentRate = data.rate;

                // 現在のレートを表示
                document.getElementById('current-rate').textContent = currentRate.toFixed(2);

                // レート変動チェック
                if (this.lastRate !== null) {
                    const change = ((currentRate - this.lastRate) / this.lastRate) * 100;
                    if (Math.abs(change) >= 5) {
                        this.alertManager?.triggerRateAlert(change, currentRate);
                    }
                }
                this.lastRate = currentRate;

                // 新しいデータポイントを追加
                const newPoint = {
                    timestamp: data.timestamp,
                    rate: currentRate
                };

                // データ更新（最新50件を保持）
                this.rateData.push(newPoint);
                if (this.rateData.length > 50) {
                    this.rateData.shift();
                }

                this.updateData();
            }
        } catch (error) {
            console.error('Failed to update current rate:', error);
        }
    }

    startAutoUpdate() {
        // 初回更新
        this.updateCurrentRate();

        // 5秒ごとに更新
        this.updateInterval = setInterval(() => {
            this.updateCurrentRate();
        }, 5000);
    }

    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    fitContent() {
        if (this.chart) {
            this.chart.timeScale().fitContent();
        }
    }

    // クリーンアップ
    destroy() {
        this.stopAutoUpdate();
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
    }
}

// アラートマネージャーを設定するための関数
ChartManager.prototype.setAlertManager = function(alertManager) {
    this.alertManager = alertManager;
};

// グローバルインスタンス
const chartManager = new ChartManager();
