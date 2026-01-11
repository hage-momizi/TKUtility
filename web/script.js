currentGuildId = null;
let newsItems = [];

// ページ読み込み時にサーバー一覧を取得
document.addEventListener('DOMContentLoaded', function() {
    loadGuilds();
});

// サーバー一覧を取得
async function loadGuilds() {
    try {
        const response = await fetch('/api/guilds');
        const guilds = await response.json();

        const guildList = document.getElementById('guild-list');
        guildList.innerHTML = '';

        guilds.forEach(guild => {
            const guildItem = document.createElement('div');
            guildItem.className = 'guild-item';
            guildItem.onclick = () => selectGuild(guild.id);

            if (guild.icon) {
                const img = document.createElement('img');
                img.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
                img.alt = guild.name;
                guildItem.appendChild(img);
            } else {
                const initial = document.createElement('span');
                initial.textContent = guild.name.charAt(0).toUpperCase();
                initial.style.fontSize = '20px';
                initial.style.fontWeight = 'bold';
                guildItem.appendChild(initial);
            }

            const nameDiv = document.createElement('div');
            nameDiv.className = 'guild-name';
            nameDiv.textContent = guild.name;
            guildItem.appendChild(nameDiv);

            guildList.appendChild(guildItem);
        });
    } catch (error) {
        console.error('Failed to load guilds:', error);
    }
}

// サーバーを選択
async function selectGuild(guildId) {
    currentGuildId = guildId;

    // 選択状態を更新
    document.querySelectorAll('.guild-item').forEach(item => {
        item.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');

    // 設定とチャンネルを取得
    try {
        const [configResponse, channelsResponse] = await Promise.all([
            fetch(`/api/config/${guildId}`),
            fetch(`/api/channels/${guildId}`)
        ]);

        const config = await configResponse.json();
        const channels = await channelsResponse.json();

        // チャンネル選択を更新
        const channelSelect = document.getElementById('channel-select');
        channelSelect.innerHTML = '<option value="">チャンネルを選択</option>';
        channels.forEach(channel => {
            const option = document.createElement('option');
            option.value = channel.id;
            option.textContent = `#${channel.name}`;
            if (config.channelId === channel.id) {
                option.selected = true;
            }
            channelSelect.appendChild(option);
        });

        // ニュースアイテムを更新
        newsItems = config.news || [];
        updateNewsItems();
        updatePreview();

        // フォームを表示
        document.getElementById('guild-info').style.display = 'none';
        document.getElementById('settings-form').style.display = 'block';

    } catch (error) {
        console.error('Failed to load guild config:', error);
    }
}

// ニュースアイテムを更新
function updateNewsItems() {
    const container = document.getElementById('news-items');
    container.innerHTML = '';

    newsItems.forEach((news, index) => {
        const item = document.createElement('div');
        item.className = 'news-item';

        item.innerHTML = `
            <input type="text" class="form-control" placeholder="タイトル" value="${news.title || ''}" onchange="updateNewsItem(${index}, 'title', this.value)">
            <textarea class="form-control" placeholder="要約" rows="3" onchange="updateNewsItem(${index}, 'summary', this.value)">${news.summary || ''}</textarea>
            <input type="url" class="form-control" placeholder="URL" value="${news.url || ''}" onchange="updateNewsItem(${index}, 'url', this.value)">
            <input type="url" class="form-control" placeholder="画像URL (オプション)" value="${news.imageUrl || ''}" onchange="updateNewsItem(${index}, 'imageUrl', this.value)">
            <button class="delete-btn" onclick="deleteNewsItem(${index})">削除</button>
        `;

        container.appendChild(item);
    });
}

// ニュースアイテムを更新
function updateNewsItem(index, field, value) {
    newsItems[index][field] = value;
    updatePreview();
}

// ニュースアイテムを削除
function deleteNewsItem(index) {
    newsItems.splice(index, 1);
    updateNewsItems();
    updatePreview();
}

// ニュースアイテムを追加
function addNewsItem() {
    if (newsItems.length >= 3) {
        alert('ニュースは最大3個までです。');
        return;
    }

    newsItems.push({ title: '', summary: '', url: '' });
    updateNewsItems();
    updatePreview();
}

// プレビューを更新
function updatePreview() {
    const container = document.getElementById('embed-fields');
    container.innerHTML = '';

    newsItems.forEach((news, index) => {
        if (news.title || news.summary || news.url) {
            const field = document.createElement('div');
            field.className = 'embed-field';

            field.innerHTML = `
                <div class="embed-field-name">${index + 1}. ${news.title || 'タイトル'}</div>
                <div class="embed-field-value">
                    ${news.summary || '要約'}<br>
                    <a href="${news.url || '#'}" target="_blank">[詳細を読む]</a>
                </div>
            `;

            container.appendChild(field);
        }
    });
}

// AIでニュース要約
async function summarizeNews() {
    const input = document.getElementById('ai-input').value.trim();
    const output = document.getElementById('ai-output');

    if (!input) {
        output.textContent = 'ニュース内容を入力してください。';
        return;
    }

    output.textContent = '要約中...';

    try {
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: input })
        });

        if (response.ok) {
            const result = await response.json();
            output.textContent = result.summary;
        } else {
            output.textContent = '要約に失敗しました。';
        }
    } catch (error) {
        console.error('Summarization error:', error);
        output.textContent = '要約に失敗しました。';
    }
}

// 設定を保存
async function saveConfig() {
    if (!currentGuildId) return;

    const channelId = document.getElementById('channel-select').value;

    try {
        const response = await fetch(`/api/config/${currentGuildId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channelId: channelId,
                news: newsItems.filter(item => item.title.trim() || item.summary.trim() || item.url.trim())
            })
        });

        if (response.ok) {
            alert('設定を保存しました！');
        } else {
            alert('保存に失敗しました。');
        }
    } catch (error) {
        console.error('Failed to save config:', error);
        alert('保存に失敗しました。');
    }
}
