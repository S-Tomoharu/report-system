/**
 * report-system 設定ファイル（テンプレート）
 *
 * このファイルをコピーして `config.local.js` を作成し、実際の値を記入してください。
 * `config.local.js` は .gitignore で除外されているため、安全にシークレットを含められます。
 *
 * 【設定値の入手方法】
 * 1. GAS_URL, SUBMISSION_GAS_URL
 *    → GoogleAppsScript デプロイ時のURL
 * 2. GITHUB_PAGES_URL
 *    → GitHub Pages の公開URL（https://S-Tomoharu.github.io/report-system）
 */

const CONFIG = {
  // ========== クイズAPI ==========
  // 問題取得・提出期間確認用のGAS APIのURL
  GAS_URL: 'https://script.google.com/macros/s/YOUR_QUIZ_API_GAS_URL/exec',

  // ========== 提出API ==========
  // Google Drive へのファイル保存・OCR判定用のGAS URLはsubmission.html内で定義してください
  SUBMISSION_GAS_URL: 'https://script.google.com/macros/s/YOUR_SUBMISSION_GAS_URL/exec',

  // ========== GitHub Pages ==========
  // このシステムを配信するGitHub PagesのベースURL
  GITHUB_PAGES_URL: 'https://S-Tomoharu.github.io/report-system',

  // ========== スプレッドシート設定 ==========
  SHEET: '2026年度',           // 対象シート名（年度ごとに変更）
  TERM: null,                   // 対象考査区分（nullなら全件）
  QUIZ_COUNT: 3,                // 出題数

  // ========== レイアウト ==========
  FAIL_NOTIFY_THRESHOLD: 3,     // 失敗何回以上で教員に通知するか
};

/**
 * 使用方法:
 * 1. このファイルを `config.local.js` にコピー
 * 2. 実際のGAS URLなどを記入
 * 3. config.local.js が .gitignore で除外されることを確認
 * 4. HTMLファイルでは <script src="config.local.js"></script> で読み込み
 */
