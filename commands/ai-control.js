const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const { loadJSON, saveJSON } = require('../modules/fileStorage');

const aiChannelFile = path.join(__dirname, '..', 'aichannel.json');

const command = new SlashCommandBuilder()
  .setName('ai-control')
  .setDescription('AIの口調を設定します')
  .addStringOption(option =>
    option
      .setName('control')
      .setDescription('AIの口調設定')
      .setRequired(true)
  );

async function execute(interaction, client) {
  const control = interaction.options.getString('control');
  const guildId = interaction.guild.id;

  // 設定保存
  const config = loadJSON(aiChannelFile);
  if (!config[guildId]) {
    config[guildId] = {};
  }
  config[guildId].control = control;
  saveJSON(aiChannelFile, config);

  await interaction.reply({ content: `AIの口調を「${control}」に設定しました。`, ephemeral: true });
}

module.exports = { command, execute };
