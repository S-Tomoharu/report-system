# レポート提出システム - セットアップガイド

このドキュメントは、開発環境と本番環境（GitHub Pages）での セットアップ手順を説明します。

---

## 🔧 1. 開発環境セットアップ

### 1.1 設定ファイルの準備

```bash
# ローカル開発用設定ファイルを作成
cp config.template.js config.local.js
```

### 1.2 config.local.js を編集

以下の値を実際のGAS URLに置き換えてください：

```javascript
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/YOUR_QUIZ_API_GAS_URL/exec',
  SUBMISSION_GAS_URL: 'https://script.google.com/macros/s/YOUR_SUBMISSION_GAS_URL/exec',
  GITHUB_PAGES_URL: 'https://s-tomoharu.github.io/report-system',
  // ... 以下は変更不要
};
```

**GAS URL の確認方法：**
- Google Apps Script エディタを開く
- 「デプロイ」→「新しいデプロイ」または既存デプロイを選択
- 「実行URL」をコピーして `YOUR_QUIZ_API_GAS_URL` に置き換え

---

## ⚙️ 2. GAS スクリプトプロパティ設定

GAS の各プロジェクトで、以下のプロパティを設定してください：

### 全GASプロジェクト共通

1. GASエディタを開く
2. 左メニュー「プロジェクトの設定」（歯車アイコン）をクリック
3. 「スクリプトプロパティ」セクションで以下を追加：

```
キー: SPREADSHEET_ID
値: 1_LJxK8MZRe2BIwhOoG1smVeTEj9F7Oz43ayzmwzUQBM
```

### submission_gas.gs のみ

追加で以下を設定：

```
キー: ROOT_FOLDER_ID
値: 1tJqQc6crBZD1wqCdClAm8gSoGP6B6R5l

キー: OCR_ENABLED
値: true

キー: AI_PROVIDER
値: claude
```

### claude_ocr.gs のみ

```
キー: CLAUDE_API_KEY
値: (Anthropic ConsoleからコピーしたAPIキー)

キー: OCR_ENABLED
値: true

キー: AI_PROVIDER
値: claude
```

---

## 🚀 3. ローカルテスト

### 3.1 Pythonサーバーで動作確認

```bash
cd /Users/tomoharu_suzuki/Library/CloudStorage/Dropbox/report-system
python3 -m http.server 8000
```

### 3.2 ブラウザで確認

- **確認テスト**: http://localhost:8000/quiz/app/quiz_prototype_v2.html
- **レポート提出**: http://localhost:8000/submission/submission.html

### 3.3 動作確認項目

- [ ] 確認テストの提出期間表示
- [ ] クイズの読み込みと問題表示
- [ ] 全問正解で提出画面へ遷移
- [ ] 提出画面でファイルアップロード
- [ ] Google Drive へのファイル保存確認
- [ ] スプレッドシートへの記録確認

---

## 📤 4. GitHub Pages デプロイ

### 4.1 GitHubリポジトリの準備

```bash
cd /Users/tomoharu_suzuki/Library/CloudStorage/Dropbox/report-system

# git 初期化
git init

# 初期コミット
git add .
git commit -m "Initial commit: report-system integration"
```

### 4.2 GitHub でリポジトリを作成

1. https://github.com/new にアクセス
2. **Repository name**: `report-system`
3. **Public** を選択（パブリックリポジトリ）
4. **Create repository** をクリック

### 4.3 リモートを追加してpush

```bash
git remote add origin https://github.com/S-Tomoharu/report-system.git
git branch -M main
git push -u origin main
```

### 4.4 GitHub Pages を有効化

1. GitHub の report-system リポジトリを開く
2. **Settings** → **Pages**
3. **Source** を「Deploy from a branch」に設定
4. **Branch** を「main」、フォルダを「/ (root)」に選択
5. **Save** をクリック

### 4.5 公開URLの確認

数分後、以下URLでアクセス可能になります：
- **確認テスト**: https://s-tomoharu.github.io/report-system/quiz/app/quiz_prototype_v2.html
- **レポート提出**: https://s-tomoharu.github.io/report-system/submission/submission.html

---

## 🔐 セキュリティに関する注意

### .gitignore の確認

以下ファイルは GitHub に公開されません：

```
config.local.js          # GAS URLなどの実値
*.HEIC, test*.pdf        # テスト用ファイル
_redact_test/original/   # 生徒のPDFサンプル
_redact_test/redacted/   # 個人情報を含むファイル
```

### スプレッドシートIDについて

**パブリックリポジトリの場合**、スプレッドシートIDが公開されます。
以下の対策が重要です：

1. スプレッドシート「共有設定」を確認
   - Workspaceアカウントのメンバーのみアクセス可能に設定
   - 公開リンク共有は「OFF」に

2. API呼び出しの認可
   - GAS の実行権限を明確に設定
   - admin.html は「自分のみ」権限で配信

---

## 🐛 トラブルシューティング

### 確認テストが表示されない

1. `config.local.js` が正しく読み込まれているか確認
   - ブラウザコンソールを開く（F12）
   - `CONFIG` オブジェクトが表示されるか確認

2. GAS_URL が正しいか確認
   - 実際のGAS URLをコンソールで確認：`console.log(CONFIG.GAS_URL)`

### Google Drive に保存されない

1. GAS の実行権限を確認
   - GASエディタ → 「デプロイ」 → 「実行」で権限許可画面が出ているか

2. ROOT_FOLDER_ID が正しいか確認
   - Google Drive でフォルダを開く
   - URLから フォルダIDを確認：`https://drive.google.com/drive/folders/{FOLDER_ID}`

### Claude API が動作しない

1. `CLAUDE_API_KEY` がスクリプトプロパティに設定されているか確認
2. Anthropic Console で APIキーが有効か確認
3. GAS エディタでログを確認：
   ```javascript
   // GASエディタから実行
   testClaudeConnection();
   ```
   実行ログを確認してエラーメッセージを確認

---

## 📝 今後のメンテナンス

### 年度更新時

1. `config.local.js` の `SHEET` を更新
   - `'2026年度'` → `'2027年度'`

2. スプレッドシートに新しいシートを作成
   - 前年度のシートをコピーして「2027年度」に名前変更

### プロンプトの調整

読める判定のプロンプトを変更する場合：

1. GAS のスクリプトプロパティで `DEFAULT_PROMPT` を編集
2. またはquiz/gas/claude_ocr.gs の `DEFAULT_PROMPT_VALUE` を変更

---

## 📚 主要ファイル一覧

| ファイル | 用途 |
|--------|------|
| `quiz/app/quiz_prototype_v2.html` | 確認テスト（生徒向け） |
| `quiz/gas/quiz_api.gs` | 問題配信API + admin管理ページ |
| `quiz/gas/admin_gas.gs` | 提出期間管理（教員向けUI） |
| `quiz/gas/admin.html` | 提出期間設定画面 |
| `submission/submission.html` | レポート提出画面 |
| `submission/submission_gas.gs` | Drive保存 + OCR記録 |
| `submission/claude_ocr.gs` | Claude APIマークシート読み取り |
| `config.local.js` | 環境設定（.gitignore除外） |
| `config.template.js` | 設定テンプレート（GitHub公開） |

---

**最後の確認**: `.gitignore` で `config.local.js` が除外されているか確認してください。
```bash
cat .gitignore | grep config.local.js
```
