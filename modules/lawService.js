const axios = require('axios');
const { generateLawSearchKeywords, generateLawSearchSummary, filterRelevantLawResults } = require('./aiService');

/**
 * e-gov法令検索APIでキーワード検索を実行する
 * @param {string} keyword - 検索キーワード
 * @param {number} limit - 取得件数上限（デフォルト: 10）
 * @returns {object} 検索結果
 */
async function searchLaws(keyword, limit = 10) {
  try {
    const params = {
      keyword: keyword,
      limit: limit,
      response_format: 'json'
    };

    const response = await axios.get('https://laws.e-gov.go.jp/api/2/keyword', { params });

    // 404の場合は空の結果を返す
    if (response.status === 404 || (response.data && response.data.code === '404001')) {
      console.log('No results found for keyword:', keyword);
      return { items: [] };
    }

    return response.data;
  } catch (error) {
    console.error('Law search API error:', error);
    // 404の場合は空の結果を返す
    if (error.response && error.response.status === 404) {
      console.log('No results found (404) for keyword:', keyword);
      return { items: [] };
    }
    throw new Error('法令検索に失敗しました。');
  }
}

/**
 * 自然言語クエリをキーワードに変換し、法令検索を実行する
 * @param {string} userQuery - ユーザーの自然言語クエリ
 * @param {number} limit - 取得件数上限（デフォルト: 10）
 * @returns {object} 検索結果
 */
async function searchLawsFromQuery(userQuery, limit = 10) {
  try {
    // AIでキーワード生成（2個のキーワード）
    const keywordsString = await generateLawSearchKeywords(userQuery);
    const keywords = keywordsString.split(' ').filter(k => k.trim());
    console.log(`Generated keywords for query "${userQuery}": "${keywords.join(', ')}"`);

    // キーワードを順番に試す
    for (const keyword of keywords) {
      console.log(`Trying keyword: "${keyword}"`);
      const results = await searchLaws(keyword, limit);

      // 結果があれば返す
      if (results && results.items && results.items.length > 0) {
        console.log(`Found ${results.items.length} results with keyword: "${keyword}"`);
        return results;
      }
    }

    // すべてのキーワードで結果がなければ空の結果を返す
    console.log('No results found with any keyword');
    return { items: [] };

  } catch (error) {
    console.error('Law search from query error:', error);
    throw new Error('法令検索に失敗しました。');
  }
}

/**
 * 検索結果を整形してEmbed用データに変換する
 * @param {object} searchResults - e-gov APIのレスポンス
 * @param {string} userQuery - ユーザークエリ
 * @returns {object} {fields: Array, summary: string}
 */
async function formatLawSearchResults(searchResults, userQuery) {
  const fields = [];

  if (!searchResults || !searchResults.items || searchResults.items.length === 0) {
    const summary = await generateLawSearchSummary(userQuery, []);
    return {
      fields: [{ name: '結果', value: '該当する法令が見つかりませんでした。', inline: false }],
      summary: summary
    };
  }

  // AIで関連性をチェックしてフィルタリング
  const relevantResults = await filterRelevantLawResults(userQuery, searchResults.items);
  console.log(`Filtered ${searchResults.items.length} results to ${relevantResults.length} relevant results`);

  if (relevantResults.length === 0) {
    const summary = await generateLawSearchSummary(userQuery, []);
    return {
      fields: [{ name: '結果', value: '該当する法令が見つかりませんでした。', inline: false }],
      summary: summary
    };
  }

  // 最大5件まで表示
  const maxItems = Math.min(relevantResults.length, 5);

  for (let i = 0; i < maxItems; i++) {
    const item = relevantResults[i];
    const lawInfo = item.law_info;
    const revisionInfo = item.revision_info;

    // 法令名と番号
    const lawTitle = revisionInfo.law_title || lawInfo.law_num;
    const lawNum = lawInfo.law_num;

    // 該当箇所のテキスト（最初の1件のみ）- HTMLタグ除去
    let textSnippet = '';
    if (item.sentences && item.sentences.length > 0) {
      const sentence = item.sentences[0];
      // HTMLタグを除去してプレーンテキストに
      textSnippet = sentence.text.replace(/<[^>]*>/g, '').trim();
      textSnippet = textSnippet.length > 150 ?
        textSnippet.substring(0, 147) + '...' :
        textSnippet;
    }

    // 公布日
    const promulgationDate = new Date(lawInfo.promulgation_date).toLocaleDateString('ja-JP');

    const field = {
      name: `${i + 1}. ${lawTitle}`,
      value: `**法令番号:** ${lawNum}\n**公布日:** ${promulgationDate}\n**該当箇所:** ${textSnippet || '本文参照'}\n`,
      inline: false
    };

    fields.push(field);
  }

  // AIによるまとめを生成（フィルタリングされた結果を使用）
  const summary = await generateLawSearchSummary(userQuery, relevantResults);

  return { fields, summary };
}

module.exports = {
  searchLaws,
  searchLawsFromQuery,
  formatLawSearchResults
};
