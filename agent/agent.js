const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.AGENT_PORT || 65523;
const API_KEY = process.env.AGENT_API_KEY || 'default-key';

// ミドルウェア
app.use(cors());
app.use(express.json());

// 認証ミドルウェア
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const token = authHeader.substring(7);
  if (token !== API_KEY) {
    return res.status(403).json({ error: '無効なAPIキーです' });
  }

  next();
}

// ping実行エンドポイント
app.post('/ping', authenticate, async (req, res) => {
  try {
    const { ip, count = 1 } = req.body;

    // IPアドレスのバリデーション
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ip)) {
      return res.status(400).json({ error: '無効なIPアドレスです' });
    }

    console.log(`[Agent] Executing ping to ${ip}, count: ${count}`);

    // 指定回数pingを実行
    const results = [];
    for (let i = 0; i < count; i++) {
      try {
        const result = await executePing(ip);
        if (result.success) {
          results.push(result.output);
        }
        // エラー時は結果に含めない

        // 次のpingまで少し待つ
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`[Agent] Ping error:`, error);
      }
    }

    if (results.length > 0) {
      res.json({
        success: true,
        results: results,
        count: results.length
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'ping実行に失敗しました'
      });
    }

  } catch (error) {
    console.error('[Agent] Request error:', error);
    res.status(500).json({
      success: false,
      error: 'サーバーエラー'
    });
  }
});

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ping実行関数
function executePing(ip) {
  return new Promise((resolve, reject) => {
    // Linux環境なので ping -c 1 を使用
    const command = `ping -c 1 ${ip}`;

    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
      const output = stdout || stderr || '';

      // ping成功かどうかを判定
      const hasReply = output.includes('bytes from') || output.includes('icmp_seq');
      const hasResponse = output.includes('ttl=') || output.includes('time=');
      const success = !error && (hasReply || hasResponse);

      if (success) {
        // 成功時は「64 bytes from ...」の行だけを抽出
        const lines = output.split('\n');
        const resultLine = lines.find(line => line.includes('bytes from') || line.includes('icmp_seq'));
        resolve({
          success: true,
          output: resultLine || output
        });
      } else {
        resolve({
          success: false,
          output: output || 'ping failed'
        });
      }
    });
  });
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`[Agent] Ping Agent Server running on port ${PORT}`);
  console.log(`[Agent] API Key: ${API_KEY ? '設定済み' : 'デフォルト使用'}`);
  console.log(`[Agent] Health check: http://localhost:${PORT}/health`);
});

// プロセス終了時のクリーンアップ
process.on('SIGINT', () => {
  console.log('[Agent] Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Agent] Shutting down gracefully...');
  process.exit(0);
});
