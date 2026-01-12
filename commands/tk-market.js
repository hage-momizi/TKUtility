const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getTKUCRate, generateRateChart } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-market')
    .setDescription('TKUC市場情報とチャートを表示します')
    .addIntegerOption(option =>
      option.setName('points')
        .setDescription('チャートのデータポイント数（デフォルト: 50）')
        .setMinValue(10)
        .setMaxValue(100)),

  async execute(interaction) {
    try {
      const points = interaction.options.getInteger('points') || 50;
      const currentRate = getTKUCRate();

      // チャート画像生成
      const chartBuffer = generateRateChart(points);
      const attachment = new AttachmentBuilder(chartBuffer, { name: 'tkuc-chart.png' });

      // レート変動計算（簡易）
      const embed = new EmbedBuilder()
        .setTitle('📈 TKUC市場情報')
        .setDescription(`現在のTKUCレート: **${currentRate} TKUP**`)
        .setColor(0x007bff)
        .setImage('attachment://tkuc-chart.png')
        .addFields(
          { name: 'データポイント', value: `${points}件`, inline: true },
          { name: '更新間隔', value: '3分毎', inline: true },
          { name: '変動範囲', value: '±10%', inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], files: [attachment] });
    } catch (error) {
      console.error('Market command error:', error);
      await interaction.reply({
        content: '市場情報の取得中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};
