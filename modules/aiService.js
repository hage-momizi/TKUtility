const OpenAI = require('openai');
require('dotenv').config();

const perplexityClient = new OpenAI({
  baseURL: 'https://api.perplexity.ai/',
  apiKey: process.env.PERPLEXITY_API_KEY,
});

const openRouterClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
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
 * 法令検索用のキーワードを生成する（OpenRouter使用）
 * @param {string} userQuery - ユーザーの自然言語クエリ
 * @returns {string} 法令検索キーワード
 */
async function generateLawSearchKeywords(userQuery) {
  try {
    const completion = await openRouterClient.chat.completions.create({
      model: 'xiaomi/mimo-v2-flash:free',
      messages: [
        {
          role: 'system',
          content: 'あなたは日本の法律相談アシスタントです。ユーザーの相談内容から、最も関連性の高い日本の法令を検索するためのキーワードを2個生成してください。キーワードは日本語で、e-gov法令検索でヒットしやすい一般的な用語を使用します。1個目は具体的な犯罪名、2個目は一般的な用語にしてください。スペース区切りで出力し、説明は不要です。例: 相談内容「未成年者が性的画像を送ってきた」→「児童ポルノ 児童」'
        },
        {
          role: 'user',
          content: userQuery
        }
      ],
      max_tokens: 50,
      temperature: 0.2
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenRouter keyword generation error:', error);
    // フォールバック：クエリをそのままキーワードとして使用
    return userQuery;
  }
}

/**
 * 法令検索結果の関連性を検証する（OpenRouter使用）
 * @param {string} userQuery - ユーザーのクエリ
 * @param {Array} searchResults - 検索結果の配列
 * @returns {Array} 関連する結果のみの配列
 */
async function filterRelevantLawResults(userQuery, searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return [];
  }

  try {
    const filteredResults = [];

    for (const item of searchResults) {
      const lawInfo = item.law_info;
      const revisionInfo = item.revision_info;
      const lawTitle = revisionInfo.law_title || lawInfo.law_num;

      // 該当箇所のテキストを取得
      let textSnippet = '';
      if (item.sentences && item.sentences.length > 0) {
        const sentence = item.sentences[0];
        textSnippet = sentence.text.replace(/<[^>]*>/g, '').trim();
      }

      const completion = await openRouterClient.chat.completions.create({
        model: 'xiaomi/mimo-v2-flash:free',
        messages: [
          {
            role: 'system',
            content: 'ユーザーの相談内容と法令の内容が関連しているかを判断してください。関連している場合は「関連」、関連していない場合は「無関係」とだけ答えてください。'
          },
          {
            role: 'user',
            content: `相談内容: ${userQuery}\n\n法令名: ${lawTitle}\n該当内容: ${textSnippet}\n\nこの法令は相談内容に関連していますか？`
          }
        ],
        max_tokens: 20,
        temperature: 0.1
      });

      const response = completion.choices[0].message.content.trim();
      if (response.includes('関連')) {
        filteredResults.push(item);
      }

      // 最大3件まで
      if (filteredResults.length >= 3) break;
    }

    return filteredResults;
  } catch (error) {
    console.error('OpenRouter relevance check error:', error);
    // エラーの場合は元の結果をそのまま返す
    return searchResults.slice(0, 3);
  }
}

/**
 * 法令検索結果のまとめを生成する（OpenRouter使用）
 * @param {string} userQuery - ユーザーのクエリ
 * @param {Array} searchResults - 検索結果の配列
 * @returns {string} AIによるまとめ
 */
async function generateLawSearchSummary(userQuery, searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return '該当する法令が見つかりませんでした。専門家に相談することをおすすめします。';
  }

  try {
    // 検索結果をテキスト化
    const resultsText = searchResults.slice(0, 3).map((item, index) => {
      const lawInfo = item.law_info;
      const revisionInfo = item.revision_info;
      return `${index + 1}. ${revisionInfo.law_title || lawInfo.law_num}`;
    }).join('\n');

    const completion = await openRouterClient.chat.completions.create({
      model: 'xiaomi/mimo-v2-flash:free',
      messages: [
        {
          role: 'system',
          content: 'あなたは日本の法律相談アシスタントです。ユーザーの相談内容と関連法令を基に、簡潔なアドバイスを100文字以内でまとめてください。法的助言ではなく、一般的な情報として提供し、専門家相談を勧めてください。'
        },
        {
          role: 'user',
          content: `相談内容: ${userQuery}\n\n関連法令:\n${resultsText}\n\nこの相談に対するアドバイスをまとめてください。`
        }
      ],
      max_tokens: 150,
      temperature: 0.3
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenRouter summary generation error:', error);
    return '関連法令が見つかりました。詳細は専門家に相談してください。';
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

/**
 * AIチャットストリーミング応答
 * @param {string} userMessage - ユーザーのメッセージ
 * @param {string} control - 制御文字列（口調設定）
 * @param {string} provider - AIプロバイダー ('perplexity' or 'openrouter')
 * @param {Array} conversationHistory - 会話履歴 [{ role: 'user'|'assistant', content: string }]
 * @returns {AsyncGenerator<string>} ストリーミングテキスト
 */
async function* streamAIResponse(userMessage, control = '', provider = 'openrouter', conversationHistory = []) {
  try {
    const messages = [];

    // システムメッセージ
    if (control) {
      messages.push({
        role: 'system',
        content: control
      });
    }

    // 会話履歴（最新20件）
    const recentHistory = conversationHistory.slice(-20);
    messages.push(...recentHistory);

    // 新しいユーザーメッセージ
    messages.push({
      role: 'user',
      content: userMessage
    });

    let stream;
    if (provider === 'perplexity') {
      stream = await perplexityClient.chat.completions.create({
        model: 'sonar',
        messages: messages,
        stream: true,
        max_tokens: 1000,
        temperature: 0.7
      });
    } else {
      stream = await openRouterClient.chat.completions.create({
        model: 'openai/gpt-oss-120b:free',
        messages: messages,
        stream: true,
        max_tokens: 1000,
        temperature: 0.7
      });
    }

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error) {
    console.error(`${provider} streaming error:`, error);
    yield '申し訳ありませんが、エラーが発生しました。';
  }
}

module.exports = {
  summarizeNews,
  generateNewsTitle,
  generateFooterInfo,
  processNewsWithPerplexity,
  generateLawSearchKeywords,
  filterRelevantLawResults,
  generateLawSearchSummary,
  streamAIResponse,
  apiCallWithRetry
};
