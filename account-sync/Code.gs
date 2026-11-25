// 関西イベントガイド アカウント同期の入口プログラム
// 設置先: アカウント用スプレッドシート（非公開）の「拡張機能 → Apps Script」
// 役割: サイトからの読み書きを、鍵（またはGoogleログインのトークン）が
//       合った行だけに限定して仲介する。一覧を返す操作は無い。
var PROJECT_ID = 'kansai-event-guide';
var SHEET_NAME = 'kv';
var MAX_VALUE = 900000;

function doGet() {
  return ContentService.createTextOutput('kg-account-sync endpoint ok');
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      return json_(handle_(req));
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

function getVal_(sh, row) {
  if (row < 0) return null;
  var s = sh.getRange(row, 2).getValue();
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function setVal_(sh, row, key, obj) {
  var s = JSON.stringify(obj);
  if (s.length > MAX_VALUE) throw new Error('value too large');
  if (row < 0) {
    sh.appendRow([key, s, new Date().toISOString()]);
  } else {
    sh.getRange(row, 2, 1, 2).setValues([[s, new Date().toISOString()]]);
  }
}

function sha256hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

// 鍵の形式チェック。g: の行は Google ログインのトークン検証も行う。
function checkKey_(req, key) {
  var m = String(key || '').match(/^([mcrg]):([a-f0-9]{64})$/);
  if (!m) throw new Error('bad key');
  if (m[1] === 'g') {
    var token = String(req.token || '');
    if (!token) throw new Error('token required');
    var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) throw new Error('invalid token');
    var claims = JSON.parse(resp.getContentText());
    if (claims.aud !== PROJECT_ID) throw new Error('bad aud');
    if (sha256hex_('kg-google:' + claims.sub) !== m[2]) throw new Error('uid mismatch');
  }
}

function handle_(req) {
  var op = String(req.op || '');
  var key = String(req.key || '');
  checkKey_(req, key);
  var sh = sheet_();
  var row = findRow_(sh, key);
  if (op === 'get') {
    var v = getVal_(sh, row);
    return { ok: true, found: v !== null, value: v };
  }
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
