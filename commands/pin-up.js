const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadPins, savePins } = require('../modules/utils');

const command = new SlashCommandBuilder()
  .setName('pin-up')
  .setDescription('ピン止めメッセージをこのチャンネルに固定表示')
  .addIntegerOption(option =>
    option.setName('save_number')
      .setDescription('保存番号')
      .setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction, client){
  const saveNumber = interaction.options.getInteger('save_number');

  const pins = loadPins();
  const pinData = pins[saveNumber];
  if (!pinData || !pinData.url) {
    await interaction.reply('指定された保存番号が見つかりません。');
    return;
  }

  // 他のチャンネルで設定されているピン止めをクリア
  for (const [key, pin] of Object.entries(pins)) {
    if (pin.channelId && key !== saveNumber) {
      pin.channelId = null;
      pin.pinnedMessageId = null;
    }
  }

  // 表示先チャンネルを設定
  pinData.channelId = interaction.channel.id;
  pinData.pinnedMessageId = null;
  savePins(pins);

  await interaction.reply('このチャンネルにピン表示を設定しました。次の発言時に表示されます。');
}

module.exports = { command, execute };
