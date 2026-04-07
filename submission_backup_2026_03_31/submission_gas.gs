// ── 設定 ──────────────────────────────────────────────
// 【セットアップ】GASのスクリプトプロパティに以下を設定してください：
//   SPREADSHEET_ID: 1rhdCPCKd6JrJcm_5rKElKReS9_oiRct7Tj05MhOtBCc（quiz_masterと同じ）
//   ROOT_FOLDER_ID: 1tJqQc6crBZD1wqCdClAm8gSoGP6B6R5l
//   OCR_ENABLED: 'true' (Claude OCRを実行するか)
//   AI_PROVIDER: 'claude' (使用するAIプロバイダー)

const props = PropertiesService.getScriptProperties();
const ROOT_FOLDER_ID = props.getProperty('ROOT_FOLDER_ID');
const SPREADSHEET_ID = props.getProperty('SPREADSHEET_ID');

// ── エントリーポイント ─────────────────────────────────
function doPost(e) {
  const res = ContentService.createTextOutput();
  res.setMimeType(ContentService.MimeType.TEXT_PLAIN);

  try {
    const params = JSON.parse(e.postData.contents);
    const { year, round, studentClass, number, date, markerPageIndex, files } = params;
    // files: [{ base64, mimeType, page }]

    // ── マークシート検証チェック ────────────────────────────
    // markerPageIndex が -1 の場合はエラー（マークシートなし）
    if (markerPageIndex === -1) {
      res.setContent(JSON.stringify({
        ok: false,
        error: 'マークシートが見つかりません。マークシート用紙をご使用ください。'
      }));
      return res;
    }

    // ── 提出期間チェック ──────────────────────────────────
    // 期間外の提出を拒否（サーバー側検証）
    const isValidPeriod = validateSubmissionPeriod(year, round);
    if (!isValidPeriod) {
      res.setContent(JSON.stringify({
        ok: false,
        error: '申し訳ありません。この期間は提出を受け付けていません。'
      }));
      return res;
    }

    const roundFolder = getOrCreateFolder(year, round);

    // 同じ生徒・同じ回の既存ファイルを削除（最新1件のみ保持）
    const prefix = `${studentClass}-${number}_第${round}回_`;
    const existing = roundFolder.getFiles();
    while (existing.hasNext()) {
      const f = existing.next();
      if (f.getName().startsWith(prefix)) f.setTrashed(true);
    }

    const saved = files.map(f => {
      const page = files.length > 1 ? `_p${f.page}` : '';
      const ext  = f.mimeType === 'application/pdf' ? 'pdf' : 'jpg';
      const name = `${studentClass}-${number}_第${round}回_${date}${page}.${ext}`;

      const blob = Utilities.newBlob(
        Utilities.base64Decode(f.base64),
        f.mimeType,
        name
      );
      const file = roundFolder.createFile(blob);
      return { name, id: file.getId() };
    });

    // ── OCR処理（1ページ目のみ）──────────────
    let ocrResult = { status: 'not_run' };
    try {
      if (typeof readMarksheetWithProvider === 'function' && files.length > 0) {
        const firstFile = files[0];
        ocrResult = readMarksheetWithProvider(firstFile.base64, firstFile.mimeType);
        Logger.log('OCR result: ' + JSON.stringify(ocrResult));
      }
    } catch (ocrErr) {
      // OCR失敗時も提出は受け付ける（未判定として記録）
      Logger.log('OCR error (提出は受け付けます): ' + ocrErr.message);
      ocrResult = { error: ocrErr.message, status: 'error' };
    }

    // ── 結果をスプレッドシートに記録 ───────────
    recordOcrResult(year, round, studentClass, number, date, ocrResult, markerPageIndex);

    res.setContent(JSON.stringify({ ok: true, saved, ocr: ocrResult }));
  } catch (err) {
    res.setContent(JSON.stringify({ ok: false, error: err.message }));
  }

  return res;
}

// ── フォルダ取得 or 作成 ───────────────────────────────
function getOrCreateFolder(year, round) {
  const root       = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const yearName   = `${year}年度`;
  const roundName  = `第${round}回`;

  const yearFolder  = findOrCreate(root, yearName);
  const roundFolder = findOrCreate(yearFolder, roundName);
  return roundFolder;
}

function findOrCreate(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

// ── クラス設定取得 ────────────────────────────────────
function getYearConfig(year) {
  try {
    const sheet = SpreadsheetApp
      .openById(SPREADSHEET_ID)
      .getSheetByName('クラス設定');
    if (!sheet) return { classes: [] };
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { classes: [] };
    const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    const classes = rows
      .filter(r => r[1] !== '' && String(r[0]) === String(year))
      .map(r => ({ class: String(r[1]), max: Number(r[2]) || 40 }));
    return { classes };
  } catch (e) {
    return { classes: [] };
  }
}

// ── 期間情報取得（提出ページ用） ─────────────────────
function doGet(e) {
  if (e.parameter.action === 'geminiTestUI') {
    const tmpl = HtmlService.createTemplateFromFile('gemini_ocr_test');
    tmpl.defaultPrompt = getDefaultPrompt();
    return tmpl.evaluate()
      .setTitle('Gemini OCR テスト')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (e.parameter.action === 'getActivePeriod') {
    const cls = e.parameter.class || '';
    const output = ContentService.createTextOutput(JSON.stringify(getActivePeriod(cls)));
    output.setMimeType(ContentService.MimeType.TEXT_PLAIN);
    return output;
  }
  if (e.parameter.action === 'getPeriodInfo') {
    const round = Number(e.parameter.round);
    const output = ContentService.createTextOutput(JSON.stringify(getPeriodInfo(round)));
    output.setMimeType(ContentService.MimeType.TEXT_PLAIN);
    return output;
  }
  if (e.parameter.action === 'getYearConfig') {
    const year = e.parameter.year;
    const output = ContentService.createTextOutput(JSON.stringify(getYearConfig(year)));
    output.setMimeType(ContentService.MimeType.TEXT_PLAIN);
    return output;
  }
  const output = ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'submission API' }));
  output.setMimeType(ContentService.MimeType.TEXT_PLAIN);
  return output;
}

function getPeriodInfo(round) {
  try {
    const sheet = SpreadsheetApp
      .openById(SPREADSHEET_ID)
      .getSheetByName('設定');
    if (!sheet) return { pageCount: 2 };
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { pageCount: 2 };
    const rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    for (const row of rows) {
      if (Number(row[0]) === round) return { pageCount: Number(row[5]) || 2 };
    }
  } catch (e) {}
  return { pageCount: 2 };
}

// ── 現在有効な提出期間を返す ─────────────────────────
// 引数: cls ... クラス名（省略/空 = 全クラス共通の期間も対象）
// 戻り値: { active: { round, start, end, memo, pageCount } | null,
//          next:   { round, start, end, memo, pageCount } | null }
function getActivePeriod(cls) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('設定');
  if (!sheet) return { active: null, next: null };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { active: null, next: null };

  // 列数は最大7（クラス列が未作成の場合は6）
  const colCount = Math.min(sheet.getLastColumn(), 7);
  const rows = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  const now  = new Date();
  const targetCls = (cls || '').trim();

  // 対象クラスに適用される行だけ抽出
  const applicable = rows.filter(row => {
    if (!row[0] || !row[1] || !row[2]) return false;
    const rowCls = (colCount >= 7 && row[6]) ? String(row[6]).trim() : '';
    // rowClsが空=全クラス対象、rowClsが指定=そのクラスのみ
    return !rowCls || !targetCls || rowCls === targetCls;
  });

  let active = null;
  let next   = null;

  for (const row of applicable) {
    const rowCls    = (colCount >= 7 && row[6]) ? String(row[6]).trim() : '';
    const start     = new Date(row[1]);
    const end       = new Date(row[2]);
    const pageCount = row[5] || 2;
    const score     = (rowCls && rowCls === targetCls) ? 1 : 0; // クラス指定行を優先

    if (now >= start && now <= end) {
      if (!active || score > (active._score || 0)) {
        active = { round: row[0], start: row[1].toISOString(), end: row[2].toISOString(), memo: row[3], pageCount, _score: score };
      }
    } else if (now < start) {
      const startMs = start.getTime();
      const nextMs  = next ? new Date(next.start).getTime() : Infinity;
      if (startMs < nextMs || (startMs === nextMs && score > (next._score || 0))) {
        next = { round: row[0], start: row[1].toISOString(), end: row[2].toISOString(), memo: row[3], pageCount, _score: score };
      }
    }
  }

  if (active) delete active._score;
  if (next)   delete next._score;
  return { active, next };
}

// ── 提出期間の妥当性チェック ───────────────────────────
function validateSubmissionPeriod(year, round) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('設定');
    if (!sheet) return false;  // 設定シートがなければ拒否

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;

    // 設定シートから期間情報を取得
    // 期待される列: [回, 開始日時, 終了日時, ...]
    const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    const now = new Date();

    for (const row of rows) {
      const rowRound = String(row[0]).trim();
      const startTime = row[1];
      const endTime = row[2];

      // 対応する回を見つけたか確認
      if (String(round) === rowRound) {
        // 時刻が有効か確認（開始 ≤ 現在 ≤ 終了）
        if (startTime && endTime) {
          const start = new Date(startTime);
          const end = new Date(endTime);
          return start <= now && now <= end;
        }
      }
    }

    // 該当する回が見つからない
    return false;
  } catch (e) {
    Logger.log('期間チェックエラー: ' + e.message);
    // エラー時は安全側に拒否
    return false;
  }
}

// ── OCR結果をスプレッドシートに記録 ────────────────────
function recordOcrResult(year, round, studentClass, number, date, ocrResult, markerPageIndex) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('OCR結果');

    // シートが存在しない場合は作成
    if (!sheet) {
      sheet = ss.insertSheet('OCR結果');
      sheet.appendRow(['年度', '回', 'クラス', '番号', '提出日時', 'クラス判定', '十の位', '一の位', '判定ステータス', 'マーカーページ', '備考']);
    }

    // 結果を整理
    const status = ocrResult.status || 'unknown';
    const classList = ocrResult.class || '';
    const tens = ocrResult.tens !== undefined ? ocrResult.tens : '';
    const ones = ocrResult.ones !== undefined ? ocrResult.ones : '';
    const remark = ocrResult.error || ocrResult.raw || '';
    const pageIndexStr = markerPageIndex >= 0 ? String(markerPageIndex) : '検出未実施';

    // 行を追加
    sheet.appendRow([year, round, studentClass, number, date, classList, tens, ones, status, pageIndexStr, remark]);
  } catch (e) {
    Logger.log('OCR結果記録エラー: ' + e.message);
    // 記録失敗時も処理は続行
  }
}
