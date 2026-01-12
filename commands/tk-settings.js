const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTKUCRate } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-settings')
    .setDescription('経済システムの現在の設定を表示します'),

  async execute(interaction, client) {
    try {
      const currentRate = getTKUCRate();

      const embed = new EmbedBuilder()
        .setTitle('📊 TKUtility 経済システム設定')
        .setColor(0x4CAF50)
        .setTimestamp();

      // TKUP獲得設定
      embed.addFields({
        name: '💰 TKUP獲得設定',
        value:
          '• **テキスト**: 4 + min(20, 文字数) TKUP\n' +
          '• **画像**: 8 TKUP\n' +
          '• **上限**: 1,000 TKUP/時間',
        inline: false
      });

      // TKUC設定
      embed.addFields({
        name: '💎 TKUC設定',
        value:
          `• **現在レート**: ${currentRate} TKUP\n` +
          '• **変動範囲**: -5% ～ +5%\n' +
          '• **最大変動**: ±5%\n' +
          '• **更新間隔**: 1分毎',
        inline: false
      });

      // レート変動要因
      embed.addFields({
        name: '🔄 レート変動要因',
        value:
          '• **基本変動**: ランダム（-5%～+5%）\n' +
          '• **市場需給**: 注文数ベース\n' +
          '• **チャット盛り上がり**: メッセージ量反映\n' +
          '• **上位保有割合**: 集中度調整\n' +
          '• **取引実績**: 活発度反映',
        inline: false
      });

      // 手数料設定
      embed.addFields({
        name: '💸 手数料設定',
        value:
          '• **TKUC購入**: 5%\n' +
          '• **TKUP送金**: 3%\n' +
          '• **TKUC送金**: 0.1%（最小0.001、最大0.1）\n' +
          '• **TKUP出金**: 10%',
        inline: false
      });

      // 自動処理設定
      embed.addFields({
        name: '🔄 自動処理設定',
        value:
          '• **レート更新**: 毎分\n' +
          '• **月末リセット**: 毎月1日0時',
        inline: false
      });

      // ランキング設定
      embed.addFields({
        name: '🏆 ランキング設定',
        value:
          '• **表示上限**: 25位まで\n' +
          '• **更新**: オンデマンド',
        inline: false
      });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Settings command error:', error);
      await interaction.reply({
        content: '設定の取得中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};
