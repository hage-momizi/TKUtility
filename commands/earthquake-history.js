const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { fetchEarthquakeHistory, createEarthquakeEmbed } = require('../modules/earthquakeService');

const command = new SlashCommandBuilder()
  .setName('earthquake-history')
  .setDescription('過去の地震情報を表示します')
  .addIntegerOption(option =>
    option.setName('limit')
      .setDescription('表示件数（最大20）')
      .setMinValue(1)
      .setMaxValue(20)
  )
  .addIntegerOption(option =>
    option.setName('min_magnitude')
      .setDescription('最小マグニチュード')
      .setMinValue(0)
      .setMaxValue(10)
  )
  .addIntegerOption(option =>
    option.setName('min_scale')
      .setDescription('最小震度（10=震度1, 20=震度2, ...）')
      .addChoices(
        { name: '震度1', value: 10 },
        { name: '震度2', value: 20 },
        { name: '震度3', value: 30 },
        { name: '震度4', value: 40 },
        { name: '震度5弱', value: 45 },
        { name: '震度5強', value: 50 },
        { name: '震度6弱', value: 55 },
        { name: '震度6強', value: 60 },
        { name: '震度7', value: 70 }
      )
  );

async function execute(interaction) {
  await interaction.deferReply();

  try {
    const limit = interaction.options.getInteger('limit') || 5;
    const minMagnitude = interaction.options.getInteger('min_magnitude');
    const minScale = interaction.options.getInteger('min_scale');

    const params = { limit };
    if (minMagnitude) params.min_magnitude = minMagnitude;
    if (minScale) params.min_scale = minScale;

    const data = await fetchEarthquakeHistory(params);

    if (data.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🔔 地震履歴')
        .setDescription('条件に合致する地震情報が見つかりません。')
        .setColor(0x0099ff);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // 最初の地震情報を表示
    const firstQuake = data[0];
    const embed = createEarthquakeEmbed(firstQuake);
    embed.setTitle(`🔔 地震履歴 (${data.length}件)`);

    // ページネーション用のボタン（複数ある場合）
    const components = [];
    if (data.length > 1) {
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('quake_prev')
            .setLabel('前へ')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('quake_next')
            .setLabel('次へ')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(data.length <= 1)
        );
      components.push(row);
    }

    const response = await interaction.editReply({
      embeds: [embed],
      components
    });

    // ボタンインタラクションの処理
    if (data.length > 1) {
      const collector = response.createMessageComponentCollector({
        time: 300000 // 5分
      });

      let currentIndex = 0;

      collector.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.user.id !== interaction.user.id) {
          await buttonInteraction.reply({
            content: 'この操作はコマンド実行者のみ可能です。',
            ephemeral: true
          });
          return;
        }

        if (buttonInteraction.customId === 'quake_next' && currentIndex < data.length - 1) {
          currentIndex++;
        } else if (buttonInteraction.customId === 'quake_prev' && currentIndex > 0) {
          currentIndex--;
        }

        const currentQuake = data[currentIndex];
        const newEmbed = createEarthquakeEmbed(currentQuake);
        newEmbed.setTitle(`🔔 地震履歴 (${currentIndex + 1}/${data.length}件)`);

        // ボタンの状態更新
        const newRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('quake_prev')
              .setLabel('前へ')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentIndex === 0),
            new ButtonBuilder()
              .setCustomId('quake_next')
              .setLabel('次へ')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentIndex === data.length - 1)
          );

        await buttonInteraction.update({
          embeds: [newEmbed],
          components: [newRow]
        });
      });

      collector.on('end', () => {
        // タイムアウト時はボタンを無効化
        const disabledRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('quake_prev')
              .setLabel('前へ')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('quake_next')
              .setLabel('次へ')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

        interaction.editReply({ components: [disabledRow] }).catch(() => {});
      });
    }
  } catch (error) {
    console.error('Error in earthquake-history command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ エラー')
      .setDescription('地震履歴の取得に失敗しました。')
      .setColor(0xff0000);
    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { command, execute };
