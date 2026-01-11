# Ping Agent Server

東京リージョンのpingエージェントサーバーです。アメリカのメインサーバーからpingリクエストを受け取り、東京からネットワークテストを実行します。

## 特徴

- **地域別測定**: 東京からpingを実行することで、日本国内のネットワーク遅延を正確に測定
- **セキュリティ**: APIキー認証によるアクセス制御
- **シンプル**: 単一エンドポイントでping実行
- **安定**: systemd/pm2でのデーモン化対応

## インストール

### 1. 依存関係のインストール
```bash
cd agent
npm install
```

### 2. 環境変数の設定
`.env`ファイルを作成するか、環境変数を設定してください：

```bash
# エージェントのポート番号（デフォルト: 65523）
AGENT_PORT=65523

# APIキー（認証用）
AGENT_API_KEY=your-secure-api-key-here
```

### 3. テスト実行
```bash
npm start
```

ヘルスチェック: http://localhost:65523/health

## API仕様

### POST /ping
pingを実行します。

**リクエスト:**
```json
{
  "ip": "8.8.8.8",
  "count": 1
}
```

**レスポンス:**
```json
{
  "success": true,
  "results": [
    "64 bytes from 8.8.8.8: icmp_seq=1 ttl=56 time=2.03 ms"
  ],
  "count": 1
}
```

**ヘッダー:**
```
Authorization: Bearer your-api-key
Content-Type: application/json
```

### GET /health
サーバーの状態を確認します。

## デーモン化

### 方法1: systemd (推奨)

1. サービスファイルを作成:
```bash
sudo nano /etc/systemd/system/ping-agent.service
```

2. 以下の内容を記述:
```ini
[Unit]
Description=Ping Agent Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/agent
ExecStart=/usr/bin/node /path/to/agent/agent.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=AGENT_PORT=65523
Environment=AGENT_API_KEY=your-secure-api-key

[Install]
WantedBy=multi-user.target
```

3. サービスを有効化・起動:
```bash
sudo systemctl daemon-reload
sudo systemctl enable ping-agent
sudo systemctl start ping-agent
sudo systemctl status ping-agent
```

4. ログ確認:
```bash
sudo journalctl -u ping-agent -f
```

### 方法2: PM2

1. PM2をグローバルインストール:
```bash
npm install -g pm2
```

2. アプリケーション起動:
```bash
cd agent
pm2 start agent.js --name ping-agent
```

3. 自動起動設定:
```bash
pm2 startup
pm2 save
```

4. 管理コマンド:
```bash
pm2 restart ping-agent
pm2 stop ping-agent
pm2 delete ping-agent
pm2 logs ping-agent
```

### 方法3: screen

1. screenセッション開始:
```bash
screen -S ping-agent
cd /path/to/agent
node agent.js
```

2. デタッチ: `Ctrl+A, D`

3. 再接続:
```bash
screen -r ping-agent
```

## セキュリティ考慮事項

- **APIキー**: 強力なランダム文字列を使用してください
- **ファイアウォール**: ポート65523へのアクセスを制限
- **HTTPS**: 本番環境ではリバースプロキシでHTTPS化を検討
- **ログ**: センシティブな情報をログに出力しない

## トラブルシューティング

### ポートが使用中
```bash
sudo lsof -i :65523
sudo kill -9 <PID>
```

### systemdログ確認
```bash
sudo journalctl -u ping-agent -n 50
```

### PM2ログ確認
```bash
pm2 logs ping-agent
```

## メインサーバーの設定

メインのDiscordボットで以下の環境変数を設定してください：

```bash
# エージェントサーバーのURL
AGENT_URL=http://your-tokyo-server:65523

# APIキー（エージェントと同じもの）
AGENT_API_KEY=your-secure-api-key
```

## ライセンス

MIT License
