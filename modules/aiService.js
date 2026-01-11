const OpenAI = require('openai');
require('dotenv').config();

const perplexityClient = new OpenAI({
  baseURL: 'https://api.perplexity.ai/',
  apiKey: process.env.PERPLEXITY_API_KEY,
});

/**
 * ニュースを要約する
 * @param {string} content - ニュース本文
 * @returns {string} 要約テキスト
 */
async function summarizeNews(content) {
  try {
    const completion = await perplexityClient.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'system',
        content: 'あなたはニュース要約アシスタントです。与えられたニュース記事の内容から、簡潔な要約を作成してください。内容がタイトルだけの場合は、そのタイトルについて一般的な説明を作成してください。要約は日本語で100文字以内に収めてください。要約だけを返してください。'
      }, {
        role: 'user',
        content: content
      }],
      max_tokens: 100
    });
    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Perplexity summarization error:', error);
    return '要約できませんでした。';
  }
}

/**
 * ニュース配信タイトルを生成する
 * @param {string} timeOfDay - 時間帯（朝、昼、夜、深夜）
 * @param {string} newsTitles - ニュースタイトルのリスト
 * @returns {string} 生成されたタイトル
 */
async function generateNewsTitle(timeOfDay, newsTitles) {
  return await apiCallWithRetry(async () => {
    const completion = await perplexityClient.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'system',
        content: `あなたは楽しいニュース配信タイトルの作成者です。${timeOfDay}のニュース配信タイトルを作成してください。以下のニュースタイトルを見て、全体の内容を表す適切なタイトルを考えます。タイトルは絵文字から始め、楽しい日本語で、20文字以内に収めてください。タイトルだけを返してください。`
      }, {
        role: 'user',
        content: `ニュースタイトル:\n${newsTitles}\n\nこれらのニュースに基づいて、${timeOfDay}のニュース配信タイトルを作成してください。`
      }],
      max_tokens: 50
    });
    return completion.choices[0].message.content.trim();
  }).catch(error => {
    console.error('Perplexity title generation error:', error);
    // フォールバック
    const fallbacks = {
      朝: '🌅 おはようございます！朝のニュース',
      昼: '☀️ こんにちは！昼のニュース',
      夜: '🌙 こんばんは！夜のニュース',
      深夜: '🦉 夜更かしの皆さん！深夜のニュース'
    };
    return fallbacks[timeOfDay] || '📢 今日のニュース';
  });
}

/**
 * フッター情報を生成する
 * @param {string} time - 時間
 * @param {string} source - ソース
 * @param {string} category - カテゴリ
 * @param {object} guildConfig - ギルド設定
 * @returns {string} フッター情報
 */
async function generateFooterInfo(time, source, category, guildConfig) {
  // 従来のシンプルな方式に戻す
  let footerText = '';
  if (time) footerText += `${time}のニュース | `;
  if (source && source !== 'auto') footerText += `${source} | `;
  if (source === 'auto' && guildConfig.lastSource) footerText += `${guildConfig.lastSource} | `;
  if (category) footerText += `${category} | `;
  if (!category && guildConfig.lastCategory) footerText += `${guildConfig.lastCategory} | `;
  footerText += '要約はAIによるものです';
  return footerText;
}

/**
 * Perplexityでニュースを処理する（要約、タイトル、カテゴリ）
 * @param {string} timeOfDay - 時間帯
 * @param {string} title - ニュースタイトル
 * @param {string} body - ニュース本文
 * @returns {object} { summary, title, category }
 */
async function processNewsWithPerplexity(timeOfDay, title, body) {
  const prompt = `以下のニュースを処理してください。

【入力】
・時間帯：${timeOfDay}
・ニュース本文：${body}

【タスク】
1. 要約：
本文の重要点のみを日本語で1行以内に要約する。

2. 配信タイトル：
時間帯とニュース内容を踏まえ、
絵文字から始まる日本語20文字以内の楽しい配信タイトルを作る。

3. カテゴリ：
以下の中から1つだけ選ぶ。
business, entertainment, environment, food, health, politics, science, sports, technology, top, world

【出力形式】
summary: <要約>
title: <配信タイトル>
category: <カテゴリ名>

【禁止事項】
・説明文を書かない
・箇条書きにしない
・出力形式を変えない
・日本語カテゴリを使わない
・記事タイトルをそのまま使わない`;

  try {
    const completion = await perplexityClient.chat.completions.create({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: 'あなたはニュース処理アシスタントです。与えられたタスクを正確に実行してください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 200
    });

    const result = completion.choices[0].message.content;
    const lines = result.trim().split('\n');
    const parsed = {};
    lines.forEach(line => {
      if (line.startsWith('summary: ')) {
        parsed.summary = line.substring(9);
      } else if (line.startsWith('title: ')) {
        parsed.title = line.substring(7);
      } else if (line.startsWith('category: ')) {
        parsed.category = line.substring(10);
      }
    });

    return {
      summary: parsed.summary || '要約できませんでした。',
      title: parsed.title || '📢 今日のニュース',
      category: parsed.category || 'top'
    };
  } catch (error) {
    console.error('Perplexity processNews error:', error);
    return {
      summary: '要約できませんでした。',
      title: '📢 今日のニュース',
      category: 'top'
    };
  }
}

/**
 * レートリミット対応のAPIコール関数
 * @param {function} apiCall - API呼び出し関数
 * @param {number} retries - リトライ回数
 * @returns {Promise} API結果
 */
async function apiCallWithRetry(apiCall, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await apiCall();
    } catch (error) {
      if (error.status === 429 && i < retries - 1) {
        // 指数バックオフ: 1秒, 2秒, 4秒
        const delay = 1000 * (2 ** i);
        console.log(`Rate limit hit, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

module.exports = {
  summarizeNews,
  generateNewsTitle,
  generateFooterInfo,
  processNewsWithPerplexity,
  apiCallWithRetry
};
