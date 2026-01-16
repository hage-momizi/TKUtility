const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const { loadJSON, saveJSON } = require('../modules/fileStorage');

const aiUserFile = path.join(__dirname, '..', 'aiuser.json');

const command = new SlashCommandBuilder()
  .setName('ai-user-clear')
  .setDescription('AIに保存されているあなたの情報をクリアします');

async function execute(interaction, client) {
  const userId = interaction.user.id;
  const guildId = interaction.guild.id;

  // ユーザー情報をクリア
  const userData = loadJSON(aiUserFile);
  if (userData[guildId] && userData[guildId][userId]) {
    delete userData[guildId][userId];
    saveJSON(aiUserFile, userData);
    await interaction.reply({ content: 'あなたの情報をクリアしました。', ephemeral: true });
  } else {
    await interaction.reply({ content: 'クリアする情報が見つかりませんでした。', ephemeral: true });
  }
}

module.exports = { command, execute };
