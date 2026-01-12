const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTKUPRanking, getTKUCRanking } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-leaderboard')
    .setDescription('TKUP/TKUCランキングを表示します')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('ランキングの種類')
        .setRequired(true)
        .addChoices(
          { name: 'TKUPランキング', value: 'tkup' },
          { name: 'TKUCランキング', value: 'tkuc' }
        ))
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('表示する上位人数（デフォルト: 10）')
        .setMinValue(1)
        .setMaxValue(25)),

  async execute(interaction, client) {
    try {
      const type = interaction.options.getString('type');
      const limit = interaction.options.getInteger('limit') || 10;

      let rankings;
      let title;
      let description;
      let color;

      if (type === 'tkup') {
        rankings = getTKUPRanking(limit);
        title = '💰 TKUPランキング';
        description = 'TKUP保有量ランキング';
        color = 0x00ff00;
      } else {
        rankings = getTKUCRanking(limit);
        title = '💎 TKUCランキング';
        description = 'TKUC保有量ランキング';
        color = 0xffd700;
      }

      if (rankings.length === 0) {
        return await interaction.reply({
          content: 'ランキングデータがありません。',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();

      // ランキング表示
      const rankingText = rankings.map((rank, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const value = type === 'tkup' ? rank.tkup : rank.tkuc.toFixed(2);
        const currency = type === 'tkup' ? 'TKUP' : 'TKUC';

        return `${medal} <@${rank.userId}> - ${value} ${currency}`;
      }).join('\n');

      embed.addFields({
        name: `トップ ${Math.min(limit, rankings.length)} 位`,
        value: rankingText.length > 1024 ? rankingText.substring(0, 1021) + '...' : rankingText,
        inline: false
      });

      // 自分の順位を表示
      const myRanking = rankings.findIndex(rank => rank.userId === interaction.user.id);
      if (myRanking !== -1) {
        const myRank = myRanking + 1;
        const myValue = type === 'tkup' ? rankings[myRanking].tkup : rankings[myRanking].tkuc.toFixed(2);
        const currency = type === 'tkup' ? 'TKUP' : 'TKUC';

        embed.addFields({
          name: 'あなたの順位',
          value: `${myRank} 位 - ${myValue} ${currency}`,
          inline: false
        });
      } else {
        // ランキング外の場合
        embed.addFields({
          name: 'あなたの順位',
          value: 'ランキング圏外',
          inline: false
        });
      }

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Leaderboard command error:', error);
      await interaction.reply({
        content: 'ランキングの取得中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};
