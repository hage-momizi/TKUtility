const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadPins, savePins } = require('../modules/utils');

const command = new SlashCommandBuilder()
  .setName('pin')
  .setDescription('ピン止めするメッセージを保存')
  .addStringOption(option =>
    option.setName('message_url')
      .setDescription('メッセージのURL')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('save_number')
      .setDescription('保存番号')
      .setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction, client) {
    const messageUrl = interaction.options.getString('message_url');
    const saveNumber = interaction.options.getInteger('save_number');

    const pins = loadPins();
    pins[saveNumber] = { url: messageUrl };
    savePins(pins);

    await interaction.reply(`保存番号 ${saveNumber} にメッセージURLを保存しました: ${messageUrl}`);
}

module.exports = { command, execute };
