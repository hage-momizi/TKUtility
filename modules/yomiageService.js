const axios = require('axios');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const VOICEVOX_BASE_URL = 'http://100.72.231.58:50021';

// アクティブな接続管理
let activeConnections = {};
let userSettings = {};
let speakerMap = {};

// Load settings
const settingsPath = path.join(__dirname, '..', 'settings.json');
if (fs.existsSync(settingsPath)) {
  userSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

// Load speakers
const speakersPath = path.join(__dirname, '..', 'speakers.json');
if (fs.existsSync(speakersPath)) {
  const speakers = JSON.parse(fs.readFileSync(speakersPath, 'utf8'));
  speakers.forEach(speaker => {
    speaker.styles.forEach(style => {
      const key = `${speaker.name}:${style.name}`;
      speakerMap[key] = style.id;
    });
  });
}

// Save settings
function saveUserSettings(settings) {
  userSettings = settings;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// Load settings
function loadUserSettings() {
  return userSettings;
}

// Get speaker map
function getSpeakerMap() {
  return speakerMap;
}

// Get active connections
function getActiveConnections() {
  return activeConnections;
}

// VOICEVOX functions
async function synthesizeSpeech(text, speakerId) {
  try {
    // Get audio query
    const queryResponse = await axios.post(`${VOICEVOX_BASE_URL}/audio_query`, null, {
      params: {
        text: text,
        speaker: speakerId,
      },
    });

    // Synthesize audio
    const synthesisResponse = await axios.post(`${VOICEVOX_BASE_URL}/synthesis`, queryResponse.data, {
      params: { speaker: speakerId },
      headers: {
        'Accept': 'audio/ogg; codecs=opus'
      },
      responseType: 'arraybuffer',
    });

    return synthesisResponse.data;
  } catch (error) {
    console.error('Error synthesizing speech:', error.message);
    return null;
  }
}

// Clean text for TTS
function cleanTextForTts(text) {
  let cleaned = text;

  // Code blocks
  const codeBlockPattern = /```(\w+)(.*?)```/gs;
  cleaned = cleaned.replace(codeBlockPattern, (match, lang) => {
    const lowerLang = lang.toLowerCase();
    return lowerLang === 'python' ? 'Pythonコード省略 ' :
           (lowerLang === 'javascript' || lowerLang === 'js') ? 'NodeJs省略 ' :
           lowerLang === 'html' ? 'HTML省略 ' : `${lang}コード省略 `;
  });

  // URLs, IPs, domains
  const ipv6Pattern = /([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}(?:%[a-zA-Z0-9]+)?\s*/gi;
  const ipv4Pattern = /(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\s*/g;
  const fullUrlPattern = /(https?|ftp):\/\/[^\s/$.?#].[^\s]*\s*/gi;
  const domainPattern = /(\w+\.(com|net|org|co\.jp|jp|io|dev)\S*)\s*/gi;

  cleaned = cleaned.replace(fullUrlPattern, 'URL省略 ');
  cleaned = cleaned.replace(ipv6Pattern, 'IPv6省略 ');
  cleaned = cleaned.replace(ipv4Pattern, 'IPv4省略 ');
  cleaned = cleaned.replace(domainPattern, 'ドメイン省略 ');

  // Discord syntax
  const customEmojiPattern = /<a?:[a-zA-Z0-9_]+:[0-9]+>/g;
  const mentionOrIdPattern = /(<(@|#|@&)[0-9]+>)|([0-9]{16,})/g;

  cleaned = cleaned.replace(customEmojiPattern, ' ');
  cleaned = cleaned.replace(mentionOrIdPattern, ' ');

  // Multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

// Process queue
async function processQueue(guildId, text, speakerId) {
  const active = activeConnections[guildId];
  if (!active) return;

  const cleanedText = text.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00A0\u180E\u2020\u2021\u2022\u2023\u2024\u2025\u2026\u2027\u2028\u2029\u202A\u202B\u202C\u202D\u202E\u202F\uFEFF]/g, '').trim();
  const textToSynthesize = cleanedText.substring(0, 100);

  const audioBuffer = await synthesizeSpeech(textToSynthesize, speakerId);
  if (!audioBuffer) {
    active.player.emit(AudioPlayerStatus.Idle);
    return;
  }

  const buffer = Buffer.from(audioBuffer);
  const stream = Readable.from(buffer);

  const resource = createAudioResource(stream, {
    inputType: require('@discordjs/voice').StreamType.Arbitrary,
    inlineVolume: true,
  });

  active.player.play(resource);
  console.log(`Playing TTS from queue: ${textToSynthesize} in guild ${guildId}`);
}

// Subscribe to player events
function subscribeToPlayerEvents(guildId, player) {
  player.on(AudioPlayerStatus.Idle, () => {
    const active = activeConnections[guildId];
    if (active && active.queue.length > 0) {
      const nextItem = active.queue.shift();
      processQueue(guildId, nextItem.text, nextItem.speakerId);
    }
  });

  player.on('error', error => {
    console.error(`Audio player error in guild ${guildId}: ${error.message}`);
    const active = activeConnections[guildId];
    if (active && active.queue.length > 0) {
      const nextItem = active.queue.shift();
      processQueue(guildId, nextItem.text, nextItem.speakerId);
    }
  });
}

// Play text
async function playText(rawText, speakerId, player, guildId) {
  const active = activeConnections[guildId];
  if (!active) return;

  const ttsText = cleanTextForTts(rawText);
  if (!ttsText) {
    console.log('TTS skipped: Text empty after cleaning.');
    return;
  }

  const item = { text: ttsText, speakerId };

  if (player.state.status === AudioPlayerStatus.Playing || active.queue.length > 0) {
    active.queue.push(item);
    console.log(`TTS queued: ${ttsText.substring(0, 10)}... in guild ${guildId}. Queue size: ${active.queue.length}`);
    return;
  }

  console.log(`TTS playing immediately: ${ttsText.substring(0, 10)}... in guild ${guildId}`);
  processQueue(guildId, ttsText, speakerId);
}

// Join voice channel
function joinVoiceChannelForYomiage(client, guildId, channelId, textChannelId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== 2) return;

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  activeConnections[guildId] = {
    connection: connection,
    textChannelId: textChannelId,
    voiceChannelId: channelId,
    player: player,
    queue: [],
  };

  subscribeToPlayerEvents(guildId, player);
  console.log(`Joined voice channel ${channel.name} in guild ${guild.name}`);
}

// Leave voice channel
function leaveVoiceChannelForYomiage(guildId) {
  const active = activeConnections[guildId];
  if (active) {
    active.connection.destroy();
    delete activeConnections[guildId];
    console.log(`Left voice channel for guild ${guildId}`);
  }
}

// Skip yomiage
function skipYomiage(guildId) {
  const active = activeConnections[guildId];
  if (!active) return false;

  active.player.stop(true);
  active.queue.length = 0;
  return true;
}

module.exports = {
  joinVoiceChannelForYomiage,
  leaveVoiceChannelForYomiage,
  playText,
  skipYomiage,
  getSpeakerMap,
  saveUserSettings,
  loadUserSettings,
  getActiveConnections,
  cleanTextForTts,
};
