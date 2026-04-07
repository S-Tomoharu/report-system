// =============================================
// quiz_master GAS API - シンプル版
// 【セットアップ】このプロジェクトはスプレッドシート拡張機能から作成
// スクリプトプロパティ設定は不要

// スプレッドシートを自動的に取得（スプレッドシート拡張機能用）
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// 列インデックス（0始まり）
const COL = {
  Q:       0,  // 問題文
  A:       1,  // 選択肢A
  B:       2,  // 選択肢B
  C:       3,  // 選択肢C
  D:       4,  // 選択肢D
  ANS:     5,  // 正解
  TYPE:    6,  // 形式（4択/記述）
  TERM:    7,  // 考査区分
  ROUND:   8,  // 回
  EXCLUDE: 9,  // 出題除外（チェックボックス）
  ARCHIVE: 10, // アーカイブ除外（チェックボックス）
  MEMO:    11  // メモ
};

// =============================================
// エントリーポイント
// =============================================
function doGet(e) {
  const action = e.parameter.action;

  try {
    let result;
    if (action === 'getSheets') {
      result = getSheets();
    } else if (action === 'getQuestions') {
      const sheet = e.parameter.sheet;
      const term  = e.parameter.term || null;
      const mode  = e.parameter.mode || 'quiz';
      result = getQuestions(sheet, term, mode);
    } else if (action === 'getActivePeriod') {
      result = getActivePeriod(e.parameter.class || '');
    } else if (action === 'logAlert') {
      const round = e.parameter.round;
      const cls   = e.parameter.class;
      const num   = e.parameter.num;
      result = logAlert(round, cls, num);
    } else if (action === 'getYearConfig') {
      result = getYearConfig(e.parameter.year);
    } else {
      result = { error: 'unknown action: ' + action };
    }

    const output = ContentService.createTextOutput(JSON.stringify(result));
    output.setMimeType(ContentService.MimeType.TEXT_PLAIN);
    return output;

  } catch (err) {
    const output = ContentService.createTextOutput(JSON.stringify({ error: err.message }));
    output.setMimeType(ContentService.MimeType.TEXT_PLAIN);
    return output;
  }
}

// =============================================
// ① シート一覧を返す
// 戻り値: ["2026年度", "2027年度", ...]
// =============================================
function getSheets() {
  const ss = getSpreadsheet();
  const sheets = ss.getSheets().map(s => s.getName());
  return { sheets };
}

// =============================================
// ② 問題を返す
// 引数:
//   sheetName ... シート名（年度）
//   term      ... 考査区分（nullなら全件）
//   mode      ... 'quiz'    → 出題除外=trueを除く
//                 'archive' → 出題除外=trueを除く
//                             + アーカイブ除外=trueを除く
// 戻り値: { questions: [...] }
// =============================================
function getQuestions(sheetName, term, mode) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return { error: 'シートが見つかりません: ' + sheetName };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { questions: [] };

  // 2行目以降を全取得（1行目はヘッダー）
  const rows = sheet.getRange(2, 1, lastRow - 1, 12).getValues();

  const questions = [];

  for (const row of rows) {
    const qText   = row[COL.Q];
    const exclude = row[COL.EXCLUDE]; // true/false
    const archive = row[COL.ARCHIVE]; // true/false
    const rowTerm = row[COL.TERM];
    const memo    = row[COL.MEMO];

    // 問題文が空の行はスキップ
    if (!qText) continue;

    // 出題除外チェック（quiz/archive共通）
    if (exclude === true) continue;

    // アーカイブモードではアーカイブ除外もスキップ
    if (mode === 'archive' && archive === true) continue;

    // 考査区分フィルタ
    if (term && rowTerm !== term) continue;

    questions.push({
      q:     qText,
      a:     row[COL.A],
      b:     row[COL.B],
      c:     row[COL.C],
      d:     row[COL.D],
      ans:   row[COL.ANS],
      type:  row[COL.TYPE],
      term:  rowTerm,
      round: row[COL.ROUND],
      memo:  memo
    });
  }

  return { questions };
}

// =============================================
// ③ 現在有効な提出期間を返す
// 引数: cls ... クラス名（省略/空 = 全クラス共通の期間も対象）
// 優先順位: クラス指定行 > 全クラス行
// 戻り値:
//   { active: { round, start, end, memo, pageCount } | null,
//     next:   { round, start, end, memo, pageCount } | null }
// =============================================
function getActivePeriod(cls) {
  const ss    = getSpreadsheet();
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

// =============================================
// ④ アラートログを記録
// 引数: round, cls, num
// =============================================
function logAlert(round, cls, num) {
  const ss = getSpreadsheet();

  // アラートログシートに追記
  let logSheet = ss.getSheetByName('アラートログ');
  if (!logSheet) {
    logSheet = ss.insertSheet('アラートログ');
    logSheet.getRange(1, 1, 1, 4).setValues([['日時', '回', 'クラス', '番号']]);
  }
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  logSheet.appendRow([now, round, cls, num]);

  // 設定シートの「アラート人数」列をインクリメント
  const settingsSheet = ss.getSheetByName('設定');
  if (settingsSheet) {
    const lastRow = settingsSheet.getLastRow();
    if (lastRow >= 2) {
      const vals = settingsSheet.getRange(2, 1, lastRow - 1, 5).getValues();
      for (let i = 0; i < vals.length; i++) {
        if (Number(vals[i][0]) === Number(round)) {
          const current = Number(vals[i][4]) || 0;
          settingsSheet.getRange(i + 2, 5).setValue(current + 1);
          break;
        }
      }
    }
  }

  return { ok: true };
}

// =============================================
// ⑤ クラス設定を返す
// 戻り値: { classes: [{class:'2E', max:35}, ...] }
// =============================================
function getYearConfig(year) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('クラス設定');
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



