// 認証関連の機能
class AuthManager {
    constructor() {
        this.user = null;
        this.sessionToken = null;
        this.init();
    }

    init() {
        // セッションストレージから認証情報を読み込み
        const savedAuth = localStorage.getItem('tkuc_auth');
        if (savedAuth) {
            try {
                const auth = JSON.parse(savedAuth);
                this.user = auth.user;
                this.sessionToken = auth.sessionToken;
                this.showLoggedInState();
            } catch (e) {
                console.error('Failed to parse saved auth:', e);
                this.logout();
            }
        }

        this.bindEvents();
    }

    bindEvents() {
        // ログインフォーム
        const tokenForm = document.getElementById('token-login-form');
        const keyForm = document.getElementById('key-login-form');

        if (tokenForm) {
            tokenForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.loginWithToken();
            });
        }

        if (keyForm) {
            keyForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.loginWithKeys();
            });
        }

        // ファイルアップロード
        const fileInput = document.getElementById('key-file-upload');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files[0]);
            });
        }

        // APIキー解析ボタン
        const parseBtn = document.getElementById('parse-key-file');
        if (parseBtn) {
            parseBtn.addEventListener('click', () => {
                this.parseKeyFile();
            });
        }

        // ログアウトボタン
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // モーダルが閉じられたときの処理
        const loginModal = document.getElementById('loginModal');
        if (loginModal) {
            loginModal.addEventListener('hidden.bs.modal', () => {
                // フォームリセット
                document.getElementById('token-input').value = '';
                document.getElementById('key-file-upload').value = '';
                document.getElementById('key-file-content').value = '';
                document.getElementById('access-key-input').value = '';
                document.getElementById('secret-key-input').value = '';
                document.getElementById('key-login-btn').disabled = true;
            });
        }
    }

    async loginWithToken() {
        const token = document.getElementById('token-input').value.trim();
        if (!token) {
            this.showError('トークンを入力してください。');
            return;
        }

        this.showLoading('ログイン中...');

        try {
            const response = await fetch('/api/token-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token })
            });

            const data = await response.json();

            if (data.success) {
                this.user = data.user;
                this.sessionToken = this.generateSessionToken();
                this.saveAuth();
                this.showLoggedInState();

                // モーダルを閉じる
                const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
                if (modal) modal.hide();

                this.hideLoading();
                this.showSuccess('ログインしました！');
            } else {
                this.hideLoading();
                this.showError(data.error || 'ログインに失敗しました。');
            }
        } catch (error) {
            this.hideLoading();
            console.error('Login error:', error);
            this.showError('ネットワークエラーが発生しました。');
        }
    }

    async loginWithKeys() {
        const accessKey = document.getElementById('access-key-input').value.trim();
        const secretKey = document.getElementById('secret-key-input').value.trim();

        if (!accessKey || !secretKey) {
            this.showError('Access KeyとSecret Keyを入力してください。');
            return;
        }

        this.showLoading('ログイン中...');

        try {
            const response = await fetch('/api/keys-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ accessKey, secretKey })
            });

            const data = await response.json();

            if (data.success) {
                this.user = data.user;
                this.sessionToken = this.generateSessionToken();
                this.saveAuth();
                this.showLoggedInState();

                // モーダルを閉じる
                const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
                if (modal) modal.hide();

                this.hideLoading();
                this.showSuccess('ログインしました！');
            } else {
                this.hideLoading();
                this.showError(data.error || 'ログインに失敗しました。');
            }
        } catch (error) {
            this.hideLoading();
            console.error('Login error:', error);
            this.showError('ネットワークエラーが発生しました。');
        }
    }

    logout() {
        this.user = null;
        this.sessionToken = null;
        localStorage.removeItem('tkuc_auth');
        this.showLoggedOutState();
        this.showSuccess('ログアウトしました。');
    }

    showLoggedInState() {
        // ナビゲーション更新
        document.getElementById('login-section').classList.add('d-none');
        document.getElementById('user-info').classList.remove('d-none');
        document.getElementById('trade-nav').style.display = 'block';

        // 取引セクション表示
        document.getElementById('trade-section').classList.remove('d-none');
        document.getElementById('login-prompt').classList.add('d-none');

        // ユーザー情報表示
        if (this.user) {
            document.getElementById('user-display').textContent = this.user.displayName;
        }

        // バランス更新
        this.updateBalance();
    }

    showLoggedOutState() {
        // ナビゲーション更新
        document.getElementById('login-section').classList.remove('d-none');
        document.getElementById('user-info').classList.add('d-none');
        document.getElementById('trade-nav').style.display = 'none';

        // 取引セクション非表示
        document.getElementById('trade-section').classList.add('d-none');
        document.getElementById('login-prompt').classList.remove('d-none');
    }

    saveAuth() {
        const auth = {
            user: this.user,
            sessionToken: this.sessionToken,
            timestamp: Date.now()
        };
        localStorage.setItem('tkuc_auth', JSON.stringify(auth));
    }

    generateSessionToken() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    async updateBalance() {
        if (!this.user) return;

        try {
            // トークン認証の場合
            if (this.sessionToken) {
                const response = await fetch('/api/token-balance', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ token: this.sessionToken })
                });

                const data = await response.json();
                if (data.success) {
                    this.updateBalanceDisplay(data.balance);
                }
            }
        } catch (error) {
            console.error('Balance update error:', error);
        }
    }

    updateBalanceDisplay(balance) {
        if (balance) {
            document.getElementById('tkup-balance').textContent = balance.tkup.toLocaleString();
            document.getElementById('tkuc-balance').textContent = balance.tkuc.toFixed(2);
        }
    }

    showLoading(message = '処理中...') {
        // Bootstrapのトーストで代用
        this.showToast(message, 'info');
    }

    hideLoading() {
        // トーストは自動で消える
    }

    showError(message) {
        this.showToast(message, 'danger');
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showToast(message, type = 'info') {
        // Bootstrapトーストを作成
        const toastContainer = document.querySelector('.toast-container') || this.createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type} border-0`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        toastContainer.appendChild(toast);
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();

        // 自動削除
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }

    createToastContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1050';
        document.body.appendChild(container);
        return container;
    }

    // ファイルアップロード処理
    async handleFileUpload(file) {
        if (!file) return;

        // ファイルタイプチェック
        if (!file.name.endsWith('.key') && !file.name.endsWith('.txt')) {
            this.showError('対応しているファイル形式は .key または .txt のみです。');
            return;
        }

        // ファイルサイズチェック（1MB以下）
        if (file.size > 1024 * 1024) {
            this.showError('ファイルサイズが大きすぎます。1MB以下のファイルを選択してください。');
            return;
        }

        this.showLoading('ファイルを読み込み中...');

        try {
            const content = await this.readFileContent(file);

            // テキストエリアに内容を設定
            document.getElementById('key-file-content').value = content;

            this.hideLoading();

            // 自動的に解析を実行
            this.parseKeyFile();

        } catch (error) {
            this.hideLoading();
            console.error('File read error:', error);
            this.showError('ファイルの読み込みに失敗しました。');
        }
    }

    // FileReaderでファイル内容を読み取る
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                resolve(e.target.result);
            };

            reader.onerror = (e) => {
                reject(new Error('ファイルの読み込みに失敗しました。'));
            };

            reader.readAsText(file, 'UTF-8');
        });
    }

    // APIキーファイルを解析
    parseKeyFile() {
        const fileContent = document.getElementById('key-file-content').value.trim();

        if (!fileContent) {
            this.showError('ファイル内容を入力してください。');
            return;
        }

        try {
            // Access Keyの抽出
            const accessKeyMatch = fileContent.match(/Access Key:\s*(TKU-[A-Z0-9-]+)/);
            // Secret Keyの抽出
            const secretKeyMatch = fileContent.match(/Secret Key:\s*([a-f0-9]+)/);

            if (!accessKeyMatch || !secretKeyMatch) {
                this.showError('ファイル形式が正しくありません。/tk-tokenコマンドで取得したファイルの内容を確認してください。');
                return;
            }

            const accessKey = accessKeyMatch[1];
            const secretKey = secretKeyMatch[1];

            // 入力フィールドに設定
            document.getElementById('access-key-input').value = accessKey;
            document.getElementById('secret-key-input').value = secretKey;

            // ログインボタンを有効化
            document.getElementById('key-login-btn').disabled = false;

            this.showSuccess('APIキーを解析しました！ログインできます。');

        } catch (error) {
            console.error('Parse error:', error);
            this.showError('ファイルの解析に失敗しました。');
        }
    }

    // セッションの有効性をチェック
    isLoggedIn() {
        return this.user && this.sessionToken;
    }

    // APIリクエスト用の認証ヘッダーを取得
    getAuthHeaders() {
        if (this.sessionToken) {
            return {
                'Authorization': `Bearer ${this.sessionToken}`,
                'Content-Type': 'application/json'
            };
        }
        return { 'Content-Type': 'application/json' };
    }
}

// グローバルインスタンス
const authManager = new AuthManager();
