const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannelForYomiage, playText } = require('../modules/yomiageService');

const command = new SlashCommandBuilder()
  .setName('join')
  .setDescription('ボイスチャンネルに読み上げボットを接続させます。');

async function execute(interaction) {
  const channel = interaction.member.voice.channel;
  if (!channel) {
    return await interaction.reply({ content: 'You need to be in a voice channel!', ephemeral: true });
  }

  joinVoiceChannelForYomiage(interaction.client, interaction.guildId, channel.id, interaction.channel.id);

  const embed = new EmbedBuilder()
    .setTitle('TK鯖読み上げ1号機')
    .setColor(0x0099ff)
    .setDescription('接続しました。')
    .addFields(
      { name: '\u200B', value: '`/setvoice` で読み上げするボイスを変更できます' },
      { name: '\u200B', value: '切断するには `/leave` を使用します' }
    );

  await interaction.reply({ embeds: [embed] });

  // Botの参加メッセージを読み上げる
  const joinText = `TK鯖読み上げ1号機が${channel.name}に接続しました。`;
  const active = require('../modules/yomiageService').getActiveConnections()[interaction.guildId];
  if (active) {
    playText(joinText, 0, active.player, interaction.guildId);
  }
}

module.exports = { command, execute };
