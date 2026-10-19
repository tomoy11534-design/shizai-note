// 資材ノートとの連携
// このスプレッドシートの「拡張機能 → Apps Script」に、この内容をまるごと貼り付けて保存する
// ・明細の表（見出しに「品名」「数量」「単価」がある表）を、資材ノートに取り込む
// ・資材ノートの在庫一覧と履歴を、このスプレッドシートに書き出す（見るだけのシート）

const APP_URL = 'https://shizai-note.vercel.app';
const STOCK_SHEET = '資材ノート_在庫一覧';
const HISTORY_SHEET = '資材ノート_履歴';
const TOKEN_KEY = 'SHIZAI_TOKEN';

// スプレッドシートを開いたときに、メニューを出す
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('資材ノート')
    .addItem('今すぐ同期する', 'syncNow')
    .addSeparator()
    .addItem('合言葉を設定する', 'setToken')
    .addItem('毎朝の自動同期をオンにする', 'installTrigger')
    .addItem('毎朝の自動同期をオフにする', 'removeTrigger')
    .addToUi();
}

// 資材ノートの設定タブで発行した合言葉を、このスプレッドシートに保存する
function setToken() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('資材ノートの合言葉', '資材ノートの設定タブで発行した合言葉を貼り付けてください。', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  PropertiesService.getDocumentProperties().setProperty(TOKEN_KEY, res.getResponseText().trim());
  ui.alert('保存しました。メニューの「今すぐ同期する」で試してください。');
}

// 手で同期する（結果を画面に出す）
function syncNow() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert('資材ノートと同期しました', sync_(), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('同期できませんでした', e.message, ui.ButtonSet.OK);
  }
}

// 毎朝の自動同期（トリガーから呼ばれる）
function dailySync() {
  sync_();
}

// 先に取り込んでから書き出すので、書き出した一覧には取り込んだ分も入る
function sync_() {
  const imported = importStatements_();
  const exported = exportSheets_();
  return '取り込み：' + imported + '\n書き出し：' + exported;
}

function installTrigger() {
  removeTriggers_();
  ScriptApp.newTrigger('dailySync').timeBased().everyDays(1).atHour(6).create();
  SpreadsheetApp.getUi().alert('毎朝6時ごろに、自動で同期するようにしました。');
}

function removeTrigger() {
  removeTriggers_();
  SpreadsheetApp.getUi().alert('毎朝の自動同期をオフにしました。');
}

function removeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailySync') ScriptApp.deleteTrigger(t);
  });
}

// ---------- 資材ノートとのやりとり ----------

function token_() {
  const t = PropertiesService.getDocumentProperties().getProperty(TOKEN_KEY);
  if (!t) throw new Error('合言葉が設定されていません。メニューの「合言葉を設定する」から入れてください。');
  return t;
}

function call_(method, path, payload) {
  const res = UrlFetchApp.fetch(APP_URL + path, {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token_() },
    payload: payload ? JSON.stringify(payload) : undefined,
    muteHttpExceptions: true
  });
  let body = {};
  try {
    body = JSON.parse(res.getContentText() || '{}');
  } catch (e) {
    throw new Error('資材ノートから正しい返事がありませんでした（' + res.getResponseCode() + '）。');
  }
  if (res.getResponseCode() >= 300 || body.ok === false) throw new Error(body.message || 'エラー（' + res.getResponseCode() + '）');
  return body;
}

// 明細の表を探す：1〜5行目に「品名」「数量」「単価」の見出しがあるシート（書き出し用のシートは除く）
function statementTables_() {
  const tables = [];
  SpreadsheetApp.getActive().getSheets().forEach(function (sh) {
    if (sh.getName().indexOf('資材ノート_') === 0 || sh.getLastRow() < 2) return;
    const values = sh.getDataRange().getDisplayValues();
    for (let i = 0; i < Math.min(5, values.length); i++) {
      const header = values[i].map(function (v) { return String(v).normalize('NFKC').trim(); });
      if (header.indexOf('品名') >= 0 && header.indexOf('数量') >= 0 && header.indexOf('単価') >= 0) {
        tables.push({ sheet: sh.getName(), header: values[i], rows: values.slice(i + 1) });
        return;
      }
    }
  });
  return tables;
}

function importStatements_() {
  const tables = statementTables_();
  if (!tables.length) return '明細の表は見つかりませんでした';
  const res = call_('post', '/api/sheet/import', { tables: tables });
  const notes = (res.errors || []).slice(0, 5).join('\n');
  return res.message + (notes ? '\n' + notes : '');
}

function exportSheets_() {
  const data = call_('get', '/api/sheet/export');
  write_(STOCK_SHEET, data.stock);
  write_(HISTORY_SHEET, data.history);
  return '在庫一覧 ' + (data.stock.length - 1) + ' 件・履歴 ' + (data.history.length - 1) + ' 件';
}

// シートを丸ごと書き直す。入力はアプリでするので、うっかり書き換えないよう注意を出す
function write_(name, rows) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  if (!rows.length) return;
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    sh.protect().setDescription('資材ノートから書き出した一覧です。直すときは資材ノートで直してください。').setWarningOnly(true);
  }
}
