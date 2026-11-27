// 関西イベントガイド アカウント同期の入口プログラム
// 設置先: アカウント用スプレッドシート（非公開）の「拡張機能 → Apps Script」
// 役割: サイトからの読み書きを、鍵（またはGoogleログインのトークン）が
//       合った行だけに限定して仲介する。一覧を返す操作は無い。
// 2026-11-25 改訂: 読み取りはロックを取らない。書き込みも、トークン検証
// （外部通信）を済ませてから短くロックする。全リクエストを1つのロックで
// 直列化していた旧版は、遅い応答があると後続が全てタイムアウトして
// 詰まることが実地で確認されたため。
var PROJECT_ID = 'kansai-event-guide';
var SHEET_NAME = 'kv';
var MAX_VALUE = 900000;
// 管理者（ガイド運営）の Google アカウントのメールアドレスのハッシュ。
// サイト側 account.js の ADMIN_EMAIL_HASH と同じ値。タブストアへの
// 書き込み（storeset）は、このハッシュに一致するログインだけ許可する。
var ADMIN_EMAIL_HASH = '57214438aece9c683a3ab3120651fe8828ae6230cf855af1acbca324d37b26a3';
var STORE_KEY = 'store:tabs';
// Firebase ウェブ API キー（サイト側 account-config.js と同じ公開キー）。
// トークン検証を tokeninfo から Firebase Auth 本体の照会へ切り替えるために使う。
var FIREBASE_API_KEY = 'AIzaSyAeqWGn1jg4LpErCcxA8ERqgMF9F0AFxpA';

function doGet() {
  return ContentService.createTextOutput('kg-account-sync endpoint ok');
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var op = String(req.op || '');
    var key = String(req.key || '');
    // タブストア（2026-11-28）: 読み取りは公開、書き換えは管理者だけ。
    // 通常の鍵チェックとは別系統で処理する
    if (op === 'storeget') {
      var sh0 = sheet_();
      var sv = getVal_(sh0, findRow_(sh0, STORE_KEY));
      return json_({ ok: true, found: sv !== null, value: sv });
    }
    if (op === 'storeset') {
      var token0 = String(req.token || '');
      if (!token0) throw new Error('token required');
      var gu = verifyGoogleUser_(token0);
      if (!gu || !gu.email) throw new Error('invalid token');
      if (sha256hex_(String(gu.email).trim().toLowerCase()) !== ADMIN_EMAIL_HASH) throw new Error('not admin');
      var val0 = req.value || {};
      if (!val0.tabs || Object.prototype.toString.call(val0.tabs) !== '[object Array]') throw new Error('bad value');
      if (val0.tabs.length > 100) throw new Error('too many tabs');
      var lockS = LockService.getScriptLock();
      lockS.waitLock(15000);
      try {
        var sh1 = sheet_();
        setVal_(sh1, findRow_(sh1, STORE_KEY), STORE_KEY, { tabs: val0.tabs, updatedAt: Date.now() });
        return json_({ ok: true });
      } finally {
        lockS.releaseLock();
      }
    }
    // 鍵チェック（g: はトークン検証＝外部通信を含む）はロックの外で先に行う
    checkKey_(req, key);
    if (op === 'get') {
      // 読み取りはロックなし（書き込みと競合しても行単位の読みで足りる）
      var sh = sheet_();
      var v = getVal_(sh, findRow_(sh, key));
      return json_({ ok: true, found: v !== null, value: v });
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      return json_(handleWrite_(req, key));
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, 3).setValues([['key', 'json', 'updatedAt']]);
  }
  return sh;
}

function findRow_(sh, key) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var keys = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i][0] === key) return i + 2;
  }
  return -1;
}

// 値の読み書き（2026-11-28 改訂）: スプレッドシートのセルは1つ最大
// 50,000文字までしか入らない。従来はアカウント文書の JSON 全体を
// B列の1セルに書いていたため、文書が 50,000文字を超えた利用者は
// 書き込みが恒常的に失敗していた（お気に入り等の小さい更新は通るのに、
// 「気になる」「行きたい」を含む大きな userdata が書き込めない症状）。
// 対策として JSON を 45,000文字ごとに分割し、B列→D列→E列…へ
// 並べる（C列は updatedAt のまま）。旧形式（B列のみ）の行もそのまま読める。
var CHUNK_LEN = 45000;

function getVal_(sh, row) {
  if (row < 0) return null;
  var ncols = Math.max(sh.getMaxColumns(), 3);
  var cells = sh.getRange(row, 1, 1, ncols).getValues()[0];
  var s = cells[1] ? String(cells[1]) : '';
  if (!s) return null;
  for (var i = 3; i < cells.length; i++) {
    if (!cells[i]) break;
    s += String(cells[i]);
  }
  try { return JSON.parse(s); } catch (e) { return null; }
}

function setVal_(sh, row, key, obj) {
  var s = JSON.stringify(obj);
  if (s.length > MAX_VALUE) throw new Error('value too large');
  var pieces = [];
  for (var i = 0; i < s.length; i += CHUNK_LEN) pieces.push(s.slice(i, i + CHUNK_LEN));
  if (!pieces.length) pieces.push('');
  var ts = new Date().toISOString();
  var needCols = pieces.length + 3; // A=key, B=piece0, C=updatedAt, D以降=続き
  if (sh.getMaxColumns() < needCols) sh.insertColumnsAfter(sh.getMaxColumns(), needCols - sh.getMaxColumns());
  if (row < 0) {
    var arr = [key, pieces[0], ts];
    for (var j = 1; j < pieces.length; j++) arr.push(pieces[j]);
    sh.appendRow(arr);
  } else {
    // 行全体を書き直し、縮んだ場合の残骸セルも空で消す
    var width = Math.max(sh.getMaxColumns(), needCols);
    var out = [];
    for (var k = 0; k < width; k++) out.push('');
    out[0] = key; out[1] = pieces[0]; out[2] = ts;
    for (var m = 1; m < pieces.length; m++) out[m + 2] = pieces[m];
    sh.getRange(row, 1, 1, width).setValues([out]);
  }
}

function sha256hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

// Google ログインのトークンを検証し、uid を返す。検証できなければ null。
// 2026-11-27 改訂: 従来の tokeninfo 照会が、新しいトークンでも
// 'invalid token' を返す事象が複数端末で続いたため、Firebase Auth 本体の
// 照会（accounts:lookup、このプロジェクトのキーで照会するので発行元も
// 同時に確認できる）を主経路にし、tokeninfo は予備に回した。
function verifyGoogleToken_(token) {
  var u = verifyGoogleUser_(token);
  return u ? u.uid : null;
}

// トークンを検証し、uid とメールアドレスを返す（storeset の管理者照合用）
function verifyGoogleUser_(token) {
  try {
    var resp = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: token }),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() === 200) {
      var body = JSON.parse(resp.getContentText());
      if (body.users && body.users.length && body.users[0].localId) return { uid: String(body.users[0].localId), email: String(body.users[0].email || '') };
    }
  } catch (e) { /* 予備経路へ */ }
  try {
    var r2 = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
    if (r2.getResponseCode() === 200) {
      var claims = JSON.parse(r2.getContentText());
      if (claims.aud === PROJECT_ID && claims.sub) return { uid: String(claims.sub), email: String(claims.email || '') };
    }
  } catch (e2) { /* 検証失敗として扱う */ }
  return null;
}

// 鍵の形式チェック。g: の行は Google ログインのトークン検証も行う。
function checkKey_(req, key) {
  var m = String(key || '').match(/^([mcrg]):([a-f0-9]{64})$/);
  if (!m) throw new Error('bad key');
  if (m[1] === 'g') {
    var token = String(req.token || '');
    if (!token) throw new Error('token required');
    var uid = verifyGoogleToken_(token);
    if (!uid) throw new Error('invalid token');
    if (sha256hex_('kg-google:' + uid) !== m[2]) throw new Error('uid mismatch');
  }
}

// 書き込み系。ロックの中で呼ぶこと（行の再検索もロック内で行う）。
function handleWrite_(req, key) {
  var op = String(req.op || '');
  var sh = sheet_();
  var row = findRow_(sh, key);
  if (op === 'set') {
    setVal_(sh, row, key, req.value || {});
    return { ok: true };
  }
  if (op === 'merge') {
    var cur = getVal_(sh, row) || {};
    var f = req.value || {};
    for (var k in f) cur[k] = f[k];
    setVal_(sh, row, key, cur);
    return { ok: true };
  }
  if (op === 'del') {
    if (row > 0) sh.deleteRow(row);
    return { ok: true };
  }
  if (op === 'favops') {
    // 推し・お気に入りの追加/削除を、ロックの中でまとめて適用する
    var data = getVal_(sh, row) || {};
    var fav = data.favorites || { event: [], artist: [] };
    fav.event = fav.event || [];
    fav.artist = fav.artist || [];
    (req.ops || []).forEach(function (o) {
      var arr = fav[o.kind];
      if (!arr) return;
      var val = String(o.value);
      var i = arr.indexOf(val);
      if (o.op === 'add' && i < 0) arr.push(val);
      if (o.op === 'delete' && i >= 0) arr.splice(i, 1);
    });
    data.favorites = fav;
    data.updatedAt = Date.now();
    setVal_(sh, row, key, data);
    return { ok: true };
  }
  throw new Error('unknown op');
}
