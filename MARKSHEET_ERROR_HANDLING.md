# マークシート判定エラーハンドリング実装（2026-03-31 実装完了）

## 実装内容

### クライアント側 (submission.html)

#### 1. autoHandleOMR() 関数の拡張
- **複数マークシート検出時**:
  ```javascript
  if (msCount > 1) {
    showStatus('error', 'マークシートは1枚のみを含めてください。複数のマークシートが検出されました。');
    files.forEach(e => e.status = 'error');
    return;
  }
  ```
  - エラーメッセージを表示
  - 全ファイルを `error` ステータスに設定 → 提出ボタン無効化

- **マークシートなし検出時**:
  ```javascript
  if (msIdx < 0) {
    showStatus('error', 'マークシートが見つかりません。マークシート用紙をご使用ください。');
    files.forEach(e => e.status = 'error');
    return;
  }
  ```
  - エラーメッセージを表示（複数時と異なるメッセージ）
  - 全ファイルを `error` ステータスに設定 → 提出ボタン無効化

- **正常時**:
  - エラーステータスをクリア (`error` → `ok`)
  - マークシートを先頭に移動

#### 2. autoHandleOMR() 呼び出しタイミングの拡張
- ✅ ファイル追加時: `addFiles()` → `processImageFile()` 完了後
- ✅ ファイル削除時: 削除ボタン click → `renderImageList()` → `autoHandleOMR()` → `updateSubmitButton()`
- ✅ ドラッグ＆ドロップ時: drop イベント → `renderImageList()` → `autoHandleOMR()` → `updateSubmitButton()`

#### 3. updateSubmitButton() の連動
```javascript
const allReady = files.every(e => e.status === 'ok');
const canSubmit = hasFiles && allReady && countOk && studentOk;
document.getElementById('submitBtn').disabled = !canSubmit;
```
- いずれかのファイルが `error` ステータス → 提出ボタン無効化
- 生徒にエラー内容が表示されたまま提出不可

### サーバー側 (submission_gas.gs)

#### markerPageIndex 早期検証
```javascript
if (markerPageIndex === -1) {
  res.setContent(JSON.stringify({
    ok: false,
    error: 'マークシートが見つかりません。マークシート用紙をご使用ください。'
  }));
  return res;
}
```
- クライアント側の検証をすり抜けた場合の防止線
- **ファイルは Google Drive に保存されない**
- **OCR結果スプレッドシートに記録されない**

---

## エラーメッセージの仕様

| シナリオ | クライアント表示 | サーバー応答 | ファイル保存 | スプレッドシート記録 |
|---------|----------------|-----------|----------|-----------------|
| マークシートなし | ✅ マークシートが見つかりません。マークシート用紙をご使用ください。 | ❌ エラー返却 | ❌ なし | ❌ なし |
| マークシート複数 | ✅ マークシートは1枚のみを含めてください。複数のマークシートが検出されました。 | ※クライアントで提出不可 | - | - |
| 正常（1枚） | - | ✅ OK | ✅ あり | ✅ あり |

---

## ユーザーフロー

### エラー時の流れ
1. 生徒が複数の写真をアップロード
2. autoHandleOMR() がマークシートを検出
3. **エラー検出**
   - 複数検出 → 「複数のマークシット」エラーメッセージ
   - ゼロ検出 → 「マークシートが見つかりません」エラーメッセージ
4. 提出ボタンが無効化（グレーアウト）
5. 生徒が正しい写真に修正してアップロード
6. autoHandleOMR() が再度検証
7. 問題が解決 → ボタンが有効化 → 提出可能

### 正常時の流れ
1. 生徒がマークシートを含む写真をアップロード
2. autoHandleOMR() がマークシートを検出
3. **1枚のみ確認** → マークシートを先頭に移動
4. 提出ボタンが有効化
5. 生徒が提出
6. サーバーで markerPageIndex 検証 → ファイル保存 → OCR処理

---

## クリーンアップ完了

- ✅ debugInfo div を削除（submission.html:499）
- ✅ updateSubmitButton() からデバッグ表示コードを削除（lines 1315-1317）

---

## テスト項目

### ローカルテスト（submission.html）

#### ✓ テスト1: マークシートなし
- **入力**: 上下中央マーカーのない写真 3 枚
- **期待結果**:
  - エラーメッセージ: 「マークシートが見つかりません。マークシート用紙をご使用ください。」
  - 提出ボタン: グレーアウト（disabled）
  - ファイル状態: `error`

#### ✓ テスト2: マークシート複数
- **入力**: 上下中央マーカーがある写真 2 枚 + 通常写真 1 枚
- **期待結果**:
  - エラーメッセージ: 「マークシートは1枚のみを含めてください。複数のマークシートが検出されました。」
  - 提出ボタン: グレーアウト（disabled）
  - ファイル状態: `error`

#### ✓ テスト3: エラー復旧
- **前提**: テスト1 または テスト2 でエラー状態
- **操作**: 問題のある写真を削除 → 正しい写真をアップロード
- **期待結果**:
  - エラーメッセージ: クリア
  - ファイル状態: `ok`
  - 提出ボタン: 有効化（enabled）

#### ✓ テスト4: 正常系
- **入力**: マークシート(上下中央マーカー付) 1 枚 + 通常写真 2 枚
- **期待結果**:
  - エラーメッセージ: なし
  - ファイル順序: マークシートが先頭
  - 提出ボタン: 有効化
  - マーク: ✅ デバッグ情報に「markerPageIndex: 0」と表示

### 本番テスト（Google Drive + 提出 API）

#### ✓ テスト5: 提出時に markerPageIndex = -1（サーバー側検証）
- **操作**: submission.html で無理矢理 markerPageIndex = -1 で提出
  （ブラウザの DevTools で submission 前に markerPageIndex を改変）
- **期待結果**:
  - サーバー応答: `{ ok: false, error: 'マークシートが見つかりません。...' }`
  - Google Drive: ファイルが保存されない
  - OCR結果スプレッドシート: 記録されない

#### ✓ テスト6: 正常系の提出
- **操作**: マークシート 1 枚（先頭）+ 通常写真 を提出
- **期待結果**:
  - サーバー応答: `{ ok: true, saved: [...], ocr: {...} }`
  - Google Drive: `[年度]/第[回]/[クラス]-[番号]_*.jpg` が保存
  - OCR結果スプレッドシート: markerPageIndex = 0 として記録

---

## 次のステップ

- [ ] ローカルテスト (1-4) 実施 → テスト写真で確認
- [ ] debugInfo 表示を削除（本番環境向け）
- [ ] GitHub Pages デプロイ準備
- [ ] 本番テスト (5-6) 実施
