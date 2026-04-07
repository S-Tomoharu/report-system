# report-system

物理の授業におけるレポート提出・管理システム。
生徒（約90名）が手書きレポートを写真で提出し、教員が採点・返却するまでの一連のフローをWebアプリで管理する。

---

## システム全体フロー

```
【教員：授業ごと】
① NotebookLM/GeminiでクイズをTSV形式で生成
② quiz_converter.htmlで整形・プレビュー確認
③ Googleスプレッドシート（quiz_master）に貼り付け
④ 考査区分・回を記入、出題除外フラグを設定

【教員：提出管理】
⑤ admin.html（GAS Webアプリ）で提出期間を設定
   - 年度・考査区分・実施日時・期限を入力
   - 複数回の並行管理対応

【生徒：レポート提出時】
⑥ 提出画面を開く
   → 受付中の回が表示される（getActivePeriod で取得）
⑦ 提出前確認テスト（3問・全問正解で通過）
⑧ レポート画像をアップロード
   - カメラ撮影 or ファイル選択
   - 複数枚対応（回によって1〜3枚）
   - プレビュー確認
⑨ Google Driveに保存（GAS経由）
   └── 第◯回/クラス-番号_第◯回_日付.jpg

【自動判定】
⑩ Claude APIに画像送信
   - マークシート読み取り（クラス・番号）
   - 読める／読めない判定（複数基準を検証中）
⑪ 結果をスプレッドシートに記録

【教員：採点・返却】
⑫ Google DriveからGoodNotesに取り込み
⑬ Apple Pencilで採点・コメント記入
⑭ 返却システム（未実装）

【後回し】
・自習モード
```

---

## フォルダ構成

```
report-system/
├── quiz/
│   ├── app/
│   │   └── quiz_prototype_v2.html  # 確認テスト（生徒向けWebアプリ）
│   ├── gas/
│   │   ├── quiz_api.gs             # GASスクリプト（シート→JSON配信 + getActivePeriod）
│   │   ├── admin_gas.gs            # 提出期間管理GAS
│   │   └── admin.html              # 提出期間設定UI（教員用・GASで配信）
│   └── tools/
│       └── quiz_converter.html     # Gemini出力→スプレッドシート変換ツール（教員用）
├── submission/
│   ├── submission.html             # レポート提出画面（複数枚対応・実装済み）
│   ├── submission_gas.gs           # Drive保存用GAS（年度/回フォルダ自動作成）
│   └── claude_ocr.gs               # Claude APIで画像解析（読み取り・判定）
├── _redact_test/                   # 実験用：読める判定基準の検証（本体とは別管理）
│   ├── original/                   # 元PDF
│   ├── redacted/
│   │   └── サンプル/               # Claudeに読み込ませるサンプルページ
│   ├── redact.py                   # 名前フィールド黒塗りスクリプト
│   ├── judge_politeness.py         # 複数バージョン（v1-v15）での判定評価
│   ├── prompt.txt                  # Claude用プロンプト（判定ロジック）
│   └── results.csv                 # 判定テスト結果
└── README.md
```

---

## 技術スタック

- **フロントエンド**: HTML/CSS/JavaScript（GitHub Pages で配信）
- **数式レンダリング**: MathJax 3.2.2（$...$形式）
- **問題管理**: Googleスプレッドシート + GAS
- **ファイル保存**: Google Drive（教員の学校Workspaceアカウント）
- **画像解析**: Claude API（マークシート読み取り・読める判定）
- **提出期間管理**: GAS（プロパティサービスで複数回の並行管理対応）

---

## Googleスプレッドシート（quiz_master）

**スプレッドシートID**: `1_LJxK8MZRe2BIwhOoG1smVeTEj9F7Oz43ayzmwzUQBM`

### シート構成
- 年度ごとにシートを作成（例：「2026年度」）
- 年度内の分類は「考査区分」列で管理
- 使い回す場合はシートを手動コピー

### 列構成
| 列 | 内容 | 備考 |
|----|------|------|
| 問題文 | LaTeX記法込みのテキスト（$...$） | |
| A〜D | 選択肢 | 記述式は空 |
| 正解 | 4択はA/B/C/D、記述は文字列 | |
| 形式 | `4択` or `記述` | |
| 考査区分 | 1学期中間考査／1学期期末考査／2学期中間考査／2学期期末考査／学年考査 | |
| 回 | 第何回か（数字） | |
| 出題除外 | チェックボックス（TRUE=除外） | 授業進度による一時除外 |
| アーカイブ除外 | チェックボックス（TRUE=除外） | 自習モードに出さない問題 |
| メモ | 自由記述 | |

---

## GAS API

**URL**: `https://script.google.com/macros/s/AKfycbzeUD2g1tgdA6osACYUuccpuPxDDs5wzgvNlkBfZCExfqGnGfv1ZWVQyVY6s-eX0Ohg/exec`

**実装**: quiz_api.gs + admin_gas.gs

### エンドポイント

```
# シート一覧（年度リスト）
?action=getSheets

# 現在受付中の期間情報を取得
?action=getActivePeriod
→ {periods: [{year, term, round, startTime, deadline, status}, ...]}

# 問題取得（クイズモード：出題除外を除く）
?action=getQuestions&sheet=2026年度&term=1学期中間考査&mode=quiz

# 問題取得（アーカイブモード：出題除外＋アーカイブ除外を除く）
?action=getQuestions&sheet=2026年度&term=1学期中間考査&mode=archive

# term省略で全件取得
?action=getQuestions&sheet=2026年度&mode=quiz
```

### getActivePeriod の用途
- 提出画面起動時、受付中の回を自動判定（スプレッドシートのプロパティから取得）
- 複数回の並行受付に対応
- リアルタイムで提出可否を判定

---

## quiz_converter.html（変換ツール）

教員がGemini/NotebookLMで生成したクイズをスプレッドシートに取り込むための補助ツール。

### 対応フォーマット
- **入力**: タブ区切り＋空白行区切り（Gemini/NotebookLMからの出力）
- **自動処理**:
  - 選択肢ラベル（A:, A), A.）を自動除去
  - LaTeXコマンド（\frac, \lambda等）を自動で$...$で囲む
  - テキストプレビュー表示でスプレッドシート貼り付け前に確認可能
- **手動調整**: 1文字変数（d, L, m等）は手動で$...$を追加する運用

### Geminiへの推奨プロンプト指示
```
・数式は$で囲む（例：$\frac{L\lambda}{d}$）
・正解は必ずA/B/C/Dのアルファベット1文字のみ
・各問題の間に必ず改行を入れる
・タブ区切りで：問題文[TAB]A[TAB]B[TAB]C[TAB]D[TAB]正解
```

### 使用方法
1. Gemini出力をコピー
2. quiz_converter.htmlに貼り付け
3. プレビュー確認
4. スプレッドシートに貼り付け
5. 考査区分・回を記入・除外フラグ設定

---

## submission.html（レポート提出画面）

生徒がレポート画像をアップロード・提出する画面。

### 機能
- **提出期間チェック**: getActivePeriod で現在受け付けている回を判定
- **受付中の回リスト**: 複数回並行受付に対応
- **画像アップロード**:
  - カメラ撮影またはファイル選択
  - 複数ファイル対応（回によって1〜3枚）
  - プレビュー表示
- **Google Drive保存**: submission_gas.gs 経由で自動保存
  - フォルダ構造: `第◯回/クラス-番号_第◯回_日付.jpg`
- **Claude API連携**: claude_ocr.gs で自動判定（読取・品質評価）

### 設定箇所（ファイル先頭）
```javascript
const GAS_URL = '...';              // quiz_api.gs の URL
const SUBMISSION_GAS_URL = '...';   // submission_gas.gs の URL
const CLAUDE_OCR_GAS_URL = '...';   // claude_ocr.gs の URL
```

---

## quiz_prototype_v2.html（確認テスト）

生徒がレポート提出前に受ける確認テスト（GAS Webアプリ配信）。

### 機能
- **提出期間チェック**: getActivePeriod で受付中の回を判定（期間外は表示しない）
- **GASから問題を取得**: スプレッドシート連携済み
- **クラス・出席番号入力**: 暫定（年度ごとに更新）
- **3問ランダム出題**: 問題プールからシャッフル
- **4択・記述式の混在対応**: 形式列で自動判定
- **全問正解で提出画面へ進む**: 合格後に提出画面URLへ遷移
- **失敗3回以上で教員に通知表示**: ユーザー体験向上
- **MathJax対応**: $...$形式で数式レンダリング

### 設定箇所（ファイル先頭）
```javascript
const GAS_URL = '...';        // GAS APIのURL
const SHEET = '2026年度';     // 対象シート名（年度ごとに変更）
const TERM  = null;            // 対象考査区分（nullなら全件）
const QUIZ_COUNT = 3;          // 出題数
const SUBMISSION_URL = '...'; // 提出画面のURL
```

---

## Claude API セットアップ

### APIキーの取得

1. [Anthropic Console](https://console.anthropic.com/account/keys) にアクセス
2. 「Create Key」でAPIキーを作成・コピー

### スクリプトプロパティへの登録

GASのコードにAPIキーを直接書かない。必ずスクリプトプロパティに保存する。

1. GASエディタを開く（`claude_ocr.gs` が含まれるプロジェクト）
2. 左メニュー「プロジェクトの設定」（歯車アイコン）をクリック
3. 「スクリプトプロパティ」セクションで「スクリプトプロパティを追加」
4. プロパティ名: `CLAUDE_API_KEY`、値: コピーしたAPIキーを入力
5. 「スクリプトプロパティを保存」

### コードからの参照

```javascript
const apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
```

### 現在の実装
- **モデル**: claude-3-5-sonnet（画像解析・読み取り判定用）
- **処理内容**:
  1. マークシート読み取り（クラス・番号を抽出）
  2. 読める／読めない判定（複数基準v1-v15を検証中）

---

## 実装状況

### ✅ 統合完了・本番デプロイ準備済み
- [x] セキュリティ対応
  - `.gitignore` で機密情報を除外
  - `config.local.js` / `config.template.js` で設定分離
  - GAS スクリプトプロパティで ID 管理
  - Claude API キーは安全に保存
- [x] 確認テスト（quiz_prototype_v2.html）
  - GASから問題取得・3問ランダム出題・全問正解で通過
  - `getActivePeriod` で期間チェック
- [x] quiz_converter.html（教員用変換ツール）
  - Gemini出力→スプレッドシート整形
- [x] 提出期間管理（admin.html + admin_gas.gs）
  - 教員がWeb UIで複数回の期間設定・管理
  - リアルタイムで受付状況を切り替え
- [x] レポート提出画面（submission.html）
  - 複数枚対応・Google Driveへの自動保存
  - GAS（submission_gas.gs）で年度/回フォルダ自動作成
- [x] Claude APIでの自動判定（claude_ocr.gs）
  - マークシート読み取り（クラス・番号抽出）
  - OCRスキップルート実装（AI_ENABLED フラグで制御）
  - 失敗時は「未判定」として自動記録

### 🚀 GitHub Pages 公開準備完了
- GitHub リポジトリ作成待ち（[SETUP.md](SETUP.md) 参照）
- ローカルテスト確認後、公開予定

### ⏳ 優先度中
- [ ] 四隅■マーカー検出・透視変換補正（JavaScript/canvas）
- [ ] 教員ダッシュボード（提出一覧確認・採点状況）
- [ ] 返却システム

### 🔮 後回し
- [ ] 自習モード（アーカイブ問題で練習）

---

## レポートのフォーマット

- TeXで作成・印刷
- 四隅に■マーカー（透視変換の基準点）
- 1ページ目上部にマークシート（クラス・番号）
- マークシート構成：
  - クラス行：E / J /（もう1クラス）※年度により変更
  - 十の位：0〜9
  - 一の位：0〜9
- ページ数：回によって1〜3枚（可変）
- 提出方法：スマホで撮影 or スキャン

---

## 生徒識別

- クラス番号入力（暫定）
- 年度ごとに更新する運用
- 将来的にはマークシート読み取りで自動入力予定

---

## デプロイ・運用上の注意事項

### Googleスプレッドシート・Drive
- スプレッドシートは学校Google Workspaceアカウントで管理
- Google DriveへのGASアクセス権限の確認が必要
- 年度ごとにシートを作成（手動またはコピー機能で管理）

### GASデプロイ
- **quiz_api.gs**: 全員向けWebアプリ（実行権限: 共有アクセス）
- **admin_gas.gs**: 教員向けWebアプリ（実行権限: 自分のみ）
- **submission_gas.gs**: Drive保存用（submission.htmlから呼び出し）
- **claude_ocr.gs**: Claude API呼び出し用（claude_ocr.gs単独でも実行可）

### GitHub Pages配信
- 全Webアプリは静的HTMLとして配信
- JavaScriptはブラウザで完結（サーバー処理なし）
- GAS URLはコード内に埋め込み（環境に応じて変更）

### Claude API
- CLAUDE_API_KEY はGASのスクリプトプロパティに登録（コードに直書きしない）
- 画像ファイルはBase64エンコードして送信
- 読める判定基準は複数版テスト中（実装側で選択必要）
