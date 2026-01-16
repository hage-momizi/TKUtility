const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../modules/earthquakeService');

const command = new SlashCommandBuilder()
  .setName('earthquake-settings')
  .setDescription('現在の地震情報通知設定を表示します');

async function execute(interaction) {
  const guildId = interaction.guild.id;
  const config = getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle('⚙️ 地震情報通知設定')
    .setColor(0x0099ff);

  if (config.eewChannelId) {
    embed.addFields(
      { name: '通知チャンネル', value: `<#${config.eewChannelId}>`, inline: true },
      { name: '監視状態', value: config.watchEnabled !== false ? '有効' : '無効', inline: true }
    );
  } else {
    embed.setDescription('通知チャンネルが設定されていません。\n`/earthquake-set-eew` でチャンネルを設定してください。');
  }

  // 利用可能なコマンドを表示
  embed.addFields({
    name: '利用可能なコマンド',
    value:
      '`/earthquake-latest` - 最新の地震情報を表示\n' +
      '`/earthquake-history` - 過去の地震履歴を表示\n' +
      '`/earthquake-set-eew` - 通知チャンネルを設定（管理者）\n' +
      '`/earthquake-watch` - 監視のオン/オフ（管理者）',
    inline: false
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { command, execute };
