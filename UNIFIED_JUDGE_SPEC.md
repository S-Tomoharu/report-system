# 統合評価アプリ実装仕様書

**作成日**: 2026-03-31
**目的**: マークシート読み取り＋読可否判定を1回のAPI呼び出しで実現する

---

## 概要

生徒提出PDFに対して、以下の2つを別々に行う処理を、1回の Claude/Gemini API 呼び出しで完結させる：
- **マークシート読み取り**（クラス・出席番号）
- **読可否判定**（c1-c4基準、readable判定）

---

## 実装方針

✅ **本体プロジェクト（submission フォルダ）に新しい関数を追加するだけ**
- 既存関数は一切変更しない
- バックアップを取ってから実装
- `unified_evaluator.html` でテスト検証
- テスト OK → そのまま本体で使用可能
- テスト NG → バックアップから復元して修正

---

## ファイル追加・編集一覧

| ファイル | 変更内容 | 状態 |
|---------|---------|------|
| `submission/claude_ocr.gs` | `runUnifiedJudgeClaude()` 関数を末尾に追加（個別実装） | ✅ 完了 |
| `submission/gemini_ocr.gs` | `runUnifiedJudgeGemini()` + `runUnifiedJudge()` ラッパーを末尾に追加 | ✅ 完了 |
| `submission/unified_evaluator.html` | テスト用UI（Claude/Gemini切り替え機能付き）を新規作成 | ✅ 完了 |

---

## 関数呼び出しフロー

```
unified_evaluator.html（UI）
  ↓
  google.script.run.runUnifiedJudge(base64, mimeType, prompt, inputClass, inputNumber, provider)
  ↓
  gemini_ocr.gs: runUnifiedJudge() ← ラッパー関数
  ├─ provider === 'claude' → runUnifiedJudgeClaude()（claude_ocr.gs）
  └─ provider === 'gemini' → runUnifiedJudgeGemini()（gemini_ocr.gs）
  ↓
  結果を JSON で返却
```

---

## 関数仕様

### `runUnifiedJudgeClaude(base64, mimeType, prompt, inputClass, inputNumber)`

**概要**: Claude APIで統合評価を実行

**引数**:
- `base64`: PDFのBase64文字列（データURL のヘッダー除去後）
- `mimeType`: `'application/pdf'`
- `prompt`: 統合プロンプト（テンプレートまたはカスタム）
- `inputClass`: ユーザー入力のクラス（`'E'` / `'J'` 、空でも可）
- `inputNumber`: ユーザー入力の出席番号（数値、0でも可）

**戻り値**:

**正常系（読み取り成功）**:
```json
{
  "ok": true,
  "marksheet": {
    "class": "E",
    "tens": 2,
    "ones": 8
  },
  "readable": {
    "c1": "yes",
    "c2": "yes",
    "c3": "no",
    "c4": "yes",
    "readable": "no",
    "reason": "判定理由を一文で"
  },
  "validation": {
    "inputClass": "E",
    "inputNumber": 28,
    "readClass": "E",
    "readNumber": 28,
    "classMatch": true,
    "numberMatch": true,
    "allMatch": true
  },
  "raw": "AI の生レスポンステキスト"
}
```

**読み取り失敗時**:
```json
{
  "ok": true,
  "marksheet": {
    "class": null,
    "tens": null,
    "ones": null
  },
  "readable": {
    "c1": "no",
    "c2": "no",
    "c3": "no",
    "c4": "no",
    "readable": "no",
    "reason": "マークシートが読み取れません"
  },
  "validation": {
    "inputClass": "E",
    "inputNumber": 28,
    "readClass": null,
    "readNumber": null,
    "classMatch": null,
    "numberMatch": null,
    "allMatch": null
  },
  "raw": "AI の生レスポンステキスト"
}
```

**API エラー時**:
```json
{
  "ok": false,
  "error": "エラーメッセージ"
}
```

**注記**:
- AI が マークシート読み取り に失敗した場合、`class`, `tens`, `ones` は `null` を返す
- この場合、`readable` は自動的に「no」になる（読取失敗したので採点不可）
- `validation.allMatch` は `null` になる（読取値がないため比較不可）

---

### `runUnifiedJudgeGemini(base64, mimeType, prompt, inputClass, inputNumber)`

**概要**: Gemini APIで統合評価を実行
**引数**: `runUnifiedJudgeClaude` と同じ
**戻り値**: `runUnifiedJudgeClaude` と同じ

---

### `runUnifiedJudge(base64, mimeType, prompt, inputClass, inputNumber, provider)`

**概要**: プロバイダー統合ラッパー（Claude/Gemini を動的切り替え）

**引数**:
- 上記全て + `provider`: `'claude'` または `'gemini'`
- `provider` 未指定時: スクリプトプロパティの `AI_PROVIDER` を参照（デフォルト: `'claude'`）

**処理フロー**:
1. `provider` を確認
2. `'gemini'` → `runUnifiedJudgeGemini()` を呼び出し
3. `'claude'` → `runUnifiedJudgeClaude()` を呼び出し
4. 結果を返却

---

## 統合プロンプト（テンプレート）

```
以下は生徒が提出した手書きレポートのPDFです。
2つの判定を同時に行ってください。

【判定1: マークシート読み取り】
添付画像の左上に「クラス」を含むマークシートがあります。
クラスの行で黒く塗りつぶされている列はEとJのどちらですか。

添付画像の右上に「十の位」と「一の位」を含むマークシートがあります。
「十の位」と「一の位」のマークシートの上には「0 1 2 3 4 5 6 7 8 9」という数字ラベルが印刷されています。
十の位の行(0〜9の10列)で黒く塗りつぶされたバブルの真上に書かれているラベルの数字を読んでください。
一の位の行(0〜9の10列)で黒く塗りつぶされたバブルの真上に書かれているラベルの数字を読んでください。

【判定2: 採点可否判定】
このページが採点可能かどうかを以下4基準で判定してください。
- c1: ページ上の全設問のうち5割以上に取り組んでいる
  ・必ず全設問を数えてから判断する
  ・選択・穴埋め問題は記号・語句の記入で「取り組み」とみなす
  ・説明・計算問題は手書き記入があれば可（数式・記号のみで日本語説明がない場合は不可）
  ・(5)のa/b/cのような同一問のサブ項目はまとめて1問とカウント
  ・印刷された選択肢テキスト・罫線・枠はカウントしない
- c2: 手書き文字の線が全体を通じて背景と明確に区別できる濃さで書かれている
  （全体的に薄い・細い場合はno。部分的に薄くても多くの箇所で追えれば可）
- c3: 個々の文字が文字として追える（読める文字が全体の80%以上ならyes）
- c4: 撮影品質が十分（ピンぼけ・暗すぎで文字が潰れていない）

1つでも満たさない場合、または判断に迷う場合は no とする。
判定対象外・判定不能という回答は禁止。必ず yes か no で答えること。

次の JSON 形式のみで回答してください。説明文は不要。
readable は c1〜c4 がすべて yes の場合のみ yes。
マークシート読み取りに失敗した場合は class/tens/ones を null としてください。
{"class":"E","tens":2,"ones":3,"c1":"yes","c2":"yes","c3":"yes","c4":"yes","readable":"yes","reason":"判定理由を一文で"}
```

---

## テスト流れ

### フェーズA：テストUI動作確認 ⬅️ **現在ここ（進行中・方向転換検討中）**

1. ✅ submission フォルダ内のファイル追加を確認
2. ✅ バックアップを取る（submission_backup_2026_03_31）
3. ✅ GAS プロジェクト「統合評価検証アプリ」をデプロイ
   - URL: https://script.google.com/a/macros/tokai-jh.ed.jp/s/AKfycbzdY5ulhpMpjM1aNVgSz_4WE1XkqH37c1pBIlG3qsTTAgI8TnHLZqVe8Bkb-uARSzkPFg/exec
4. ✅ unified_evaluator.html をウェブアプリとして公開（doGet() を追加）
5. ✅ UI が起動確認
6. ✅ Claude のモデルを Sonnet → Haiku に変更（claude-haiku-4-5-20251001）
7. ⚠️ Claude で試験 PDF をテスト → **マークシート読み込みがうまくいかない状況**
8. ✅ gemini_ocr_test.html を統合評価検証アプリに追加
   - doGet() で page パラメータで使い分け
9. ⏳ **方向転換を検討中（詳細は進捗メモを参照）**

### フェーズB：本体統合の設計

8. ⏳ submission.html の提出フロー・現在の実装を理解
9. ⏳ submission_gas.gs の提出時処理を理解
10. ⏳ readable=no の時の処理（生徒への通知方法など）を決定
11. ⏳ 整合性不一致時の処理を決定

### フェーズC：本体実装・テスト

12. ⏳ submission.html の提出ボタンに runUnifiedJudge() 呼び出し処理を追加
13. ⏳ readable=no の場合は提出ブロック＆理由表示
14. ⏳ 整合性チェック結果の処理を実装
15. ⏳ 本体プロジェクトで試験 PDF で提出テスト
16. ⏳ 問題なければ本体デプロイ完了

---

## バックアップ

実装前に以下を実行：
```bash
cp -r submission submission_backup_2026_03_31
```

問題が発生した場合は復元可能な状態を維持。

---

## API キー設定

GAS スクリプトプロパティに以下を設定：
- `CLAUDE_API_KEY`: Claude API キー
- `GEMINI_API_KEY`: Gemini API キー
- `AI_PROVIDER`: デフォルトプロバイダー（`'claude'` または `'gemini'`）

---

## 今後の統合

テスト OK 後：
1. submission.html の提出フロー に runUnifiedJudge() を統合
2. readable=no → 提出ブロック＆理由を生徒に表示
3. 整合性不一致 → 別途対応を検討
4. submission_gas.gs での処理を更新
5. 本体プロジェクト全体をデプロイ

---

## 進捗ログ

### 2026-03-31（初日）
- ✅ ファイル追加・編集完了
- ✅ プロンプト修正完了（マークシート読み取り部分を詳細化）
- ✅ GAS プロジェクト作成・デプロイ完了
- ✅ unified_evaluator.html UI 起動確認

### 2026-04-01（二日目）
- ✅ Claude モデルを Sonnet → Haiku に変更
- ⚠️ Claude (Haiku) でマークシート読み込みテスト → **失敗**
- ✅ gemini_ocr_test.html を統合評価検証アプリに追加
- ✅ doGet() を修正（page パラメータで使い分け）
- ⏳ **方向転換を検討中**

**関連メモ**: `unified_judge_current_status.md` を参照

---

**このファイルを更新しながら進めてください。**
