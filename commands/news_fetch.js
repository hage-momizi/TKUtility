const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const OpenAI = require('openai');
const Parser = require('rss-parser');
const xml2js = require('xml2js');
const path = require('path');
const { loadJSON, saveJSON } = require('../modules/fileStorage');
const { processNewsWithPerplexity } = require('../modules/aiService');

const RSS_SOURCES = {
  forest: 'https://forest.watch.impress.co.jp/data/rss/1.0/wf/feed.rdf',
  google_news: 'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja'
};

const command = new SlashCommandBuilder()
  .setName('news_fetch')
  .setDescription('ニュースを自動取得して設定します')
  .addStringOption(option =>
    option.setName('source')
      .setDescription('ニュースソース')
      .setRequired(false)
      .addChoices(
        { name: 'Newsdata.io', value: 'newsdata' },
        { name: 'RSS', value: 'rss' },
        { name: 'HackerNews', value: 'hackernews' }
      )
  )
  .addStringOption(option =>
    option.setName('rss_name')
      .setDescription('RSSソース名（source: rssの場合）')
      .setRequired(false)
      .addChoices(
        { name: '窓の杜', value: 'forest' },
        { name: 'Googleニュース', value: 'google_news' }
      )
  )
  .addStringOption(option =>
    option.setName('category')
      .setDescription('ニュースのカテゴリ（指定なしでランダム）')
      .setRequired(false)
      .addChoices(
        { name: 'ビジネス', value: 'business' },
        { name: 'エンターテイメント', value: 'entertainment' },
        { name: 'アニメ', value: 'anime' },
        { name: '環境', value: 'environment' },
        { name: 'フード', value: 'food' },
        { name: '健康', value: 'health' },
        { name: '政治', value: 'politics' },
        { name: '科学', value: 'science' },
        { name: 'スポーツ', value: 'sports' },
        { name: 'テクノロジー', value: 'technology' },
        { name: 'トップ', value: 'top' },
        { name: '世界', value: 'world' }
      )
  )
  .addBooleanOption(option =>
    option.setName('latest')
      .setDescription('最新のニュースを取得（デフォルト: ランダム）')
      .setRequired(false)
  );

async function execute(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const source = interaction.options.getString('source') || 'newsdata';
  const rssName = interaction.options.getString('rss_name');
  const category = interaction.options.getString('category');
  const latest = interaction.options.getBoolean('latest');

  try {
    let articles = [];

    if (source === 'newsdata') {
      if (category) {
        // カテゴリ指定あり：そのカテゴリからニュース取得
        const params = {
          apikey: process.env.NEWSDATA_API_KEY,
          country: 'jp',
          language: 'ja',
          size: 10
        };

        if (category === 'anime') {
          params.category = 'entertainment';
          params.q = 'アニメ';
        } else {
          params.category = category;
        }

        const newsResponse = await axios.get('https://newsdata.io/api/1/news', { params });
        articles = newsResponse.data.results || [];
      } else {
        // カテゴリ指定なし：複数のカテゴリから混ぜて取得
        const categories = ['business', 'entertainment', 'environment', 'food', 'health', 'politics', 'science', 'sports', 'technology', 'top'];
        const selectedCategories = categories.sort(() => 0.5 - Math.random()).slice(0, 3); // 3つのランダムカテゴリ

        const promises = selectedCategories.map(cat => {
          const params = {
            apikey: process.env.NEWSDATA_API_KEY,
            country: 'jp',
            language: 'ja',
            size: 5
          };
          if (cat === 'anime') {
            params.category = 'entertainment';
            params.q = 'アニメ';
          } else {
            params.category = cat;
          }
          return axios.get('https://newsdata.io/api/1/news', { params });
        });

        const responses = await Promise.all(promises);
        articles = responses.flatMap(response => response.data.results || []);
      }

    } else if (source === 'rss') {
      // RSS取得
      if (!rssName || !RSS_SOURCES[rssName]) {
        await interaction.editReply('RSSソースが正しく指定されていません。');
        return;
      }

      const parser = new Parser();
      const feed = await parser.parseURL(RSS_SOURCES[rssName]);

      articles = feed.items.map(item => ({
        title: item.title,
        description: item.contentSnippet || item.content || '',
        link: item.link,
        image_url: item.enclosure?.url || ''
      }));

    } else if (source === 'hackernews') {
      // HackerNews取得
      const topStoriesResponse = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');
      const topStoryIds = topStoriesResponse.data.slice(0, 10); // トップ10取得

      const storyPromises = topStoryIds.map(id => axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`));
      const storyResponses = await Promise.all(storyPromises);

      articles = storyResponses.map(response => response.data)
        .filter(item => item.type === 'story' && item.title) // storyタイプのみ、タイトルあり
        .map(item => ({
          title: item.title,
          description: item.text || item.title, // textがあれば、それを使い、なければtitle
          link: item.url || `https://news.ycombinator.com/item?id=${item.id}`, // urlがあれば、それを使い、なければHNリンク
          image_url: '' // 画像なし
        }));
    }

    if (articles.length === 0) {
      await interaction.editReply('ニュースが見つかりませんでした。');
      return;
    }

    // カテゴリ指定がある場合、AIでフィルタリング
    let filteredArticles = articles;
    if (category && source === 'rss') {
      const categoryPromises = articles.map(article => classifyCategory(article.title + '\n' + article.description));
      const categories = await Promise.all(categoryPromises);

      filteredArticles = articles.filter((article, index) => {
        const detectedCategory = categories[index];
        return detectedCategory === category;
      });

      if (filteredArticles.length < 3) {
        // 足りない場合はカテゴリなしで補充
        const remaining = articles.filter(article => !filteredArticles.includes(article));
        filteredArticles = filteredArticles.concat(remaining.slice(0, 3 - filteredArticles.length));
      }
    }

    // 最新またはランダムに3個選ぶ
    if (latest) {
      // 最新：最初の3個
      filteredArticles = filteredArticles.slice(0, 3);
    } else {
      // ランダム：シャッフルして最初の3個
      if (filteredArticles.length > 3) {
        const shuffled = filteredArticles.sort(() => 0.5 - Math.random());
        filteredArticles = shuffled.slice(0, 3);
      } else if (filteredArticles.length < 3) {
        filteredArticles = articles.slice(0, 3);
      }
    }

    // 3個選んで処理
    const selectedNews = [];
    for (let i = 0; i < 3 && i < filteredArticles.length; i++) {
      const article = filteredArticles[i];

      // Perplexityで要約のみ
      const result = await processNewsWithPerplexity('昼', article.title, article.description || '');

      selectedNews.push({
        title: article.title, // 記事タイトルそのまま
        summary: result.summary,
        url: article.link,
        imageUrl: article.image_url || ''
      });
    }

    // newsconfig.jsonに保存
    const newsConfigFile = path.join(__dirname, '..', 'newsconfig.json');
    const config = loadJSON(newsConfigFile);
    if (!config[interaction.guild.id]) {
      config[interaction.guild.id] = { channelId: '', news: [], times: [] };
    }
    config[interaction.guild.id].news = selectedNews;
    config[interaction.guild.id].lastSource = source;
    config[interaction.guild.id].lastCategory = category || 'mixed';
    saveJSON(newsConfigFile, config);

    await interaction.editReply('ニュースを自動取得して設定しました！Webパネルで確認してください。');

  } catch (error) {
    console.error('News fetch error:', error);
    await interaction.editReply('ニュース取得に失敗しました。');
  }
}

// AIでニュースカテゴリ判定 (Perplexity)
async function classifyCategory(content) {
  try {
    const openai = new OpenAI({
      baseURL: 'https://api.perplexity.ai/',
      apiKey: process.env.PERPLEXITY_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: 'あなたはニュースカテゴリ分類アシスタントです。与えられたニュース記事のタイトルと本文から、最も適切なカテゴリを判定してください。カテゴリの意味：business=ビジネス・経済、entertainment=エンターテイメント・芸能・漫画・アニメ、environment=環境・自然、food=食品・料理・飲食・グルメ、health=健康・医療、politics=政治、science=科学・研究、sports=スポーツ、technology=テクノロジー・IT・ガジェット、top=一般・総合ニュース、world=国際ニュース。最もマッチするカテゴリの英語値だけを返してください。'
        },
        {
          role: 'user',
          content: content
        }
      ],
      max_tokens: 20
    });

    const category = completion.choices[0].message.content.trim().toLowerCase();
    return category;
  } catch (error) {
    console.error('Category classification error:', error);
    return 'top'; // デフォルト
  }
}

module.exports = { command, execute };
