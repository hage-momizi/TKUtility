const { SlashCommandBuilder } = require('discord.js');
const { loadJSON, saveJSON } = require('../modules/fileStorage');

const command = new SlashCommandBuilder()
  .setName('news_timeset')
  .setDescription('ニュース送信時間を設定します（最大5時間）')
  .addStringOption(option =>
    option.setName('time1')
      .setDescription('送信時間1 (HH:MM)')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('time2')
      .setDescription('送信時間2 (HH:MM)')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('time3')
      .setDescription('送信時間3 (HH:MM)')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('time4')
      .setDescription('送信時間4 (HH:MM)')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('time5')
      .setDescription('送信時間5 (HH:MM)')
      .setRequired(false));

async function execute(interaction, client) {
  console.log('news_timeset executed');
  await interaction.deferReply({ ephemeral: true });
  console.log('deferReply done');

  if (!interaction.guild) {
    await interaction.editReply({ content: 'このコマンドはサーバー内でのみ使用できます。' });
    return;
  }

  if (!interaction.member.permissions.has(require('discord.js').PermissionsBitField.Flags.Administrator)) {
    await interaction.editReply({ content: 'このコマンドは管理者専用です。' });
    return;
  }

  const times = [];
  for (let i = 1; i <= 5; i++) {
    const time = interaction.options.getString(`time${i}`);
    if (time) {
      // 時間形式バリデーション
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(time)) {
        await interaction.editReply({ content: `時間${i}の形式が正しくありません。HH:MM形式で入力してください。` });
        return;
      }
      times.push(time);
    }
  }

  if (times.length === 0) {
    await interaction.editReply({ content: '少なくとも1つの時間を設定してください。' });
    return;
  }

  // newsconfig.jsonに保存
  const newsConfigFile = path.join(__dirname, '..', 'newsconfig.json');
  const config = loadJSON(newsConfigFile);
  if (!config[interaction.guild.id]) {
    config[interaction.guild.id] = { channelId: '', news: [], times: [] };
  }
  config[interaction.guild.id].times = times;
  saveJSON(newsConfigFile, config);

  // スケジューラーを再設定
  setupSchedules(client, interaction.guild.id, times);

  await interaction.editReply({ content: `ニュース送信時間を設定しました：${times.join(', ')}` });
}

// スケジューラー設定関数
function setupSchedules(client, guildId, times) {
  const schedule = require('node-schedule');

  // 既存のスケジュールをキャンセル（guildIdで管理）
  if (global.schedules && global.schedules[guildId]) {
    global.schedules[guildId].forEach(job => job.cancel());
  }

  if (!global.schedules) global.schedules = {};
  global.schedules[guildId] = [];

  times.forEach(time => {
    const [hour, minute] = time.split(':');
    const cronTime = `0 ${minute} ${hour} * * *`; // JST

    const job = schedule.scheduleJob(cronTime, async () => {
      const sendNews = require('../index.js').sendNews;
      await sendNews(client, guildId, 'auto', null, null, time);
    });

    global.schedules[guildId].push(job);
  });
}

module.exports = { command, execute, setupSchedules };
