// =============================================
// quiz_master GAS API - 認証機能付きバージョン
// 【設計】
// - authenticate(cls, num) でトークン生成
// - validateToken(token) でトークン検証
// - logAccess() でアクセスログ記録
// - doGet() で validateToken() を呼び出して保護
//
// 【実装状況】
// Stage 1 テスト完了（2026-03-30）
// - authenticate: success
// - getActivePeriod: success（トークン必須）
// - getQuestions: success（トークン必須）
// - logAlert: success（トークン必須）
// - logAccess: success（ログ記録機能）
//
// 【デプロイ】
// - 新規デプロイが必要
// - スクリプトプロパティの SPREADSHEET_ID 確認
// - quiz_prototype_v2.html で authenticate() を呼び出してトークン取得
// =============================================

const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

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
    if (action === 'authenticate') {
      const cls = e.parameter.class;
      const num = e.parameter.num;
      result = authenticate(cls, num);
    } else if (action === 'getSheets') {
      result = getSheets();
    } else if (action === 'getQuestions') {
      const token = e.parameter.token;
      const sheet = e.parameter.sheet;
      const term  = e.parameter.term || null;
      const mode  = e.parameter.mode || 'quiz';
      const validated = validateToken(token);
      if (validated.error) {
        logAccess('getQuestions', 'failed', 'invalid_token', {token});
        result = validated;
      } else {
        logAccess('getQuestions', 'success', null, {class: validated.class, num: validated.num});
        result = getQuestions(sheet, term, mode);
      }
    } else if (action === 'getActivePeriod') {
      const token = e.parameter.token;
      const cls = e.parameter.class || '';
      const validated = validateToken(token);
      if (validated.error) {
        logAccess('getActivePeriod', 'failed', 'invalid_token', {token});
        result = validated;
      } else {
        logAccess('getActivePeriod', 'success', null, {class: validated.class, num: validated.num});
        result = getActivePeriod(cls);
      }
    } else if (action === 'logAlert') {
      const token = e.parameter.token;
      const round = e.parameter.round;
      const cls   = e.parameter.class;
      const num   = e.parameter.num;
      const validated = validateToken(token);
      if (validated.error) {
        logAccess('logAlert', 'failed', 'invalid_token', {token});
        result = validated;
      } else {
        logAccess('logAlert', 'success', null, {class: validated.class, num: validated.num, round, cls, num});
        result = logAlert(round, cls, num);
      }
    } else if (action === 'getYearConfig') {
      result = getYearConfig(e.parameter.year);
    } else {
      logAccess('unknown', 'failed', 'unknown_action', {action});
      result = { error: 'unknown action: ' + action };
    }

    const output = ContentService.createTextOutput(JSON.stringify(result));
    output.setMimeType(ContentService.MimeType.TEXT_PLAIN);
    return output;

  } catch (err) {
    logAccess('error', 'failed', err.message, {});
    const output = ContentService.createTextOutput(JSON.stringify({ error: err.message }));
    output.setMimeType(ContentService.MimeType.TEXT_PLAIN);
    return output;
  }
}

// その他の関数は元のコードと同じ...
// （getQuestions, getActivePeriod, logAlert, getYearConfig）
// 省略...

// =============================================
// 認証・ロギング機能
// =============================================

function authenticate(cls, num) {
  if (!cls || !num) {
    logAccess('authenticate', 'failed', 'missing_params', {cls, num});
    return { error: 'クラスと番号は必須です' };
  }

  try {
    const token = Utilities.getUuid();
    const now = new Date();
    const expiresMs = now.getTime() + (30 * 60 * 1000); // 30分後
    const expires = new Date(expiresMs).toISOString();

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let tokenSheet = ss.getSheetByName('認証トークン');
    if (!tokenSheet) {
      tokenSheet = ss.insertSheet('認証トークン');
      tokenSheet.getRange(1, 1, 1, 5).setValues([['タイムスタンプ', 'トークン', 'クラス', '番号', '有効期限']]);
    }

    const timestamp = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    tokenSheet.appendRow([timestamp, token, cls, num, expires]);

    logAccess('authenticate', 'success', null, {class: cls, num});
    return { ok: true, token, expires };
  } catch (e) {
    logAccess('authenticate', 'failed', e.message, {cls, num});
    return { error: e.message };
  }
}

function validateToken(token) {
  if (!token) {
    return { error: 'トークンが指定されていません' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('認証トークン');
    if (!sheet) {
      return { error: 'トークンが見つかりません' };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { error: 'トークンが見つかりません' };
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    const now = new Date();

    for (let i = rows.length - 1; i >= 0; i--) {
      const rowToken = rows[i][1];
      const rowCls   = rows[i][2];
      const rowNum   = rows[i][3];
      const expiresStr = rows[i][4];

      if (rowToken === token) {
        const expires = new Date(expiresStr);
        if (now > expires) {
          return { error: 'トークンの有効期限が切れています' };
        }
        return { class: rowCls, num: rowNum };
      }
    }

    return { error: 'トークンが無効です' };
  } catch (e) {
    return { error: e.message };
  }
}

function logAccess(action, status, detail, userInfo) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let logSheet = ss.getSheetByName('APIアクセスログ');
    if (!logSheet) {
      logSheet = ss.insertSheet('APIアクセスログ');
      logSheet.getRange(1, 1, 1, 6).setValues([['タイムスタンプ', 'アクション', 'ステータス', '詳細', 'クラス', '番号']]);
    }

    const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    const cls = userInfo.class || '';
    const num = userInfo.num || '';
    const detailStr = detail ? String(detail) : '';

    logSheet.appendRow([timestamp, action, status, detailStr, cls, num]);
  } catch (e) {
    Logger.log('Log failed: ' + e.message);
  }
}
