const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const { loadJSON, saveJSON } = require('../modules/fileStorage');

const aiChannelFile = path.join(__dirname, '..', 'aichannel.json');

const command = new SlashCommandBuilder()
  .setName('ai-start')
  .setDescription('AIを開始します');

async function execute(interaction, client) {
  const guildId = interaction.guild.id;

  // 設定保存
  const config = loadJSON(aiChannelFile);
  if (!config[guildId]) {
    config[guildId] = {};
  }
  config[guildId].enabled = true;
  saveJSON(aiChannelFile, config);

  await interaction.reply({ content: 'AIを開始しました。', ephemeral: true });
}

module.exports = { command, execute };
