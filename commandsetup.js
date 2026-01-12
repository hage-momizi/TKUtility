const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Discordトークンの確認
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN が設定されていません。');
  process.exit(1);
}

if (!process.env.APPLICATION_ID) {
  console.error('❌ APPLICATION_ID が設定されていません。');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

/**
 * コマンドを登録する関数
 */
async function registerCommands() {
  try {
    console.log('🔄 コマンド読み込み中...');

    // commands ディレクトリから自動でコマンドを読み込み
    const commandsDir = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));

    const commands = [];
    for (const file of commandFiles) {
      try {
        const commandModule = require(path.join(commandsDir, file));
        if (commandModule.command) {
          commands.push(commandModule.command.toJSON());
          console.log(`✅ ${file} を読み込みました`);
        } else {
          console.log(`⚠️  ${file} に command がありません`);
        }
      } catch (error) {
        console.error(`❌ ${file} の読み込みエラー:`, error.message);
      }
    }

    console.log(`\n📋 登録するコマンド数: ${commands.length}`);
    console.log('コマンド一覧:');
    commands.forEach((cmd, index) => {
      console.log(`  ${index + 1}. /${cmd.name} - ${cmd.description}`);
    });

    // グローバルコマンドとして登録
    console.log('\n🌐 グローバルアプリコマンドを登録中...');
    const data = await rest.put(
      Routes.applicationCommands(process.env.APPLICATION_ID),
      { body: commands }
    );

    console.log('✅ コマンド登録完了！');
    console.log(`📊 登録されたコマンド数: ${data.length}`);

  } catch (error) {
    console.error('❌ コマンド登録エラー:', error);
  }
}

/**
 * ギルド限定コマンドを登録（テスト用）
 */
async function registerGuildCommands(guildId) {
  try {
    console.log(`🔄 ギルド ${guildId} にコマンドを登録中...`);

    const commandsDir = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));

    const commands = [];
    for (const file of commandFiles) {
      try {
        const commandModule = require(path.join(commandsDir, file));
        if (commandModule.command) {
          commands.push(commandModule.command.toJSON());
        }
      } catch (error) {
        console.error(`❌ ${file} の読み込みエラー:`, error.message);
      }
    }

    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.APPLICATION_ID, guildId),
      { body: commands }
    );

    console.log(`✅ ギルド ${guildId} にコマンド登録完了！`);
    console.log(`📊 登録されたコマンド数: ${data.length}`);

  } catch (error) {
    console.error('❌ ギルドコマンド登録エラー:', error);
  }
}

// メイン実行
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--guild') && args.includes('--guild-id')) {
    const guildIdIndex = args.indexOf('--guild-id');
    const guildId = args[guildIdIndex + 1];

    if (!guildId) {
      console.error('❌ --guild-id を指定してください');
      process.exit(1);
    }

    console.log('🎯 ギルド限定コマンド登録モード');
    await registerGuildCommands(guildId);
  } else {
    console.log('🌍 グローバルコマンド登録モード');
    await registerCommands();
  }

  console.log('\n💡 ヒント: コマンド変更時は再度実行してください');
  console.log('   ギルド限定: node commandsetup.js --guild --guild-id YOUR_GUILD_ID');
}

// スクリプト実行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { registerCommands, registerGuildCommands };
