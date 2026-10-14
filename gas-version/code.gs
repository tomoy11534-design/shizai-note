/**
 * 資材ノート（サーバー側）
 * Googleスプレッドシートをデータベースとして使い、Webアプリとして公開する。
 */

// ===== 基本設定 =====
const TZ = 'Asia/Tokyo';
const APP_TITLE = '資材ノート';

// 農林水産省「農業物価統計調査」のページ（機械判読用Excelへのリンクがある）
const MAFF_PAGE_URL = 'https://www.maff.go.jp/j/tokei/kouhyou/noubukka/';
// 公的データはこの月以降だけ保存する（データ量を抑えるため）
const PUBLIC_SINCE = '2015-01';

// 購入として価格計算に使う履歴の種類
const PURCHASE_TYPES = ['入庫', '過去の購入'];
// 取り消しできる履歴の種類
const CANCELABLE_TYPES = ['入庫', '出庫', '調整', '過去の購入'];

// カテゴリの初期値と、比べる公的データ（農業生産資材価格指数の類別）
const DEFAULT_CATEGORIES = [
  ['肥料', 'idx:肥料'],
  ['農薬', 'idx:農業薬剤'],
  ['種苗', 'idx:種苗及び苗木'],
  ['包装資材', 'idx:諸材料'],
  ['被覆資材', 'idx:諸材料'],
  ['燃料', 'idx:光熱動力'],
  ['機械部品', 'idx:農機具'],
  ['その他', 'idx:農業生産資材総合'],
];

// 設定の初期値
const DEFAULT_SETTINGS = {
  alertDays: 30,          // 期限間近とみなす日数
  priceAlertPct: 10,      // 値上がり注意とみなす前年比（％）
  gapAlertPts: 5,         // 全国より高めとみなす差（ポイント）
  notifyEnabled: false,   // 毎日のメール通知
  notifyHour: 7,          // メール通知の時刻
  publicAutoFetch: false, // 公的データの自動取得
  publicNotify: true,     // 公的データ更新時のメール
  userNames: {},          // メールアドレス → 表示名
  publicLastFetch: '',
  publicLastStatus: '',
  publicLatestPeriod: '',
  publicSourceUrl: '',    // 取得元Excelを固定したいときだけ入力する
};

// シートの定義（列の順番はこの並びで固定）
const DEF = {
  items: {
    name: '資材',
    cols: ['id', 'name', 'category', 'unit', 'stock', 'price', 'reorderLevel', 'expiry', 'supplier', 'memo',
      'publicRef', 'lastPurchaseDate', 'updatedAt', 'updatedBy', 'purpose'],
    headers: ['ID', '資材名', 'カテゴリ', '単位', '在庫数', '単価', '発注の目安', '使用期限', '購入先', 'メモ',
      '比較する公的データ', '最終購入日', '更新日時', '更新者', '用途'],
    numbers: ['stock', 'price', 'reorderLevel'],
  },
  manuals: {
    name: '取扱説明書',
    cols: ['id', 'itemId', 'itemName', 'title', 'fileId', 'fileName', 'mimeType', 'size', 'url', 'uploadedAt', 'uploadedBy'],
    headers: ['ID', '資材ID', '資材名', '表題', 'ファイルID', 'ファイル名', '種類', 'サイズ（バイト）', 'URL', '登録日時', '登録した人'],
    numbers: ['size'],
  },
  history: {
    name: '履歴',
    cols: ['id', 'timestamp', 'date', 'itemId', 'itemName', 'category', 'type', 'qty', 'stockAfter', 'unitPrice',
      'amount', 'supplier', 'user', 'memo', 'cancelled', 'refId'],
    headers: ['ID', '記録日時', '日付（購入日）', '資材ID', '資材名', 'カテゴリ', '種類', '数量', '変更後の在庫',
      '単価', '金額', '購入先', '操作した人', 'メモ', '取消済み', '関連ID'],
    numbers: ['qty', 'stockAfter', 'unitPrice', 'amount'],
  },
  categories: {
    name: 'カテゴリ',
    cols: ['name', 'publicRef'],
    headers: ['カテゴリ名', '比較する公的データ'],
    numbers: [],
  },
  settings: {
    name: '設定',
    cols: ['key', 'value'],
    headers: ['項目', '値（JSON）'],
    numbers: [],
  },
  publicData: {
    name: '公的データ',
    cols: ['key', 'kind', 'group', 'name', 'spec', 'unit', 'data', 'prov'],
    headers: ['キー', '種類', '類別', '名称', '銘柄等級', '単位', '月別の値（JSON）', '速報値の月（JSON）'],
    numbers: [],
  },
};

// ===== Webアプリの入口 =====

function doGet() {
  ensureSetup_();
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// HTMLファイルを読み込んで埋め込む（index.html から使う）
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// スプレッドシートのメニューから初期設定できるようにする
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(APP_TITLE)
    .addItem('初期設定を実行', 'setup')
    .addToUi();
}

// 初期設定（シートの作成）。エディタから一度実行して権限を許可する
function setup() {
  PropertiesService.getScriptProperties().deleteProperty('SETUP_VERSION');
  ensureSetup_();
  manualFolder_(true);
  return '初期設定が完了しました。';
}

// ===== 共通の小さな関数 =====

function getSs_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function nowStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss.SSS');
}

function today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function newId_() {
  return Utilities.getUuid();
}

function currentUser_() {
  return Session.getActiveUser().getEmail() || '不明';
}

function isOwner_() {
  const owner = getSs_().getOwner();
  return !!owner && owner.getEmail() === currentUser_();
}

function requireOwner_() {
  if (!isOwner_()) throw new Error('この操作はスプレッドシートの所有者だけができます。');
}

// 同時に書き込まないよう、順番に処理する
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('混み合っています。少し待ってからもう一度お試しください。');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function toNum_(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return isFinite(n) ? n : fallback;
}

function cleanText_(value, max) {
  return String(value === null || value === undefined ? '' : value).trim().slice(0, max || 200);
}

// 日付（yyyy-MM-dd）。allowYear が true なら年だけ（yyyy）も受け付ける
function cleanDate_(value, allowYear) {
  const s = cleanText_(value, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (allowYear && /^\d{4}$/.test(s)) return s;
  return '';
}

// ===== シートの読み書き =====

function sheet_(def) {
  const ss = getSs_();
  let sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// 1行分の値をオブジェクトにする
function rowToObj_(def, row) {
  const obj = {};
  def.cols.forEach((col, i) => {
    let v = row[i];
    if (v instanceof Date) v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
    obj[col] = v;
  });
  return obj;
}

// オブジェクトを1行分の値にする
// 文字の列は先頭に「'」を付けて、日付や数式に自動変換されないようにする
function objToRow_(def, obj) {
  return def.cols.map((col) => {
    const v = obj[col];
    if (v === undefined || v === null || v === '') return '';
    if (def.numbers.indexOf(col) >= 0 || typeof v === 'boolean') return v;
    return "'" + String(v);
  });
}

function readAll_(def) {
  const sh = sheet_(def);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, def.cols.length).getValues().map((row) => rowToObj_(def, row));
}

function writeAll_(def, list) {
  const sh = sheet_(def);
  const last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, def.cols.length).clearContent();
  if (list.length) sh.getRange(2, 1, list.length, def.cols.length).setValues(list.map((o) => objToRow_(def, o)));
}

function append_(def, obj) {
  const sh = sheet_(def);
  sh.getRange(sh.getLastRow() + 1, 1, 1, def.cols.length).setValues([objToRow_(def, obj)]);
}

// IDで行番号を探す（見つからなければ -1）
function findRow_(def, id) {
  const sh = sheet_(def);
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

function readRow_(def, rowNo) {
  return rowToObj_(def, sheet_(def).getRange(rowNo, 1, 1, def.cols.length).getValues()[0]);
}

function writeRow_(def, rowNo, obj) {
  sheet_(def).getRange(rowNo, 1, 1, def.cols.length).setValues([objToRow_(def, obj)]);
}

// ===== 初期設定 =====

function ensureSetup_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_VERSION') === '1') return;

  Object.keys(DEF).forEach((k) => sheet_(DEF[k]));
  if (readAll_(DEF.categories).length === 0) {
    writeAll_(DEF.categories, DEFAULT_CATEGORIES.map((c) => ({ name: c[0], publicRef: c[1] })));
  }
  // 最初からある空のシート（シート1）は消す
  const ss = getSs_();
  ['シート1', 'Sheet1'].forEach((n) => {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  props.setProperty('SETUP_VERSION', '1');
}

// ===== 設定 =====

function getSettings_() {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  readAll_(DEF.settings).forEach((row) => {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch (e) {
      // 壊れた値は無視して初期値を使う
    }
  });
  return settings;
}

function saveSettings_(partial) {
  const settings = Object.assign(getSettings_(), partial);
  writeAll_(DEF.settings, Object.keys(settings).map((key) => ({ key: key, value: JSON.stringify(settings[key]) })));
  return settings;
}

// ===== 起動時のデータ読み込み =====

function getInitialData() {
  ensureSetup_();
  const owner = isOwner_();
  if (owner) {
    // 所有者が開いたときに、説明書フォルダの準備と家族への共有をそろえる
    try {
      manualFolder_(true);
      syncManualSharing_();
    } catch (e) {
      console.warn('説明書フォルダの準備に失敗：' + e.message);
    }
  }
  return {
    items: readAll_(DEF.items),
    history: readAll_(DEF.history),
    categories: readAll_(DEF.categories),
    settings: getSettings_(),
    publicData: readPublic_(),
    manuals: readAll_(DEF.manuals),
    manualReady: !!PropertiesService.getScriptProperties().getProperty('MANUAL_FOLDER_ID'),
    me: currentUser_(),
    isOwner: owner,
    appUrl: ScriptApp.getService().getUrl(),
    today: today_(),
  };
}

// ===== 履歴 =====

function addHistory_(h) {
  const row = Object.assign({
    id: newId_(),
    timestamp: nowStr_(),
    date: today_(),
    itemId: '',
    itemName: '',
    category: '',
    type: '',
    qty: '',
    stockAfter: '',
    unitPrice: '',
    amount: '',
    supplier: '',
    user: currentUser_(),
    memo: '',
    cancelled: '',
    refId: '',
  }, h);
  append_(DEF.history, row);
  return row;
}

function itemRef_(item) {
  return { itemId: item.id, itemName: item.name, category: item.category };
}

// ===== 資材の登録・編集・削除 =====

function sanitizeItem_(input, categories) {
  const names = categories.map((c) => c.name);
  return {
    name: cleanText_(input.name, 100),
    category: names.indexOf(input.category) >= 0 ? input.category : names[0],
    unit: cleanText_(input.unit, 20),
    stock: Math.max(0, toNum_(input.stock, 0)),
    price: Math.max(0, toNum_(input.price, 0)),
    reorderLevel: input.reorderLevel === '' || input.reorderLevel === null || input.reorderLevel === undefined
      ? '' : Math.max(0, toNum_(input.reorderLevel, 0)),
    expiry: cleanDate_(input.expiry, false),
    supplier: cleanText_(input.supplier, 100),
    memo: cleanText_(input.memo, 1000),
    publicRef: cleanText_(input.publicRef, 300),
    purpose: cleanText_(input.purpose, 1000),
  };
}

// 編集内容を人が読める形にまとめる
function describeChanges_(before, after) {
  const labels = { name: '資材名', category: 'カテゴリ', unit: '単位', stock: '在庫', price: '単価',
    reorderLevel: '発注の目安', expiry: '使用期限', supplier: '購入先', memo: 'メモ', publicRef: '比較データ', purpose: '用途' };
  return Object.keys(labels)
    .filter((k) => String(before[k]) !== String(after[k]))
    .map((k) => (k === 'memo' || k === 'publicRef' || k === 'purpose') ? labels[k] + 'を変更'
      : labels[k] + ' ' + (before[k] === '' ? '（なし）' : before[k]) + '→' + (after[k] === '' ? '（なし）' : after[k]))
    .join('、');
}

/**
 * 資材を登録・更新する
 * expectedUpdatedAt：編集を始めたときの更新日時。ほかの人が先に更新していたら conflict を返す
 */
function saveItem(input, expectedUpdatedAt) {
  return withLock_(() => {
    const data = sanitizeItem_(input, readAll_(DEF.categories));
    if (!data.name) throw new Error('資材名を入力してください。');
    const now = nowStr_();
    const user = currentUser_();

    // 新規登録
    if (!input.id) {
      const item = Object.assign({ id: newId_() }, data, { lastPurchaseDate: '', updatedAt: now, updatedBy: user });
      append_(DEF.items, item);
      const h = addHistory_(Object.assign(itemRef_(item), {
        type: '登録', qty: item.stock, stockAfter: item.stock, unitPrice: item.price, supplier: item.supplier,
      }));
      return { item: item, history: [h] };
    }

    // 更新
    const rowNo = findRow_(DEF.items, input.id);
    if (rowNo < 0) throw new Error('この資材は、ほかの人がすでに削除しています。');
    const current = readRow_(DEF.items, rowNo);
    if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) {
      return { conflict: true, item: current };
    }
    const item = Object.assign({}, current, data, { updatedAt: now, updatedBy: user });
    const changes = describeChanges_(current, item);
    if (!changes) return { item: current, history: [] };
    writeRow_(DEF.items, rowNo, item);
    const h = addHistory_(Object.assign(itemRef_(item), {
      type: '編集', qty: Number(item.stock) - Number(current.stock), stockAfter: item.stock, memo: changes,
    }));
    return { item: item, history: [h] };
  });
}

function deleteItem(id) {
  return withLock_(() => {
    const rowNo = findRow_(DEF.items, id);
    if (rowNo < 0) return { deletedId: id, history: [] };
    const current = readRow_(DEF.items, rowNo);
    sheet_(DEF.items).deleteRow(rowNo);
    const h = addHistory_(Object.assign(itemRef_(current), {
      type: '削除', qty: -Number(current.stock), stockAfter: 0, memo: '資材を削除（価格の履歴は残す）',
    }));
    return { deletedId: id, history: [h] };
  });
}

// ===== 在庫の増減（入庫・出庫・調整） =====

/**
 * kind：'入庫' | '出庫' | '調整'
 * p：{ qty, delta（調整のときの増減）, date, unitPrice, supplier, memo }
 * 「今の数に足す・引く」形で保存するので、同時に操作しても数がずれない
 */
function moveStock(id, kind, p) {
  return withLock_(() => {
    const rowNo = findRow_(DEF.items, id);
    if (rowNo < 0) throw new Error('この資材は、ほかの人がすでに削除しています。');
    const item = readRow_(DEF.items, rowNo);
    const stock = Number(item.stock) || 0;
    let delta;

    if (kind === '調整') {
      delta = toNum_(p.delta, 0);
      if (stock + delta < 0) delta = -stock;
      if (delta === 0) return { item: item, history: [] };
    } else if (kind === '入庫' || kind === '出庫') {
      const qty = toNum_(p.qty, 0);
      if (!(qty > 0)) throw new Error('数量を正しく入力してください。');
      if (kind === '出庫' && qty > stock) {
        throw new Error('在庫が足りません（いまの在庫：' + stock + (item.unit || '') + '）。');
      }
      delta = kind === '入庫' ? qty : -qty;
    } else {
      throw new Error('操作の種類が正しくありません。');
    }

    item.stock = stock + delta;
    const h = Object.assign(itemRef_(item), { type: kind, qty: delta, memo: cleanText_(p.memo, 500) });

    if (kind === '入庫') {
      const date = cleanDate_(p.date, false) || today_();
      const unitPrice = Math.max(0, toNum_(p.unitPrice, Number(item.price) || 0));
      const supplier = cleanText_(p.supplier, 100) || item.supplier;
      Object.assign(h, { date: date, unitPrice: unitPrice, amount: Math.round(unitPrice * delta), supplier: supplier });
      // 最新の購入なら、資材の単価と購入先を更新する
      if (!item.lastPurchaseDate || date >= String(item.lastPurchaseDate)) {
        item.price = unitPrice;
        item.lastPurchaseDate = date;
        item.supplier = supplier;
      }
    }

    h.stockAfter = item.stock;
    item.updatedAt = nowStr_();
    item.updatedBy = currentUser_();
    writeRow_(DEF.items, rowNo, item);
    return { item: item, history: [addHistory_(h)] };
  });
}

/**
 * 過去の購入を記録する（今の在庫は変えない）
 * p：{ date（yyyy-MM-dd または yyyy）, qty（省略時は1）, unitPrice, supplier, memo }
 */
function addPastPurchase(id, p) {
  return withLock_(() => {
    const rowNo = findRow_(DEF.items, id);
    if (rowNo < 0) throw new Error('この資材は、ほかの人がすでに削除しています。');
    const item = readRow_(DEF.items, rowNo);
    const date = cleanDate_(p.date, true);
    if (!date) throw new Error('購入日（または年）を入力してください。');
    const unitPrice = toNum_(p.unitPrice, null);
    if (unitPrice === null || unitPrice < 0) throw new Error('購入単価を入力してください。');
    const qty = toNum_(p.qty, 1) > 0 ? toNum_(p.qty, 1) : 1;

    const h = addHistory_(Object.assign(itemRef_(item), {
      type: '過去の購入', date: date, qty: qty, stockAfter: item.stock, unitPrice: unitPrice,
      amount: Math.round(unitPrice * qty), supplier: cleanText_(p.supplier, 100), memo: cleanText_(p.memo, 500),
    }));

    // 日付がわかっていて、いちばん新しい購入なら単価を更新する
    let changed = false;
    if (date.length === 10 && (!item.lastPurchaseDate || date > String(item.lastPurchaseDate))) {
      item.price = unitPrice;
      item.lastPurchaseDate = date;
      changed = true;
    }
    if (changed) {
      item.updatedAt = nowStr_();
      item.updatedBy = currentUser_();
      writeRow_(DEF.items, rowNo, item);
    }
    return { item: item, history: [h] };
  });
}

/**
 * 記録を取り消す（記録は消さずに「取消済み」にする）
 * 入庫・出庫・調整の場合は在庫を元に戻す
 */
function cancelHistory(historyId) {
  return withLock_(() => {
    const hRow = findRow_(DEF.history, historyId);
    if (hRow < 0) throw new Error('記録が見つかりません。');
    const target = readRow_(DEF.history, hRow);
    if (CANCELABLE_TYPES.indexOf(target.type) < 0) throw new Error('この記録は取り消せません。');
    if (target.cancelled === true) throw new Error('この記録はすでに取り消されています。');

    target.cancelled = true;
    writeRow_(DEF.history, hRow, target);

    let item = null;
    const iRow = findRow_(DEF.items, target.itemId);
    if (iRow >= 0) {
      item = readRow_(DEF.items, iRow);
      if (target.type !== '過去の購入') {
        item.stock = Math.max(0, (Number(item.stock) || 0) - (Number(target.qty) || 0));
      }
      // 購入を取り消したときは、残っている最新の購入から単価を計算し直す
      if (PURCHASE_TYPES.indexOf(target.type) >= 0) {
        const latest = readAll_(DEF.history)
          .filter((h) => h.itemId === item.id && PURCHASE_TYPES.indexOf(h.type) >= 0 && h.cancelled !== true
            && String(h.date).length === 10)
          .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.timestamp).localeCompare(String(b.timestamp)))
          .pop();
        item.lastPurchaseDate = latest ? latest.date : '';
        if (latest) item.price = latest.unitPrice;
      }
      item.updatedAt = nowStr_();
      item.updatedBy = currentUser_();
      writeRow_(DEF.items, iRow, item);
    }

    const h = addHistory_({
      itemId: target.itemId, itemName: target.itemName, category: target.category, type: '取消',
      qty: target.type === '過去の購入' ? '' : -(Number(target.qty) || 0),
      stockAfter: item ? item.stock : '', refId: target.id,
      memo: target.type + '（' + target.date + '）を取り消し',
    });
    return { item: item, history: [target, h] };
  });
}

// ===== 取扱説明書（PDF・画像） =====

const MANUAL_FOLDER_NAME = '資材ノート_取扱説明書';
const MANUAL_MAX_BYTES = 20 * 1024 * 1024; // 1ファイル20MBまで

/**
 * 説明書を保存するドライブのフォルダ
 * create が true で、まだなければ作る（作るのは所有者だけ。スプレッドシートと同じ場所に作る）
 */
function manualFolder_(create) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('MANUAL_FOLDER_ID');
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      if (!create) throw new Error('説明書の保存フォルダを開けません。所有者に、フォルダの共有を確認してもらってください。');
    }
  }
  if (!create || !isOwner_()) {
    throw new Error('説明書の保存フォルダがまだありません。所有者が一度アプリを開くと使えるようになります。');
  }
  const parents = DriveApp.getFileById(getSs_().getId()).getParents();
  const folder = parents.hasNext() ? parents.next().createFolder(MANUAL_FOLDER_NAME) : DriveApp.createFolder(MANUAL_FOLDER_NAME);
  props.setProperty('MANUAL_FOLDER_ID', folder.getId());
  return folder;
}

// スプレッドシートの編集者（家族）を、説明書フォルダの編集者にもそろえる（1時間に1回まで）
function syncManualSharing_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('MANUAL_SHARING_SYNCED')) return;
  const folder = manualFolder_(false);
  const current = folder.getEditors().map((u) => u.getEmail());
  const me = currentUser_();
  const missing = getSs_().getEditors().map((u) => u.getEmail()).filter((e) => e && e !== me && current.indexOf(e) < 0);
  if (missing.length) folder.addEditors(missing);
  cache.put('MANUAL_SHARING_SYNCED', '1', 3600);
}

/**
 * 説明書を登録する
 * p：{ itemId, title, fileName, mimeType, base64 }
 */
function uploadManual(p) {
  const mime = cleanText_(p.mimeType, 100);
  if (mime !== 'application/pdf' && mime.indexOf('image/') !== 0) {
    throw new Error('登録できるのはPDFと画像のファイルだけです。');
  }
  const bytes = Utilities.base64Decode(String(p.base64 || ''));
  if (!bytes.length) throw new Error('ファイルが空です。');
  if (bytes.length > MANUAL_MAX_BYTES) throw new Error('ファイルが大きすぎます（20MBまで）。');

  const iRow = findRow_(DEF.items, p.itemId);
  if (iRow < 0) throw new Error('この資材は、ほかの人がすでに削除しています。');
  const item = readRow_(DEF.items, iRow);

  // ファイルの保存はロックの外で行う（時間がかかるため）
  const fileName = cleanText_(p.fileName, 150) || 'file';
  const title = cleanText_(p.title, 100) || fileName.replace(/\.[^.]+$/, '');
  const file = manualFolder_(isOwner_()).createFile(Utilities.newBlob(bytes, mime, item.name + '_' + fileName));
  file.setDescription(APP_TITLE + '：' + item.name + '（' + title + '）');

  const manual = {
    id: newId_(), itemId: item.id, itemName: item.name, title: title, fileId: file.getId(), fileName: fileName,
    mimeType: mime, size: bytes.length, url: file.getUrl(), uploadedAt: nowStr_(), uploadedBy: currentUser_(),
  };
  withLock_(() => append_(DEF.manuals, manual));
  return { manual: manual };
}

function renameManual(id, title) {
  return withLock_(() => {
    const row = findRow_(DEF.manuals, id);
    if (row < 0) throw new Error('説明書が見つかりません。');
    const manual = readRow_(DEF.manuals, row);
    manual.title = cleanText_(title, 100) || manual.title;
    writeRow_(DEF.manuals, row, manual);
    return { manual: manual };
  });
}

// 説明書を削除する（ドライブのファイルはゴミ箱へ。30日以内なら元に戻せる）
function deleteManual(id) {
  return withLock_(() => {
    const row = findRow_(DEF.manuals, id);
    if (row < 0) return { deletedManualId: id };
    const manual = readRow_(DEF.manuals, row);
    let message = '';
    try {
      DriveApp.getFileById(manual.fileId).setTrashed(true);
    } catch (e) {
      // ほかの人が登録したファイルは、その人しかゴミ箱に移せないことがある
      message = 'ファイル自体はドライブに残っています（登録した人か所有者が削除できます）。';
    }
    sheet_(DEF.manuals).deleteRow(row);
    return { deletedManualId: id, message: message };
  });
}

// ===== カテゴリ管理 =====

function categoryResult_() {
  return { categories: readAll_(DEF.categories), items: readAll_(DEF.items) };
}

function addCategory(name) {
  return withLock_(() => {
    const n = cleanText_(name, 30);
    if (!n) throw new Error('カテゴリ名を入力してください。');
    const list = readAll_(DEF.categories);
    if (list.some((c) => c.name === n)) throw new Error('「' + n + '」はすでにあります。');
    list.push({ name: n, publicRef: 'idx:農業生産資材総合' });
    writeAll_(DEF.categories, list);
    return categoryResult_();
  });
}

function deleteCategory(name) {
  return withLock_(() => {
    const list = readAll_(DEF.categories);
    if (list.length <= 1) throw new Error('カテゴリは最低1つ必要です。');
    const used = readAll_(DEF.items).filter((i) => i.category === name).length;
    if (used > 0) {
      throw new Error('このカテゴリの資材が' + used + '件あります。先に別のカテゴリへ変更してください。');
    }
    writeAll_(DEF.categories, list.filter((c) => c.name !== name));
    return categoryResult_();
  });
}

function renameCategory(oldName, newName) {
  return withLock_(() => {
    const n = cleanText_(newName, 30);
    if (!n) throw new Error('カテゴリ名を入力してください。');
    const list = readAll_(DEF.categories);
    if (n !== oldName && list.some((c) => c.name === n)) throw new Error('「' + n + '」はすでにあります。');
    list.forEach((c) => { if (c.name === oldName) c.name = n; });
    writeAll_(DEF.categories, list);

    // そのカテゴリの資材にも反映する
    const items = readAll_(DEF.items);
    let changed = false;
    items.forEach((i) => {
      if (i.category === oldName) {
        i.category = n;
        changed = true;
      }
    });
    if (changed) writeAll_(DEF.items, items);
    return categoryResult_();
  });
}

function moveCategory(name, direction) {
  return withLock_(() => {
    const list = readAll_(DEF.categories);
    const i = list.findIndex((c) => c.name === name);
    const j = i + (direction < 0 ? -1 : 1);
    if (i >= 0 && j >= 0 && j < list.length) {
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
      writeAll_(DEF.categories, list);
    }
    return categoryResult_();
  });
}

function setCategoryPublic(name, ref) {
  return withLock_(() => {
    const list = readAll_(DEF.categories);
    list.forEach((c) => { if (c.name === name) c.publicRef = cleanText_(ref, 300); });
    writeAll_(DEF.categories, list);
    return categoryResult_();
  });
}

// ===== 設定の変更 =====

// 注意表示のしきい値（誰でも変更できる）
function saveThresholds(p) {
  return withLock_(() => saveSettings_({
    alertDays: Math.max(1, Math.round(toNum_(p.alertDays, 30))),
    priceAlertPct: Math.max(0, toNum_(p.priceAlertPct, 10)),
    gapAlertPts: Math.max(0, toNum_(p.gapAlertPts, 5)),
  }));
}

// 自分の表示名
function setMyName(name) {
  return withLock_(() => {
    const settings = getSettings_();
    const names = Object.assign({}, settings.userNames);
    const n = cleanText_(name, 20);
    if (n) names[currentUser_()] = n;
    else delete names[currentUser_()];
    return saveSettings_({ userNames: names });
  });
}

// メール通知と公的データの自動取得（所有者のみ）
function saveNotifySettings(p) {
  requireOwner_();
  return withLock_(() => {
    const settings = saveSettings_({
      notifyEnabled: !!p.notifyEnabled,
      notifyHour: Math.min(23, Math.max(0, Math.round(toNum_(p.notifyHour, 7)))),
      publicAutoFetch: !!p.publicAutoFetch,
      publicNotify: !!p.publicNotify,
      publicSourceUrl: cleanText_(p.publicSourceUrl, 500),
    });

    // いったんトリガーを全部消してから作り直す
    ScriptApp.getProjectTriggers().forEach((t) => {
      const fn = t.getHandlerFunction();
      if (fn === 'runDailyNotify' || fn === 'runPublicFetch') ScriptApp.deleteTrigger(t);
    });
    if (settings.notifyEnabled) {
      ScriptApp.newTrigger('runDailyNotify').timeBased().everyDays(1).atHour(settings.notifyHour).inTimezone(TZ).create();
    }
    if (settings.publicAutoFetch) {
      [1, 15].forEach((day) => {
        ScriptApp.newTrigger('runPublicFetch').timeBased().onMonthDay(day).atHour(6).inTimezone(TZ).create();
      });
    }
    return settings;
  });
}

// ===== メール通知 =====

function recipients_() {
  const ss = getSs_();
  const list = [];
  const owner = ss.getOwner();
  if (owner) list.push(owner.getEmail());
  ss.getEditors().forEach((u) => list.push(u.getEmail()));
  return list.filter((e, i) => e && list.indexOf(e) === i);
}

// 毎日の通知（トリガーから実行される）
function runDailyNotify() {
  const settings = getSettings_();
  if (!settings.notifyEnabled) return;

  const today = today_();
  const limit = Utilities.formatDate(new Date(Date.now() + settings.alertDays * 86400000), TZ, 'yyyy-MM-dd');
  const lines = { order: [], expiry: [] };

  readAll_(DEF.items).forEach((item) => {
    const stock = Number(item.stock) || 0;
    const unit = item.unit || '';
    if (stock <= 0) {
      lines.order.push('・' + item.name + '：在庫切れ');
    } else if (item.reorderLevel !== '' && stock <= Number(item.reorderLevel)) {
      lines.order.push('・' + item.name + '：残り' + stock + unit + '（目安 ' + item.reorderLevel + unit + '）');
    }
    if (item.expiry) {
      if (item.expiry < today) lines.expiry.push('・' + item.name + '：期限切れ（' + item.expiry + '）');
      else if (item.expiry <= limit) lines.expiry.push('・' + item.name + '：期限間近（' + item.expiry + '）');
    }
  });
  if (!lines.order.length && !lines.expiry.length) return;

  let body = APP_TITLE + 'からのお知らせです。\n\n';
  if (lines.order.length) body += '■ 発注が必要な資材\n' + lines.order.join('\n') + '\n\n';
  if (lines.expiry.length) body += '■ 使用期限に注意が必要な資材\n' + lines.expiry.join('\n') + '\n\n';
  body += 'アプリを開く：' + ScriptApp.getService().getUrl() + '\n';

  MailApp.sendEmail({
    to: recipients_().join(','),
    subject: '【' + APP_TITLE + '】注意が必要な資材が' + (lines.order.length + lines.expiry.length) + '件あります',
    body: body,
  });
}

// ===== 公的データ（農業物価統計）の取得 =====

function readPublic_() {
  return readAll_(DEF.publicData).map((p) => {
    let data = {};
    let prov = [];
    try { data = JSON.parse(p.data || '{}'); } catch (e) { /* 壊れていたら空にする */ }
    try { prov = JSON.parse(p.prov || '[]'); } catch (e) { /* 同上 */ }
    return { key: p.key, kind: p.kind, group: p.group, name: p.name, spec: p.spec, unit: p.unit, data: data, prov: prov };
  });
}

// 画面の「今すぐ取得」ボタンから呼ばれる
function fetchPublicNow() {
  const result = fetchPublicCore_();
  return { ok: result.ok, message: result.message, publicData: readPublic_(), settings: getSettings_() };
}

// 自動取得（トリガーから実行される）
function runPublicFetch() {
  fetchPublicCore_();
}

function fetchPublicCore_() {
  const before = getSettings_();
  try {
    const url = before.publicSourceUrl || findLatestFileUrl_();
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) throw new Error('Excelファイルを取得できませんでした（HTTP ' + res.getResponseCode() + '）。');

    const book = readXlsx_(res.getBlob(), [/^2\(1\).*指数/, /^2\(3\)/]);
    const idxGrid = book[0];
    const itemGrid = book[1];
    if (!idxGrid || !itemGrid) throw new Error('Excelファイルの中に、農業生産資材の表が見つかりませんでした。');

    const series = extractSeries_(idxGrid, 'idx').concat(extractSeries_(itemGrid, 'item'));
    if (!series.length) throw new Error('データを読み取れませんでした。');

    const latest = series.reduce((max, s) => {
      const keys = Object.keys(s.data).sort();
      return keys.length && keys[keys.length - 1] > max ? keys[keys.length - 1] : max;
    }, '');

    withLock_(() => {
      writeAll_(DEF.publicData, series.map((s) => ({
        key: s.key, kind: s.kind, group: s.group, name: s.name, spec: s.spec, unit: s.unit,
        data: JSON.stringify(s.data), prov: JSON.stringify(s.prov),
      })));
      saveSettings_({ publicLastFetch: nowStr_().slice(0, 16), publicLastStatus: '成功', publicLatestPeriod: latest });
    });

    // 新しい月のデータが入ったらメールで知らせる
    if (before.publicNotify && before.publicLatestPeriod && latest > before.publicLatestPeriod) {
      sendPublicNotify_(series, latest);
    }
    return { ok: true, message: latest + '分までのデータを取得しました。' };
  } catch (e) {
    withLock_(() => saveSettings_({ publicLastFetch: nowStr_().slice(0, 16), publicLastStatus: '失敗：' + e.message }));
    return { ok: false, message: e.message };
  }
}

// 農林水産省のページから、最新の「機械判読用」Excelのリンクを探す
function findLatestFileUrl_() {
  const html = UrlFetchApp.fetch(MAFF_PAGE_URL).getContentText('UTF-8');
  const m = html.match(/機械判読用[\s\S]{0,300}?href="([^"]*sinfid=\d+[^"]*)"/);
  if (!m) throw new Error('農林水産省のページで、機械判読用のExcelファイルが見つかりませんでした。');
  return m[1].replace(/&amp;/g, '&');
}

// 列の記号（A, B, …, AA）を番号にする
function colIndex_(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n;
}

/**
 * xlsxファイルを読み、名前が patterns に合うシートを表（行番号 → {列記号: 値}）にして返す
 * xlsxの中身はzipに入ったXMLなので、Googleドライブを使わずに直接読む
 */
function readXlsx_(blob, patterns) {
  const files = {};
  Utilities.unzip(blob.setContentType('application/zip')).forEach((f) => { files[f.getName()] = f; });
  const text = (name) => (files[name] ? files[name].getDataAsString('UTF-8') : '');
  const ns = XmlService.getNamespace('http://schemas.openxmlformats.org/spreadsheetml/2006/main');
  const relNs = XmlService.getNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');

  // 共有文字列（ふりがなは除く）
  const shared = [];
  const ssXml = text('xl/sharedStrings.xml');
  if (ssXml) {
    XmlService.parse(ssXml).getRootElement().getChildren('si', ns).forEach((si) => {
      let s = '';
      const t = si.getChild('t', ns);
      if (t) s = t.getText();
      si.getChildren('r', ns).forEach((r) => {
        const rt = r.getChild('t', ns);
        if (rt) s += rt.getText();
      });
      shared.push(s);
    });
  }

  // シート名 → ファイルの場所
  const relMap = {};
  XmlService.parse(text('xl/_rels/workbook.xml.rels')).getRootElement().getChildren().forEach((r) => {
    relMap[r.getAttribute('Id').getValue()] = r.getAttribute('Target').getValue();
  });
  const sheets = XmlService.parse(text('xl/workbook.xml')).getRootElement()
    .getChild('sheets', ns).getChildren('sheet', ns)
    .map((s) => {
      const target = relMap[s.getAttribute('id', relNs).getValue()] || '';
      return { name: s.getAttribute('name').getValue(), path: target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target };
    });

  return patterns.map((pattern) => {
    const sheet = sheets.find((s) => pattern.test(s.name));
    if (!sheet || !files[sheet.path]) return null;
    const grid = {};
    const sheetData = XmlService.parse(text(sheet.path)).getRootElement().getChild('sheetData', ns);
    sheetData.getChildren('row', ns).forEach((row) => {
      const rowNo = Number(row.getAttribute('r').getValue());
      const cells = {};
      row.getChildren('c', ns).forEach((c) => {
        const ref = c.getAttribute('r').getValue();
        const col = ref.replace(/\d+/g, '');
        const type = c.getAttribute('t') ? c.getAttribute('t').getValue() : '';
        const v = c.getChild('v', ns);
        let value = '';
        if (type === 's' && v) value = shared[Number(v.getText())] || '';
        else if (type === 'inlineStr') {
          const is = c.getChild('is', ns);
          const t = is ? is.getChild('t', ns) : null;
          value = t ? t.getText() : '';
        } else if (v) value = v.getText();
        cells[col] = value;
      });
      grid[rowNo] = cells;
    });
    return grid;
  });
}

/**
 * 表から月別の系列を取り出す
 * 表の形：見出し行（階層・名称・銘柄等級・単位）のあとに、A列「概数／確定」、B列「月／年平均」、E列「2026年8月」の行が続く
 */
function extractSeries_(grid, kind) {
  const rowNos = Object.keys(grid).map(Number).sort((a, b) => a - b);
  const cell = (r, c) => String((grid[r] || {})[c] || '');
  const findRow = (test) => rowNos.find(test);

  const levelRow = findRow((r) => cell(r, 'F').indexOf('階層') === 0);
  const specRow = findRow((r) => cell(r, 'F').indexOf('銘柄') === 0);
  const unitRow = findRow((r) => cell(r, 'F') === '単位');
  const headRow = findRow((r) => cell(r, 'A').indexOf('概数値') === 0);
  if (!levelRow || !specRow || !unitRow || !headRow) {
    throw new Error('統計表の形式が想定と違うため、読み取れませんでした。');
  }
  const groupRow = levelRow + 2;
  const nameRow = specRow - 1;

  const series = Object.keys(grid[nameRow] || {})
    .filter((c) => colIndex_(c) >= colIndex_('G') && cell(nameRow, c))
    .map((c) => {
      const name = cell(nameRow, c);
      const spec = cell(specRow, c);
      const unit = cell(unitRow, c);
      return {
        col: c, kind: kind, group: cell(groupRow, c), name: name, spec: spec, unit: unit,
        key: kind === 'idx' ? 'idx:' + name : 'item:' + name + '|' + spec + '|' + unit,
        data: {}, prov: [],
      };
    });

  rowNos.filter((r) => r > headRow).forEach((r) => {
    if (cell(r, 'B').indexOf('月') !== 0) return;
    const m = cell(r, 'E').match(/(\d{4})年(\d{1,2})月/);
    if (!m) return;
    const period = m[1] + '-' + ('0' + m[2]).slice(-2);
    if (period < PUBLIC_SINCE) return;
    const provisional = cell(r, 'A').indexOf('概数') === 0;
    series.forEach((s) => {
      const raw = cell(r, s.col);
      const v = Number(raw);
      if (raw !== '' && isFinite(v)) {
        s.data[period] = v;
        if (provisional) s.prov.push(period);
      }
    });
  });

  // 同じキーが重複したら最初のものを使う
  const seen = {};
  return series.filter((s) => {
    if (!Object.keys(s.data).length || seen[s.key]) return false;
    seen[s.key] = true;
    return true;
  });
}

function sendPublicNotify_(series, latest) {
  const names = ['農業生産資材総合', '肥料', '農業薬剤', '諸材料', '光熱動力', '農機具'];
  const y = Number(latest.slice(0, 4));
  const prevPeriod = (y - 1) + latest.slice(4);
  const lines = names.map((n) => {
    const s = series.find((x) => x.key === 'idx:' + n);
    if (!s || !s.data[latest] || !s.data[prevPeriod]) return null;
    const pct = (s.data[latest] / s.data[prevPeriod] - 1) * 100;
    return '・' + n + '：' + s.data[latest] + '（前年同月比 ' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%）';
  }).filter(Boolean);
  if (!lines.length) return;

  MailApp.sendEmail({
    to: recipients_().join(','),
    subject: '【' + APP_TITLE + '】農業物価指数（' + latest + '）が公表されました',
    body: '農林水産省「農業物価統計調査」の農業生産資材価格指数（2020年＝100）が更新されました。\n\n'
      + lines.join('\n') + '\n\n※ 最新の値は速報値（概数値）です。\n\n'
      + 'アプリを開く：' + ScriptApp.getService().getUrl() + '\n',
  });
}
