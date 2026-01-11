const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dns = require('dns');

const command = new SlashCommandBuilder()
  .setName('nslookup')
  .setDescription('ドメインに対してnslookupを行います')
  .addStringOption(option =>
    option.setName('domain')
      .setDescription('ドメイン名')
      .setRequired(true));

async function execute(interaction, client) {
  const domain = interaction.options.getString('domain');

  await interaction.deferReply();

  dns.lookup(domain, (err, address, family) => {
    if (err) {
      const embed = new EmbedBuilder()
        .setTitle('NSLookup 結果')
        .setDescription(`ドメイン: ${domain}`)
        .addFields(
          { name: 'エラー', value: err.message, inline: false }
        )
        .setColor(0xff0000);
      interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('NSLookup 結果')
      .setDescription(`ドメイン: ${domain}`)
      .addFields(
        { name: 'IPアドレス', value: address, inline: true },
        { name: 'ファミリー', value: family === 4 ? 'IPv4' : 'IPv6', inline: true }
      )
      .setColor(0x00ff00);
    interaction.editReply({ embeds: [embed] });
  });
}

module.exports = { command, execute };
