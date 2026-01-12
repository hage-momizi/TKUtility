# TKUtility 経済システム データ構造ガイド

## 概要
このドキュメントは、TKUtilityの仮想通貨システムで使用されるデータ構造を、ユーザーと開発者が理解しやすい形でまとめたものです。

## 📁 データファイル一覧

### 1. ユーザー残高データ (`userBalances.json`)
各ユーザーのTKUPとTKUCの保有量を管理します。

**ファイル構造:**
```json
{
  "ユーザーID": {
    "tkup": 1500,
    "tkuc": 3.25,
    "earnedHistory": [
      {
        "timestamp": 1768203000000,
        "amount": 15
      }
    ]
  }
}
```

**フィールド説明:**
- `tkup`: TKUPの保有量（整数）
- `tkuc`: TKUCの保有量（小数点2桁まで）
- `earnedHistory`: TKUP獲得履歴
  - `timestamp`: 獲得時刻（ミリ秒）
  - `amount`: 獲得量

### 2. TKUCレートデータ (`tkucRate.json`)
TKUCの現在のレートと変動履歴を管理します。

**ファイル構造:**
```json
{
  "currentRate": 476.06,
  "lastUpdate": 1768203048543,
  "history": [
    {
      "timestamp": 1768203048543,
      "rate": 476.06
    }
  ]
}
```

**フィールド説明:**
- `currentRate`: 現在のTKUCレート（TKUP/TKUC）
- `lastUpdate`: 最終更新時刻
- `history`: レート変動履歴（最大50件）

### 3. オーダーブックデータ (`orderBook.json`)
取引所機能の買い/売り注文を管理します。

**ファイル構造:**
```json
{
  "buyOrders": [
    {
      "id": "order_1768203000000_abc123",
      "userId": "123456789",
      "type": "buy",
      "price": 450,
      "amount": 2.0,
      "remaining": 2.0,
      "timestamp": 1768203000000
    }
  ],
  "sellOrders": [
    {
      "id": "order_1768203050000_def456",
      "userId": "987654321",
      "type": "sell",
      "price": 480,
      "amount": 1.5,
      "remaining": 1.5,
      "timestamp": 1768203050000
    }
  ]
}
```

**フィールド説明:**
- `id`: 注文の一意なID
- `userId`: 注文者のユーザーID
- `type`: 注文タイプ（"buy" または "sell"）
- `price`: 注文価格（TKUP/TKUC）
- `amount`: 注文数量
- `remaining`: 残り数量（約定で減少）
- `timestamp`: 注文時刻

### 4. 取引履歴データ (`transactionHistory.json`)
全ての取引履歴をユーザー別に管理します。

**ファイル構造:**
```json
{
  "ユーザーID": {
    "earn": [
      {
        "amount": 15,
        "timestamp": 1768203000000,
        "source": "text"
      }
    ],
    "buy": [
      {
        "tkucAmount": 1,
        "tkupSpent": 500,
        "rate": 500,
        "timestamp": 1768203010000
      }
    ],
    "market_buy": [
      {
        "tkucAmount": 1,
        "tkupCost": 450,
        "price": 450,
        "timestamp": 1768203020000
      }
    ]
  }
}
```

**取引タイプ:**
- `earn`: TKUP獲得
- `buy`: TKUC購入
- `send_tkup`: TKUP送金
- `send_tkuc`: TKUC送金
- `withdraw`: 出金
- `gamble_win/lose`: ギャンブル
- `market_buy/sell`: 取引所取引

## 🔧 データ操作方法

### 残高確認
```bash
# 自分の残高を表示
/tk-balance

# 例: TKUP: 1500 | TKUC: 3.25
#     1時間上限残り: 850 TKUP (32分後)
```

### 取引履歴確認
各コマンド実行時に自動記録されます。開発者は直接JSONファイルを参照してください。

### データバックアップ
定期的に以下のファイルをバックアップしてください：
- `userBalances.json`
- `tkucRate.json`
- `transactionHistory.json`

## 📊 統計情報

### レート変動
- **更新間隔**: 1分毎
- **変動範囲**: -10% ～ +10%
- **最小変動**: ±0.1%

### TKUP獲得
- **テキスト**: 4 + min(20, 文字数) TKUP
- **画像**: 8 TKUP
- **上限**: 1,000 TKUP/時間

### 手数料
- **TKUC購入**: 5%
- **TKUP送金**: 3%
- **TKUP出金**: 10%
- **TKUC送金**: 無料

## 🚨 注意事項

### データ整合性
- 直接JSONファイルを編集しないでください
- 変更時は必ずバックアップを取ってください
- 数値は小数点以下の桁数に注意してください

### トラブルシューティング
- 残高が合わない場合: `transactionHistory.json` を確認
- レートが変動しない場合: スケジューラーが動作しているか確認
- 注文が表示されない場合: `orderBook.json` を確認

## 📞 サポート
このデータ構造に関する質問は、開発者に直接お問い合わせください。

---

**最終更新**: 2026年1月12日
**バージョン**: 1.0.0
