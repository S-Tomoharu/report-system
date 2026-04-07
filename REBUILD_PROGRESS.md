# GAS プロジェクト完全再構築 - 最終版

**最終更新**: 2026-03-30（ゼロリセット）

---

## アーキテクチャ

### スプレッドシート
```
quiz_master（1rhdCPCKd6JrJcm_5rKElKReS9_oiRct7Tj05MhOtBCc）
├─ 2026年度（クイズデータ）
├─ クラス設定
├─ 設定（提出期間）
├─ 認証トークン
└─ APIアクセスログ

submission_master（1_LJxK8MZRe2BIwhOoG1smVeTEj9F7Oz43ayzmwzUQBM）
└─ 提出ファイル管理
```

### GAS プロジェクト

#### 1. quiz_master プロジェクト
```
quiz_master/
├─ admin_gas.gs
│  └─ クラス設定管理（getClassConfigs, saveClassConfig等）
│  └─ config.js 自動生成（generateConfigJs）
│
├─ quiz_api.gs
│  ├─ getSheets() - シート一覧取得
│  ├─ getQuestions(sheet, term, mode) - 問題取得
│  ├─ getActivePeriod(cls) - 提出期間取得
│  ├─ logAlert(round, cls, num) - アラート記録
│  └─ getYearConfig(year) - クラス設定取得
│
└─ admin.html
   └─ クラス設定UI
```

#### 2. submission_gas プロジェクト
```
submission_gas/
├─ submission_gas.gs
│  └─ doPost() - ファイル提出・保存・OCR処理
│
├─ claude_ocr.gs
│  └─ Claude API を使用した OCR（フォールバック）
│
├─ gemini_ocr.gs
│  └─ Gemini API を使用した OCR（メイン）
│
└─ gemini_ocr_test.html
   └─ OCR テスト UI
```

### HTML ファイル（GitHub Pages で配信）
```
/quiz/app/
├─ quiz_prototype_v2.html - クイズ UI
│  └─ GAS_URL: quiz_master の実行URL
│
/submission/
├─ submission.html - レポート提出UI
│  └─ SUBMISSION_GAS_URL: submission_gas の実行URL
│
/config.js - 設定ファイル（自動生成）
└─ /admin/admin.html - 管理画面
```

---

## デプロイ設定

### quiz_master デプロイ
```
実行者: 自分
アクセス: 誰でも
タイプ: ウェブアプリ
説明: クイズ・期間管理 API
```

**デプロイ ID**: [記入]
**実行URL**: https://script.google.com/macros/s/[ID]/exec

### submission_gas デプロイ
```
実行者: 自分
アクセス: 誰でも
タイプ: ウェブアプリ
説明: レポート提出・OCR処理
```

**デプロイ ID**: [記入]
**実行URL**: https://script.google.com/macros/s/[ID]/exec

---

## スクリプトプロパティ

### quiz_master
```
SPREADSHEET_ID: 1rhdCPCKd6JrJcm_5rKElKReS9_oiRct7Tj05MhOtBCc
```

### submission_gas
```
SPREADSHEET_ID: 1_LJxK8MZRe2BIwhOoG1smVeTEj9F7Oz43ayzmwzUQBM
ROOT_FOLDER_ID: 1tJqQc6crBZD1wqCdClAm8gSoGP6B6R5l
CLAUDE_API_KEY: [実際のキー]
OCR_ENABLED: true
AI_PROVIDER: claude
```

---

## API仕様

### quiz_master API

#### 1. getSheets
```
GET ?action=getSheets
Response: { sheets: ["2026年度", "2027年度", ...] }
```

#### 2. getQuestions
```
GET ?action=getQuestions&sheet=2026年度&term=1学期中間考査&mode=quiz
Response: { questions: [{q, a, b, c, d, ans, type, term, round, memo}, ...] }
```

#### 3. getActivePeriod
```
GET ?action=getActivePeriod&class=2A
Response: { active: {round, start, end, memo, pageCount}, next: {...} }
```

#### 4. logAlert
```
GET ?action=logAlert&round=1&class=2A&num=1
Response: { ok: true }
```

#### 5. getYearConfig
```
GET ?action=getYearConfig&year=2026
Response: { classes: [{class: "2A", max: 40}, ...] }
```

### submission_gas API

#### doPost
```
POST { year, round, studentClass, number, date, files: [{base64, mimeType, page}, ...] }
Response: { ok: true, saved: [{name, id}, ...], ocr: {status, ...} }
```

---

## 動作確認チェックリスト

### Phase 1: GAS デプロイ
- [ ] quiz_master デプロイ完了 → デプロイ ID を記録
- [ ] submission_gas デプロイ完了 → デプロイ ID を記録
- [ ] スクリプトプロパティ設定完了

### Phase 2: API 動作確認（curl または ブラウザ）
```bash
# quiz_master テスト
curl "https://script.google.com/macros/s/[ID]/exec?action=getSheets"
curl "https://script.google.com/macros/s/[ID]/exec?action=getActivePeriod&class=2A"
curl "https://script.google.com/macros/s/[ID]/exec?action=getQuestions&sheet=2026年度&mode=quiz"

# submission_gas テスト
curl "https://script.google.com/macros/s/[ID]/exec?action=getPeriodInfo&round=1"
```

- [ ] 全て HTTP 200 + JSON が返される

### Phase 3: ローカルテスト
```bash
python3 -m http.server 8000
# http://localhost:8000/quiz/app/quiz_prototype_v2.html
```

- [ ] クラス・番号を選択 → クイズ表示
- [ ] 3問全問正解 → 「レポート提出」ボタン表示
- [ ] 「レポート提出」をクリック → submission.html に遷移
- [ ] ファイル選択 → 提出完了

### Phase 4: admin.html テスト
```bash
# http://localhost:8000/quiz/gas/admin.html
```

- [ ] クラス追加・編集・削除が可能
- [ ] config.js が生成される

---

## トラブルシューティング

| 症状 | 原因 | 解決 |
|------|------|------|
| 302 リダイレクト | GAS セッション確認（正常） | ブラウザで直接実行時は常に 302 |
| "シートが見つかりません" | SPREADSHEET_ID が間違っている | スクリプトプロパティを確認 |
| config.js が生成されない | admin_gas.gs の generateConfigJs() が実行されていない | admin.html からクラス追加時に呼び出される |
| レポート提出失敗 | OCR エラーまたは期間外 | ログをスプレッドシートで確認 |

---

## 重要な原則

1. **スクリプトプロパティは必須** - デプロイ後に設定を忘れずに
2. **デプロイは 1 プロジェクト = 1 デプロイ** - 複数デプロイは混乱の元
3. **API は認証なし** - セキュリティが必要な場合は後で実装
4. **ローカルテストは必須** - デプロイ前に必ず curl でテスト
5. **エラー時はスプレッドシートのログを確認** - GAS エディタのログより信頼性が高い

---

## ファイル構成

```
report-system/
├─ config.js（自動生成）
│
├─ quiz/
│  ├─ app/
│  │  └─ quiz_prototype_v2.html
│  └─ gas/
│     ├─ admin.html
│     ├─ admin_gas.gs
│     └─ quiz_api.gs
│
├─ submission/
│  ├─ submission.html
│  └─ submission_gas.gs（別プロジェクト）
│     ├─ claude_ocr.gs
│     └─ gemini_ocr.gs
│
└─ REBUILD_PROGRESS.md（この文書）
```

---

## 実装履歴

- 2026-03-28: 初版（Phase 1-4）
- 2026-03-30: 完全版（全 API 仕様追加、トラブルシューティング追加）
