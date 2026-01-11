const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const command = new SlashCommandBuilder()
  .setName('news_now')
  .setDescription('今すぐニュースを配信します');

async function execute(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  // index.jsのsendNews関数を使用
  const sendNews = require('../index.js').sendNews;
  await sendNews(client, interaction.guild.id);

  await interaction.editReply({ content: 'ニュースを配信しました！' });
}

module.exports = { command, execute };
