const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const axios = require('axios');

const command = new SlashCommandBuilder()
  .setName('ping-host')
  .setDescription('指定したIPアドレスにpingを実行します')
  .addStringOption(option =>
    option.setName('ip')
      .setDescription('pingを実行するIPアドレス')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('region')
      .setDescription('実行する地域 (JP: 東京, US: アメリカ)')
      .setRequired(true)
      .addChoices(
        { name: '日本 (東京)', value: 'JP' },
        { name: 'アメリカ', value: 'US' }
      )
  );

async function execute(interaction) {
  const ip = interaction.options.getString('ip');
  const region = interaction.options.getString('region');

  // IPアドレスの基本的なバリデーション
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipRegex.test(ip)) {
    await interaction.reply({
      content: '有効なIPアドレスを入力してください。',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  // 初期Embed
  let embed = new EmbedBuilder()
    .setTitle('<a:tag:1459775311569752074> Ping実行中')
    .setDescription(`IP: ${ip}\n実行回数: 4回\n\n準備中...`)
    .setColor(0x00ff00)
    .setTimestamp();

  const message = await interaction.editReply({ embeds: [embed] });

  const results = [];

  // 4回pingを実行（リアルタイム結果表示）
  for (let i = 1; i <= 4; i++) {
    try {
      const result = region === 'JP' ? await executePingViaAgent(ip) : await executePingLocal(ip);
      results.push({
        attempt: i,
        success: result.success,
        output: result.output || '結果なし'
      });

      // 実行中のEmbedを更新（結果をリアルタイム追加）
      embed = new EmbedBuilder()
        .setTitle(`<a:tag:1459775311569752074> Ping実行中`)
        .setDescription(`IP: ${ip}\n実行中: ${i}/4回完了`)
        .setColor(result.success ? 0x00ff00 : 0xffa500)
        .setTimestamp();

      // 成功した結果だけをリアルタイム表示
      const successfulResults = results.filter(res => res.success);
      if (successfulResults.length > 0) {
        const resultLines = successfulResults.map(res => {
          const lines = res.output.split('\n');
          const resultLine = lines.find(line => line.includes('bytes from') || line.includes('icmp_seq'));
          return resultLine || '結果なし';
        });

        const combinedResults = resultLines.join('\n');
        embed.addFields({
          name: 'Ping結果',
          value: `\`\`\`\n${combinedResults}\n\`\`\``,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });

      // 次のpingまで少し待つ
      if (i < 4) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      results.push({
        attempt: i,
        success: false,
        output: `エラー: ${error.message}`
      });

      // エラー時も進捗を表示
      embed = new EmbedBuilder()
        .setTitle(`<a:tag:1459775311569752074> Ping実行中`)
        .setDescription(`IP: ${ip}\n実行中: ${i}/4回完了`)
        .setColor(0xffa500)
        .setTimestamp();

      // エラー時は既存の成功結果を表示
      const successfulResults = results.filter(res => res.success);
      if (successfulResults.length > 0) {
        const resultLines = successfulResults.map(res => {
          const lines = res.output.split('\n');
          const resultLine = lines.find(line => line.includes('bytes from') || line.includes('icmp_seq'));
          return resultLine || '結果なし';
        });

        const combinedResults = resultLines.join('\n');
        embed.addFields({
          name: 'Ping結果',
          value: `\`\`\`\n${combinedResults}\n\`\`\``,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
    }
  }

  // 完了メッセージ
  const successCount = results.filter(r => r.success).length;
  const finalColor = successCount === 4 ? 0x00ff00 : successCount === 0 ? 0xff0000 : 0xffa500;

  embed = new EmbedBuilder()
    .setTitle(`<a:success:1459778804695302260> Ping実行完了`)
    .setDescription(`IP: ${ip}\n実行完了: 4回中${successCount}回成功`)
    .setColor(finalColor)
    .setTimestamp();

  // 成功した結果の「64 bytes from」行だけをまとめて表示
  const successfulResults = results.filter(res => res.success);
  if (successfulResults.length > 0) {
    const resultLines = successfulResults.map(res => {
      const lines = res.output.split('\n');
      const resultLine = lines.find(line => line.includes('bytes from') || line.includes('icmp_seq'));
      return resultLine || '結果なし';
    });

    const combinedResults = resultLines.join('\n');
    embed.addFields({
      name: 'Ping結果',
      value: `\`\`\`\n${combinedResults}\n\`\`\``,
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

/**
 * エージェント経由でpingを実行（東京）
 * @param {string} ip - IPアドレス
 * @returns {Promise<{success: boolean, output: string}>}
 */
async function executePingViaAgent(ip) {
  try {
    const agentUrl = process.env.AGENT_URL || 'http://localhost:65523';
    const apiKey = process.env.AGENT_API_KEY || 'default-key';

    console.log(`[Ping-Agent] Requesting to ${agentUrl}/ping`);

    const response = await axios.post(`${agentUrl}/ping`, {
      ip: ip,
      count: 1
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const data = response.data;
    console.log(`[Ping-Agent] Response:`, data);

    if (data.success && data.results && data.results.length > 0) {
      return {
        success: true,
        output: data.results[0]
      };
    } else {
      return {
        success: false,
        output: data.error || 'エージェントエラー'
      };
    }
  } catch (error) {
    console.error(`[Ping-Agent] Error:`, error.message);
    return {
      success: false,
      output: `エージェント通信エラー: ${error.message}`
    };
  }
}

/**
 * ローカルでpingを実行（アメリカ）
 * @param {string} ip - IPアドレス
 * @returns {Promise<{success: boolean, output: string}>}
 */
function executePingLocal(ip) {
  return new Promise((resolve, reject) => {
    // Ubuntu環境なので ping -c 1 を使用
    const command = `ping -c 1 ${ip}`;

    console.log(`[Ping-Local] Executing command: ${command}`);

    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
      console.log(`[Ping-Local] Error:`, error);
      console.log(`[Ping-Local] Stdout:`, stdout);
      console.log(`[Ping-Local] Stderr:`, stderr);

      const output = stdout || stderr || '';

      // ping成功かどうかを出力内容で判定 (Linux)
      const hasReply = output.includes('bytes from') || output.includes('icmp_seq');
      const hasResponse = output.includes('ttl=') || output.includes('time=');
      const success = !error && (hasReply || hasResponse);

      console.log(`[Ping-Local] Success: ${success}`);

      resolve({
        success: success,
        output: output.substring(0, 1500) // 少し長くして詳細を表示
      });
    });
  });
}

module.exports = { command, execute };
