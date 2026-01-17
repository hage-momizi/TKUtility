const { SlashCommandBuilder } = require('discord.js');
const { getSpeakerMap, saveUserSettings, loadUserSettings } = require('../modules/yomiageService');

const command = new SlashCommandBuilder()
  .setName('setvoice')
  .setDescription('あなたの読み上げ声優を変更します。')
  .addStringOption(option =>
    option.setName('character')
      .setDescription('好きな声優を選んでね!!')
      .setRequired(true)
      .setAutocomplete(true)
  );

async function execute(interaction) {
  const character = interaction.options.getString('character');
  const speakerMap = getSpeakerMap();
  const speakerId = speakerMap[character];

  if (!speakerId) {
    return await interaction.reply({ content: 'Invalid character selected.', ephemeral: true });
  }

  const userSettings = loadUserSettings();
  if (!userSettings[interaction.user.id]) {
    userSettings[interaction.user.id] = {};
  }
  userSettings[interaction.user.id].speaker = speakerId;
  saveUserSettings(userSettings);

  await interaction.reply({ content: `ボイスを変更しました！ ${character}!`, ephemeral: true });
}

module.exports = { command, execute };
