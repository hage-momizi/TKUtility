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
          `レートは2秒間隔で自動更新されます`
        )
        .setColor(0x007bff)
        .setImage('attachment://tkuc-chart.png')
        .addFields(
          { name: '💻 ウェブチャート', value: `[クリックして開く](${chartUrl})`, inline: true },
          { name: '🔄 レート更新', value: '2秒間隔', inline: true },
        )
        .setFooter({ text: 'レートは2秒間隔で更新されます | /tk-settings で詳細設定を確認' })
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

      // レート変更監視ループ
      let lastRate = currentRate;
      let updateCount = 0;
      const maxUpdates = 60; // 5分間監視（5秒×60）

      const updateInterval = setInterval(async () => {
        try {
          updateCount++;
          if (updateCount > maxUpdates) {
            clearInterval(updateInterval);

            // 最終更新メッセージ
            const finalEmbed = new EmbedBuilder()
              .setTitle('📈 TKUC市場情報（監視終了）')
              .setDescription(
                `現在のTKUCレート: **${lastRate} TKUP**\n\n` +
                `📊 **リアルタイム監視終了**\n` +
                `5分間の監視が完了しました\n` +
                `引き続きチャートをご覧ください`
              )
              .setColor(0x6c757d)
              .setImage('attachment://tkuc-chart.png')
              .addFields(
                { name: '💻 ウェブチャート', value: `[クリックして開く](${chartUrl})`, inline: true },
                { name: '🔄 監視時間', value: '5分間', inline: true },
                { name: '📱 モバイル対応', value: 'レスポンシブ', inline: true }
              )
              .setFooter({ text: 'チャートはレート変更時に更新されます | /tk-settings で詳細設定を確認' })
              .setTimestamp();

            await interaction.editReply({
              embeds: [finalEmbed],
              files: [{ attachment: chartBuffer, name: 'tkuc-chart.png' }],
              components: [row]
            });

            return;
          }

          const newRate = getTKUCRate();

          // レートが変わった場合のみ更新
          if (newRate !== lastRate) {
            const newChartBuffer = generateRateChart(50);
            const changePercent = ((newRate - lastRate) / lastRate) * 100;

            const updatedEmbed = new EmbedBuilder()
              .setTitle('📈 TKUC市場情報（レート変更）')
              .setDescription(
                `現在のTKUCレート: **${newRate} TKUP**\n` +
                `前回レート: ${lastRate} TKUP\n` +
                `変動: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%\n\n` +
                `📊 **レート変更検知**\n` +
                `最終更新: ${new Date().toLocaleTimeString('ja-JP')}\n` +
                `監視継続中: ${updateCount}/${maxUpdates}`
              )
              .setColor(changePercent >= 0 ? 0x28a745 : 0xdc3545)
              .setImage('attachment://tkuc-chart.png')
              .addFields(
                { name: '💻 ウェブチャート', value: `[クリックして開く](${chartUrl})`, inline: true },
                { name: '🔄 更新トリガー', value: 'レート変更時', inline: true },
                { name: '📱 モバイル対応', value: 'レスポンシブ', inline: true }
              )
              .setFooter({ text: 'レート変更時に自動更新されます | /tk-settings で詳細設定を確認' })
              .setTimestamp();

            await interaction.editReply({
              embeds: [updatedEmbed],
              files: [{ attachment: newChartBuffer, name: 'tkuc-chart.png' }],
              components: [row]
            });

            lastRate = newRate;
          }

        } catch (error) {
          console.error('Chart update error:', error);
          clearInterval(updateInterval);
        }
      }, 5000); // 5秒毎チェック

    } catch (error) {
      console.error('Market command error:', error);
      await interaction.reply({
        content: '市場情報の取得中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};
