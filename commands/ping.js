const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const command = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Replies with Pong!');

async function execute(interaction, client) {
  const sent = await interaction.reply({ content: 'Pong!', fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const gatewayLatency = client.ws.ping;

  const embed = new EmbedBuilder()
    .addFields(
      { name: 'API Endpoint', value: `${latency}ms` },
      { name: 'Websocket', value: `${gatewayLatency}ms` }
    );

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { command, execute };
