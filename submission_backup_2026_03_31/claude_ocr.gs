// =============================================
// Claude API によるマークシート読み取り
// スクリプトプロパティ: CLAUDE_API_KEY
// =============================================

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL   = 'claude-3-5-sonnet-20241022';

// デフォルトプロンプト
// スクリプトプロパティで 'DEFAULT_PROMPT' を設定すると、そちらが使用されます
const DEFAULT_PROMPT_VALUE = `第一ページの左上にあるマークシートを読み取ってください。

マークシートの構成：
- 1行目：クラス（E または J）
- 2行目：十の位（0-9）
- 3行目：一の位（0-9）

次のJSON形式で結果を返してください：
{"class":"E","tens":2,"ones":3}

クラスは "E" または "J" のみです。
十の位と一の位は必ず 0-9 の整数です。`;

// DEFAULT_PROMPT は関数内で定義するか、gemini_ocr.gs で定義される

// =============================================
// ① 疎通テスト（URLフェッチのみ）
// GASエディタから直接実行して動作確認する
// =============================================
function testClaudeConnection() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) {
    Logger.log('ERROR: CLAUDE_API_KEY がスクリプトプロパティに未設定です');
    return;
  }

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: 64,
    messages: [{
      role: 'user',
      content: 'こんにちは。「OK」とだけ返してください。'
    }]
  };

  const response = UrlFetchApp.fetch(CLAUDE_API_URL, {
    method: 'post',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body   = JSON.parse(response.getContentText());

  Logger.log('HTTP status: ' + status);
  Logger.log(JSON.stringify(body, null, 2));

  if (status === 200) {
    Logger.log('Claude の返答: ' + (body.content?.[0]?.text || '(empty)'));
  } else {
    Logger.log('ERROR: ' + (body.error?.message || response.getContentText()));
  }
}

// =============================================
// ② マークシート読み取り（Claude版）
// 引数:
//   fileBase64 ... Base64文字列（データURLのヘッダー不要）
//   mimeType   ... 'application/pdf' or 'image/jpeg' など
// 戻り値:
//   { class: 'E', tens: 2, ones: 8 }
//   { error: '...' }
// =============================================
function readMarksheetClaude(fileBase64, mimeType) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) return { error: 'CLAUDE_API_KEY が未設定です' };

  // PDFはdocument型、画像はimage型
  const filePart = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: fileBase64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType, data: fileBase64 } };

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: 256,
    temperature: 0,
    messages: [{
      role: 'user',
      content: [
        filePart,
        { type: 'text', text: DEFAULT_PROMPT_VALUE }
      ]
    }]
  };

  const response = UrlFetchApp.fetch(CLAUDE_API_URL, {
    method: 'post',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status !== 200) {
    const err = JSON.parse(response.getContentText());
    return { error: 'API error ' + status + ': ' + (err.error?.message || response.getContentText()) };
  }

  const body = JSON.parse(response.getContentText());
  const text = body.content?.[0]?.text || '';

  try {
    const jsonStr = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    const result  = JSON.parse(jsonStr);
    if (!['E', 'J'].includes(result.class)) return { error: '不正なクラス値: ' + result.class };
    if (typeof result.tens !== 'number' || result.tens < 0 || result.tens > 9) {
      return { error: '不正な十の位: ' + result.tens };
    }
    if (typeof result.ones !== 'number' || result.ones < 0 || result.ones > 9) {
      return { error: '不正な一の位: ' + result.ones };
    }
    return result;
  } catch (e) {
    return { error: 'JSONパース失敗', raw: text };
  }
}

// =============================================
// ③ テスト用：DriveのファイルIDを使って動作確認
// GASエディタから直接実行してログを確認する
// =============================================
function testClaudeFromDrive() {
  const FILE_ID = 'ここにDriveのファイルID'; // 手動で変更して実行

  const file     = DriveApp.getFileById(FILE_ID);
  const mimeType = file.getMimeType();
  const base64   = Utilities.base64Encode(file.getBlob().getBytes());

  Logger.log('ファイル名: ' + file.getName());
  Logger.log('MIMEタイプ: ' + mimeType);
  Logger.log('使用モデル: ' + CLAUDE_MODEL);

  const result = readMarksheetClaude(base64, mimeType);
  Logger.log('読み取り結果: ' + JSON.stringify(result));
}

// =============================================
// テストUI用（gemini_ocr.gs の runMarksheetTest から呼ばれる）
// =============================================
function runMarksheetTestClaude(fileBase64, mimeType, customPrompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) return { error: 'CLAUDE_API_KEY が未設定です' };

  const prompt  = customPrompt || DEFAULT_PROMPT;
  const filePart = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: fileBase64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType, data: fileBase64 } };

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: 256,
    temperature: 0,
    messages: [{
      role: 'user',
      content: [filePart, { type: 'text', text: prompt }]
    }]
  };

  const response = UrlFetchApp.fetch(CLAUDE_API_URL, {
    method: 'post',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body   = JSON.parse(response.getContentText());
  const raw    = body.content?.[0]?.text || '';

  let parsed = null;
  try {
    const jsonStr = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch (e) {}

  return { status, raw, parsed, provider: 'claude' };
}

// =============================================
// ④ プロバイダー切り替え付き読み取り
// スクリプトプロパティ AI_PROVIDER で切り替え
//   'gemini' → Gemini 2.5 Flash（デフォルト）
//   'claude' → Claude Haiku 4.5
// =============================================
function readMarksheetWithProvider(fileBase64, mimeType) {
  const props = PropertiesService.getScriptProperties();
  const ocrEnabled = props.getProperty('OCR_ENABLED') !== 'false';
  const provider = props.getProperty('AI_PROVIDER') || 'claude';

  Logger.log('OCR_ENABLED: ' + ocrEnabled);
  Logger.log('AI_PROVIDER: ' + provider);

  // OCR_ENABLED=false の場合は「未判定」として返す
  if (!ocrEnabled) {
    return { error: 'OCR_ENABLED=false のためスキップ', status: 'skipped' };
  }

  if (provider === 'claude') {
    return readMarksheetClaude(fileBase64, mimeType);
  }
  // provider === 'gemini' の場合
  if (typeof readMarksheet === 'function') {
    return readMarksheet(fileBase64, mimeType);
  }
  return { error: 'OCR プロバイダーが見つかりません', status: 'error' };
}

// =============================================
// ⑤ テスト用：プロバイダー切り替えつきでDriveファイルを読む
// =============================================
function testWithProviderFromDrive() {
  const FILE_ID = 'ここにDriveのファイルID'; // 手動で変更して実行

  const file     = DriveApp.getFileById(FILE_ID);
  const mimeType = file.getMimeType();
  const base64   = Utilities.base64Encode(file.getBlob().getBytes());

  Logger.log('ファイル名: ' + file.getName());
  const result = readMarksheetWithProvider(base64, mimeType);
  Logger.log('読み取り結果: ' + JSON.stringify(result));
}

// =============================================
// ⑥ 統合評価関数（Claude版）
// マークシート読み取り + 読可否判定を1回で実行
// =============================================
function runUnifiedJudgeClaude(base64, mimeType, prompt, inputClass, inputNumber) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) return { ok: false, error: 'CLAUDE_API_KEY が未設定です' };

  const filePart = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType, data: base64 } };

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    temperature: 0,
    messages: [{
      role: 'user',
      content: [filePart, { type: 'text', text: prompt }]
    }]
  };

  const response = UrlFetchApp.fetch(CLAUDE_API_URL, {
    method: 'post',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const body   = JSON.parse(response.getContentText());
  const raw    = body.content?.[0]?.text || '';

  if (status !== 200) {
    return { ok: false, error: 'API error ' + status + ': ' + (body.error?.message || raw) };
  }

  let result = null;
  try {
    const jsonStr = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    result = JSON.parse(jsonStr);
  } catch (e) {
    return { ok: false, error: 'JSON パース失敗', raw };
  }

  const readClass = result.class || '';
  const readNumber = (result.tens || 0) * 10 + (result.ones || 0);

  const inputClassNorm = (inputClass || '').toUpperCase();
  const inputNumberNorm = inputNumber || 0;
  const classMatch = inputClassNorm && readClass ? inputClassNorm === readClass : null;
  const numberMatch = inputNumberNorm && readNumber ? inputNumberNorm === readNumber : null;
  const allMatch = classMatch !== null && numberMatch !== null ? (classMatch && numberMatch) : null;

  return {
    ok: true,
    marksheet: {
      class: readClass,
      tens: result.tens || 0,
      ones: result.ones || 0
    },
    readable: {
      c1: result.c1 || '',
      c2: result.c2 || '',
      c3: result.c3 || '',
      c4: result.c4 || '',
      readable: result.readable || '',
      reason: result.reason || ''
    },
    validation: {
      inputClass: inputClassNorm || '',
      inputNumber: inputNumberNorm,
      readClass: readClass,
      readNumber: readNumber,
      classMatch: classMatch,
      numberMatch: numberMatch,
      allMatch: allMatch
    },
    raw: raw
  };
}
