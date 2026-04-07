// =============================================
// 管理ページ用 GAS
// デプロイ設定：実行者=自分、アクセス=自分のみ
// =============================================
// 【セットアップ】GASのスクリプトプロパティに以下を設定：
//   SPREADSHEET_ID: 1rhdCPCKd6JrJcm_5rKElKReS9_oiRct7Tj05MhOtBCc

const ADMIN_SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const SETTINGS_SHEET_NAME  = '設定';


// ── 全期間を取得 ──────────────────────────────
function getPeriods() {
  const sheet = getSettingsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  return rows
    .filter(r => r[0] !== '')
    .map(r => ({
      round:      r[0],
      start:      r[1] ? Utilities.formatDate(new Date(r[1]), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') : '',
      end:        r[2] ? Utilities.formatDate(new Date(r[2]), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') : '',
      memo:       r[3],
      alertCount: r[4] || 0,
      pageCount:  r[5] || 2,
      classes:    r[6] ? String(r[6]).trim() : ''
    }));
}

// ── 期間を保存（追加・更新） ──────────────────
// 戻り値: { ok: true } or { ok: false, error: '...' }
// classes: クラス名（空=全クラス対象）
function savePeriod(round, startStr, endStr, memo, pageCount, classes) {
  const sheet  = getSettingsSheet();
  const start  = new Date(startStr);
  const end    = new Date(endStr);
  classes = (classes || '').trim();

  if (isNaN(start) || isNaN(end)) return { ok: false, error: '日時の形式が正しくありません' };
  if (start >= end)               return { ok: false, error: '終了日時は開始日時より後にしてください' };

  // オーバーラップチェック（同じクラス範囲内のみ）
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    for (const row of rows) {
      const rowCls = row[6] ? String(row[6]).trim() : '';
      if (row[0] === '' || (row[0] == round && rowCls === classes)) continue;
      if (rowCls !== classes) continue; // クラス範囲が違う行はスキップ
      const s = new Date(row[1]);
      const e = new Date(row[2]);
      if (!isNaN(s) && !isNaN(e) && start < e && end > s) {
        const clsLabel = classes ? `（${classes}）` : '';
        return { ok: false, error: `第${row[0]}回${clsLabel}（${formatDate(s)}〜${formatDate(e)}）と期間が重複しています` };
      }
    }
  }

  const pages = Number(pageCount) || 2;

  // 既存行を探して更新、なければ追加（アラート件数は保持）
  const rowIndex = findRowByRoundAndClass(sheet, round, classes);
  if (rowIndex > 0) {
    const alertCount = sheet.getRange(rowIndex, 5).getValue() || 0;
    sheet.getRange(rowIndex, 1, 1, 7).setValues([[round, start, end, memo || '', alertCount, pages, classes]]);
  } else {
    sheet.appendRow([round, start, end, memo || '', 0, pages, classes]);
  }

  sortByRound(sheet);
  return { ok: true };
}

// ── 期間を削除 ───────────────────────────────
function deletePeriod(round, classes) {
  classes = (classes || '').trim();
  const sheet    = getSettingsSheet();
  const rowIndex = findRowByRoundAndClass(sheet, round, classes);
  if (rowIndex > 0) sheet.deleteRow(rowIndex);
  return { ok: true };
}

// ── 内部ユーティリティ ────────────────────────
function getSettingsSheet() {
  const ss    = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
  let   sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
    sheet.getRange(1, 1, 1, 7).setValues([['回', '開始日時', '終了日時', 'メモ', 'アラート件数', '枚数', 'クラス（空=全）']]);
  } else {
    if (sheet.getRange(1, 5).getValue() !== 'アラート件数')  sheet.getRange(1, 5).setValue('アラート件数');
    if (sheet.getRange(1, 6).getValue() !== '枚数')          sheet.getRange(1, 6).setValue('枚数');
    if (sheet.getRange(1, 7).getValue() !== 'クラス（空=全）') sheet.getRange(1, 7).setValue('クラス（空=全）');
  }
  return sheet;
}

function findRowByRoundAndClass(sheet, round, classes) {
  classes = (classes || '').trim();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const vals = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  for (let i = 0; i < vals.length; i++) {
    const rowCls = vals[i][6] ? String(vals[i][6]).trim() : '';
    if (vals[i][0] == round && rowCls === classes) return i + 2;
  }
  return -1;
}

function sortByRound(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  sheet.getRange(2, 1, lastRow - 1, 7).sort([
    { column: 1, ascending: true },
    { column: 7, ascending: true }
  ]);
}

function formatDate(d) {
  return Utilities.formatDate(d, 'Asia/Tokyo', 'M/d HH:mm');
}

// =============================================
// クラス設定 CRUD
// =============================================
function getOrCreateClassSheet() {
  const ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('クラス設定');
  if (!sheet) {
    sheet = ss.insertSheet('クラス設定');
    sheet.getRange(1, 1, 1, 3).setValues([['年度', 'クラス', '人数']]);
  }
  return sheet;
}

function getClassConfigs(year) {
  const sheet = getOrCreateClassSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  return rows
    .filter(r => r[1] !== '' && (year == null || String(r[0]) === String(year)))
    .map(r => ({ year: String(r[0]), class: String(r[1]), max: Number(r[2]) || 40 }));
}

function saveClassConfig(year, cls, max) {
  if (!year || !cls) return { ok: false, error: '年度とクラスは必須です' };
  const sheet = getOrCreateClassSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(year) && rows[i][1] === cls) {
        sheet.getRange(i + 2, 3).setValue(Number(max) || 40);
        updateYearConfigCache(year);
        generateConfigJs(year);  // config.js を生成
        return { ok: true };
      }
    }
  }
  sheet.appendRow([String(year), cls, Number(max) || 40]);
  sortClassSheet(sheet);
  updateYearConfigCache(year);
  generateConfigJs(year);  // config.js を生成
  return { ok: true };
}

function deleteClassConfig(year, cls) {
  const sheet = getOrCreateClassSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true };
  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]) === String(year) && rows[i][1] === cls) {
      sheet.deleteRow(i + 2);
      updateYearConfigCache(year);
      generateConfigJs(year);  // config.js を生成
      return { ok: true };
    }
  }
  return { ok: true };
}

function sortClassSheet(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  sheet.getRange(2, 1, lastRow - 1, 3).sort([
    { column: 1, ascending: true },
    { column: 2, ascending: true }
  ]);
}

// ── スクリプトプロパティのキャッシュを更新 ────
function updateYearConfigCache(year) {
  const classes = getClassConfigs(year);
  const props = PropertiesService.getScriptProperties();
  const config = JSON.parse(props.getProperty('YEAR_CONFIG') || '{}');
  config[year] = classes;
  props.setProperty('YEAR_CONFIG', JSON.stringify(config));
}

// =============================================
// config.js を生成（ブラウザ download 用）
// =============================================
function generateConfigJs(year) {
  try {
    // すべてのクラス設定を取得
    const allClasses = getClassConfigs(null);

    // 年度ごとに分類
    const yearConfig = {};
    for (const cls of allClasses) {
      const y = cls.year;
      if (!yearConfig[y]) yearConfig[y] = [];
      yearConfig[y].push({ class: cls.class, max: cls.max });
    }

    // config.js の内容を生成
    const configContent = `const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxCaX9OZ4Ui86bBZEN-bheDvKfcYn_aAVNxyFKYGWl719WTVB9mSxtgDDeVK0KqwggRiQ/exec',
  SUBMISSION_GAS_URL: 'https://script.google.com/macros/s/AKfycbyXJxUVoIBFfCEzVgv39sZRDSUwmAagP3VAm5s5x_G54xhnZBLsdb2U2Tx2ceWLih8B/exec',
  ADMIN_URL: 'https://script.google.com/a/macros/tokai-jh.ed.jp/s/AKfycbx2-NMn6lrOpLA6ysdsbFT0lYd_OBcZKwGGO-8__128HDMa7yAUxm3IWAUSs6uFiiBEiw/exec',

  SHEET: '${year}年度',
  YEAR: '${year}',

  YEAR_CONFIG: ${JSON.stringify(yearConfig)}
};`;

    // base64 エンコード（ブラウザで download できるようにする）
    const encoded = Utilities.base64Encode(configContent);
    const downloadUrl = `data:text/plain;base64,${encoded}`;

    Logger.log(`config.js generated for ${year}`);
    return { ok: true, downloadUrl, configText: configContent, filename: 'config.js' };
  } catch (e) {
    Logger.log('config.js generation error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// =============================================
// 管理画面を返す
// =============================================
function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('admin')
    .setTitle('提出期間管理')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
