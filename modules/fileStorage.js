const fs = require('fs');
const path = require('path');

/**
 * JSONファイルを読み込む汎用関数
 * @param {string} filePath - ファイルパス
 * @returns {object} パースされたJSONオブジェクト、またはエラー時は空オブジェクト
 */
function loadJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to load JSON from ${filePath}:`, error.message);
    return {};
  }
}

/**
 * JSONファイルを保存する汎用関数
 * @param {string} filePath - ファイルパス
 * @param {object} data - 保存するデータ
 */
function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Failed to save JSON to ${filePath}:`, error.message);
  }
}

module.exports = {
  loadJSON,
  saveJSON
};
