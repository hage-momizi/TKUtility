const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTKUCRate, generateRateChart } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-market')
    .setDescription('TKUC市場情報とリアルタイムチャートを表示します'),

  async execute(interaction, client) {
    try {
      const currentRate = getTKUCRate();
      const webServerPort = process.env.PORT || 3000;
      const chartUrl = `http://localhost:${webServerPort}`;

      // 初期チャート画像生成
      const chartBuffer = generateRateChart(50);

      const embed = new EmbedBuilder()
        .setTitle('📈 TKUC市場情報')
        .setDescription(
          `現在のTKUCレート: **${currentRate} TKUP**\n\n` +
          `📊 **リアルタイムチャート**\n` +
          `チャートが5秒毎に自動更新されます`
        )
        .setColor(0x007bff)
        .setImage('attachment://tkuc-chart.png')
        .addFields(
          { name: '💻 ウェブチャート', value: `[クリックして開く](${chartUrl})`, inline: true },
          { name: '🔄 更新間隔', value: '5秒毎', inline: true },
          { name: '📱 モバイル対応', value: 'レスポンシブ', inline: true }
        )
        .setFooter({ text: 'チャートは自動更新されます | /tk-settings で詳細設定を確認' })
        .setTimestamp();

      // ボタン追加
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setLabel('📊 リアルタイムチャートを開く')
            .setStyle(ButtonStyle.Link)
            .setURL(chartUrl),
          new ButtonBuilder()
            .setLabel('🔄 更新')
            .setStyle(ButtonStyle.Secondary)
            .setCustomId('refresh_chart')
        );

      const message = await interaction.reply({
        embeds: [embed],
        files: [{ attachment: chartBuffer, name: 'tkuc-chart.png' }],
        components: [row]
      });

      // リアルタイム更新ループ
      let updateCount = 0;
      const maxUpdates = 60; // 5分間更新（5秒×60）

      const updateInterval = setInterval(async () => {
        try {
          updateCount++;
          if (updateCount > maxUpdates) {
            clearInterval(updateInterval);
            return;
          }

          const newRate = getTKUCRate();
          const newChartBuffer = generateRateChart(50);

          const updatedEmbed = new EmbedBuilder()
            .setTitle('📈 TKUC市場情報（リアルタイム）')
            .setDescription(
              `現在のTKUCレート: **${newRate} TKUP**\n\n` +
              `📊 **リアルタイムチャート**\n` +
              `最終更新: ${new Date().toLocaleTimeString('ja-JP')}\n` +
              `更新回数: ${updateCount}/${maxUpdates}`
            )
            .setColor(0x28a745)
            .setImage('attachment://tkuc-chart.png')
            .addFields(
              { name: '💻 ウェブチャート', value: `[クリックして開く](${chartUrl})`, inline: true },
              { name: '🔄 更新間隔', value: '5秒毎', inline: true },
              { name: '📱 モバイル対応', value: 'レスポンシブ', inline: true }
            )
            .setFooter({ text: 'チャートは自動更新されます | /tk-settings で詳細設定を確認' })
            .setTimestamp();

          await interaction.editReply({
            embeds: [updatedEmbed],
            files: [{ attachment: newChartBuffer, name: 'tkuc-chart.png' }],
            components: [row]
          });

        } catch (error) {
          console.error('Chart update error:', error);
          clearInterval(updateInterval);
        }
      }, 5000); // 5秒毎更新

    } catch (error) {
      console.error('Market command error:', error);
      await interaction.reply({
        content: '市場情報の取得中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};
