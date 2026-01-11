const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { searchLawsFromQuery, formatLawSearchResults } = require('../modules/lawService');

const command = new SlashCommandBuilder()
  .setName('law-search')
  .setDescription('自然言語で法令を検索します')
  .addStringOption(option =>
    option.setName('query')
      .setDescription('検索したい内容（例: 性的な画像を要求された。相手も未成年で、私も未成年だ。）')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('limit')
      .setDescription('表示件数（1-10、デフォルト: 5）')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(10)
  );

async function execute(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const query = interaction.options.getString('query');
  const limit = interaction.options.getInteger('limit') || 5;

  try {
    // 法令検索実行
    const searchResults = await searchLawsFromQuery(query, limit);

    // 結果をEmbed用に整形（フィールドとまとめ）
    const { fields, summary } = await formatLawSearchResults(searchResults, query);

    // Embed作成
    const embed = new EmbedBuilder()
      .setTitle('⚖️ 法令検索結果')
      .setDescription(`**検索クエリ:** ${query}`)
      .setColor(0x3498db) // 青色
      .addFields(fields)
      .addFields({ name: '🤖 AIアドバイス', value: summary, inline: false })
      .setFooter({ text: 'e-Gov法令検索APIを使用 | AIによるキーワード変換・アドバイス生成' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Law search command error:', error);
    await interaction.editReply({
      content: '法令検索中にエラーが発生しました。しばらく経ってから再度お試しください。',
      ephemeral: true
    });
  }
}

module.exports = { command, execute };
