const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const command = new SlashCommandBuilder()
  .setName('portcheck')
  .setDescription('指定したホストのポート開放状態をチェックします')
  .addStringOption(option =>
    option.setName('host')
      .setDescription('IPアドレスまたはホスト名')
      .setRequired(true))
  .addIntegerOption(option =>
    option.setName('port1')
      .setDescription('チェックするポート1')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(65535))
  .addIntegerOption(option =>
    option.setName('port2')
      .setDescription('チェックするポート2（オプション）')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(65535))
  .addIntegerOption(option =>
    option.setName('port3')
      .setDescription('チェックするポート3（オプション）')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(65535));

async function execute(interaction, client) {
  const host = interaction.options.getString('host');
  const port1 = interaction.options.getInteger('port1');
  const port2 = interaction.options.getInteger('port2');
  const port3 = interaction.options.getInteger('port3');

  // ポート配列作成
  const ports = [port1];
  if (port2 !== null) ports.push(port2);
  if (port3 !== null) ports.push(port3);

  await interaction.deferReply();

  try {
    // portchecker.io API呼び出し
    const response = await axios.post('https://portchecker.io/api/query', {
      host: host,
      ports: ports
    });

    const data = response.data;

    if (data.error) {
      const embed = new EmbedBuilder()
        .setTitle('<a:thinking:1459764144491204628> PortCheckResult')
        .addFields({
          name: 'エラー',
          value: `\`\`\`\n${data.msg || 'APIエラー'}\n\`\`\``,
          inline: false
        });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // 結果テキスト構築
    let resultText = '';
    data.check.forEach(check => {
      resultText += `${check.port}: ${check.status ? 'True' : 'False'}\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle('<a:thinking:1459764144491204628> PortCheckResult')
      .addFields({
        name: `Host: ${data.host}`,
        value: `\`\`\`\n${resultText}\`\`\``,
        inline: false
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Port check API error:', error);
    const embed = new EmbedBuilder()
      .setTitle('<a:thinking:1459764144491204628> PortCheckResult')
      .addFields({
        name: 'エラー',
        value: `\`\`\`\nAPIリクエストに失敗しました: ${error.message}\n\`\`\``,
        inline: false
      });
    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { command, execute };
