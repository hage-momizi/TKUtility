const axios = require('axios');
const Parser = require('rss-parser');
const { EmbedBuilder } = require('discord.js');
const { summarizeNews, generateNewsTitle, generateFooterInfo, processNewsWithPerplexity } = require('./aiService');
const { loadJSON, saveJSON } = require('./fileStorage');

const RSS_SOURCES = {
  forest: 'https://forest.watch.impress.co.jp/data/rss/1.0/wf/feed.rdf',
  google_news: 'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja'
};

/**
 * ニュース記事を取得する
 * @param {string} source - ニュースソース
 * @param {string} category - カテゴリ
 * @returns {Array} 記事の配列
 */
async function fetchArticles(source, category) {
  try {
    if (source === 'newsdata') {
      const params = {
        apikey: process.env.NEWSDATA_API_KEY,
        country: 'jp',
        language: 'ja',
        size: 10
      };

      if (category) {
        if (category === 'anime') {
          params.category = 'entertainment';
          params.q = 'アニメ';
        } else {
          params.category = category;
        }
      }

      const response = await axios.get('https://newsdata.io/api/1/news', { params });
      return response.data.results || [];

    } else if (source === 'rss') {
      const parser = new Parser();
      const feed = await parser.parseURL(RSS_SOURCES.forest);
      return feed.items.map(item => ({
        title: item.title,
        description: item.contentSnippet || item.content || '',
        link: item.link,
        image_url: item.enclosure?.url || ''
      }));

    } else if (source === 'hackernews') {
      const topStoriesResponse = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');
      const topStoryIds = topStoriesResponse.data.slice(0, 10);

      const storyPromises = topStoryIds.map(id =>
        axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
      );
      const storyResponses = await Promise.all(storyPromises);

      return storyResponses.map(response => response.data)
        .filter(item => item.type === 'story' && item.title)
        .map(item => ({
          title: item.title,
          description: item.text || item.title,
          link: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          image_url: ''
        }));
    }

    return [];
  } catch (error) {
    console.error('Error fetching articles:', error);
    return [];
  }
}

/**
 * ニュースを処理して要約する
 * @param {Array} articles - 記事の配列
 * @returns {Array} 処理済みニュースの配列
 */
async function processNews(articles) {
  const selectedNews = [];

  for (const article of articles.slice(0, 3)) {
    let title = article.title;
    if (title.length > 50) title = title.substring(0, 47) + '...';

    // 本文がある場合はそれを使い、ない場合はタイトルだけ
    const content = article.description || article.title;
    const summary = await summarizeNews(content);

    selectedNews.push({
      title: title,
      summary: summary,
      url: article.link,
      imageUrl: article.image_url || '',
      description: article.description || '' // 本文も保存
    });
  }

  return selectedNews;
}

/**
 * ニュースを取得して保存する
 * @param {string} guildId - ギルドID
 * @param {string} source - ニュースソース
 * @param {string} category - カテゴリ
 * @param {string} configFile - 設定ファイルパス
 */
async function fetchAndSaveNews(guildId, source, category, configFile = 'newsconfig.json') {
  try {
    const articles = await fetchArticles(source, category);
    if (articles.length === 0) return;

    // ランダムに3個選ぶ
    const shuffled = articles.sort(() => 0.5 - Math.random());
    const selectedArticles = shuffled.slice(0, 3);

    const selectedNews = await processNews(selectedArticles);

    // 保存
    const config = loadJSON(configFile);
    if (!config[guildId]) config[guildId] = { channelId: '', news: [], times: [] };
    config[guildId].news = selectedNews;
    config[guildId].lastSource = source;
    config[guildId].lastCategory = category;
    saveJSON(configFile, config);

  } catch (error) {
    console.error('Error fetching and saving news:', error);
  }
}

/**
 * AIでニュースカテゴリを分類する
 * @param {string} content - ニュース本文
 * @returns {string} カテゴリ名
 */
async function classifyCategory(content) {
  try {
    const { summarizeNews } = require('./aiService');
    // 簡易的なカテゴリ分類: コンテンツからキーワードで判定
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('アニメ') || lowerContent.includes('漫画') || lowerContent.includes('ゲーム')) {
      return 'entertainment';
    } else if (lowerContent.includes('ビジネス') || lowerContent.includes('経済') || lowerContent.includes('株')) {
      return 'business';
    } else if (lowerContent.includes('テクノロジー') || lowerContent.includes('IT') || lowerContent.includes('AI')) {
      return 'technology';
    } else if (lowerContent.includes('スポーツ') || lowerContent.includes('サッカー') || lowerContent.includes('野球')) {
      return 'sports';
    } else if (lowerContent.includes('健康') || lowerContent.includes('医療') || lowerContent.includes('病気')) {
      return 'health';
    } else if (lowerContent.includes('科学') || lowerContent.includes('研究') || lowerContent.includes('宇宙')) {
      return 'science';
    } else if (lowerContent.includes('政治') || lowerContent.includes('政府') || lowerContent.includes('首相')) {
      return 'politics';
    } else if (lowerContent.includes('環境') || lowerContent.includes('気候') || lowerContent.includes('自然')) {
      return 'environment';
    } else if (lowerContent.includes('食べ物') || lowerContent.includes('料理') || lowerContent.includes('レストラン')) {
      return 'food';
    } else {
      return 'top'; // デフォルト
    }
  } catch (error) {
    console.error('Category classification error:', error);
    return 'top';
  }
}

/**
 * ランダムソース・カテゴリでニュースを取得する
 * @param {string} guildId - ギルドID
 * @param {string} configFile - 設定ファイルパス
 */
async function fetchRandomNews(guildId, configFile = 'newsconfig.json') {
  const sources = ['newsdata', 'rss', 'hackernews'];
  const randomSource = sources[Math.floor(Math.random() * sources.length)];
  const randomCategory = Math.random() > 0.5 ? null : 'technology';

  await fetchAndSaveNews(guildId, randomSource, randomCategory, configFile);
}

/**
 * ニュースを配信する関数
 * @param {Client} client - Discordクライアント
 * @param {string} guildId - ギルドID
 * @param {string} source - ソース
 * @param {string} category - カテゴリ
 * @param {string} time - 時間
 */
async function sendNews(client, guildId, source = null, category = null, time = null) {
  const config = loadJSON('newsconfig.json');
  let guildConfig = config[guildId];
  if (!guildConfig || !guildConfig.channelId) return;

  // ニュースがない場合は自動取得
  if (!guildConfig.news || guildConfig.news.length === 0) {
    if (source === 'auto') {
      try {
        await fetchRandomNews(guildId, 'newsconfig.json');
        guildConfig = loadJSON('newsconfig.json')[guildId]; // 再読み込み
        if (!guildConfig.news || guildConfig.news.length === 0) return;
      } catch (error) {
        console.error('Auto fetch failed:', error);
        return;
      }
    } else {
      return;
    }
  }

  try {
    const channel = await client.channels.fetch(guildConfig.channelId);
    if (!channel || !channel.isTextBased()) return;

    // AIでタイトル生成 (Perplexity)
    const now = new Date();
    const hour = now.getHours();
    let timeOfDay;
    if (hour >= 6 && hour < 12) {
      timeOfDay = '朝';
    } else if (hour >= 12 && hour < 18) {
      timeOfDay = '昼';
    } else if (hour >= 18 && hour < 24) {
      timeOfDay = '夜';
    } else {
      timeOfDay = '深夜';
    }

    // ニュースのタイトルを1個抽出してタイトル生成
    const firstNews = guildConfig.news[0];
    let embedTitle = '📢 今日のニュース'; // デフォルト値

    if (firstNews) {
      const titleResult = await processNewsWithPerplexity(timeOfDay, firstNews.title, firstNews.summary);
      embedTitle = titleResult.title;
    }

    const embed = new EmbedBuilder()
      .setTitle(embedTitle)
      .setColor(0x5865f2) // Discordの青色
      .setTimestamp();

    guildConfig.news.forEach((news, index) => {
      embed.addFields({
        name: `${index + 1}. ${news.title}`,
        value: `${news.summary}\n[詳細を読む](${news.url})`,
        inline: false
      });
    });

    // ニュースの中からランダムに画像があるものを選んで設定
    const newsWithImages = guildConfig.news.filter(news => news.imageUrl);
    if (newsWithImages.length > 0) {
      const randomNews = newsWithImages[Math.floor(Math.random() * newsWithImages.length)];
      embed.setImage(randomNews.imageUrl);
    }

    // フッター情報（AI生成）
    const footerText = await generateFooterInfo(time, source, category, guildConfig);
    embed.setFooter({ text: footerText });

    await channel.send({ embeds: [embed] });

    // 配信後にニュースをクリア（自動取得の場合はクリアしない）
    if (source !== 'auto') {
      const config = loadJSON('newsconfig.json');
      if (config[guildId]) {
        config[guildId].news = [];
        saveJSON('newsconfig.json', config);
      }
    }
  } catch (error) {
    console.error('Failed to send news:', error);
  }
}

module.exports = {
  fetchArticles,
  processNews,
  fetchAndSaveNews,
  fetchRandomNews,
  classifyCategory,
  RSS_SOURCES,
  sendNews
};
