/* 試作サイトの編集入力 — スペース版ガイドのイベント編集フォームに項目・並び・
   入力補助を揃えた版（2026-11-23、Kota指示で統一）。
   送信先は受付メール kansai-event-info@muse.ai（FormSubmit AJAX経由）。
   届いた内容は確認のうえスペース版ガイドへ登録され、シート同期経由で各面に
   反映される。シート events タブはガイド同期で全件上書きされるため、ここから
   直接は書かない。仕様: docs/editor-spec.md
   ペイロードのキー名はスペース版ガイドのイベント項目名に一致させてある。 */
(function () {
  var cfg = window.KG_EDITOR_CONFIG || {};
  function $(id) { return document.getElementById(id); }
  var style = document.createElement('style');
  style.textContent = '#kg-editor{position:fixed;inset:0;margin:auto;height:fit-content;max-width:720px;width:calc(100vw - 20px);max-height:92dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box;padding:14px 16px calc(14px + env(safe-area-inset-bottom))}'
    + '#kg-editor .kg-closebar{position:sticky;top:-14px;z-index:5;text-align:right;background:inherit;margin:-4px -6px 0 0}'
    + '#kg-editor .kg-closebar button{width:44px;height:44px;font-size:18px}'
    + '#kg-editor .kg-sendbar{position:sticky;bottom:calc(-14px - env(safe-area-inset-bottom));z-index:5;background:inherit;padding:10px 0 2px;display:flex;gap:10px;border-top:1px solid #ccc}'
    + '#kg-editor .kg-sendbar button{flex:1;min-height:48px;font-size:15px}'
    + '#kg-editor label{display:block;font-size:13px;margin-top:10px}'
    + '#kg-editor input,#kg-editor select,#kg-editor textarea{width:100%;box-sizing:border-box;padding:6px;margin-top:2px}'
    + '#kg-editor textarea{min-height:52px}'
    + '#kg-editor h3{font-size:14px;margin:20px 0 2px;border-bottom:1px solid #ccc;padding-bottom:2px}'
    + '#kg-editor .row2{display:flex;gap:10px}#kg-editor .row2>label{flex:1}'
    + '#kg-editor .ttrow{display:flex;gap:6px;margin-top:6px;align-items:flex-start}'
    + '#kg-editor .ttrow input{margin-top:0}#kg-editor .tt-time{flex:0 0 118px}#kg-editor .tt-stage{flex:0 0 110px}'
    + '#kg-editor .tt-label{flex:0 0 92px}#kg-editor .tt-text{flex:1}#kg-editor .tt-del{flex:0 0 34px}'
    + '#kg-editor .chk{display:flex;gap:6px;align-items:center;font-size:13px;margin-top:10px}'
    + '#kg-editor .chk input{width:auto;margin:0}'
    + '#kg-editor .mini{font-size:12px;color:#666;margin-top:2px}';
  document.head.appendChild(style);
  var dlg = document.createElement('dialog');
  dlg.id = 'kg-editor';
  function field(label, inner) { return '<label>' + label + inner + '</label>'; }
  function sec(t) { return '<h3>' + t + '</h3>'; }
  dlg.innerHTML = '<form method="dialog" class="kg-closebar"><button value="close" aria-label="閉じる">×</button></form>' +
    '<h2 style="margin-top:0">イベントの新規登録・修正</h2>' +
    '<p style="font-size:13px">スペース版ガイドと同じ項目・並びのフォームです。送信内容は受付に届き、確認のうえスペース版ガイドへ登録・反映されます。</p>' +
    '<p id="kg-editor-status" role="status"></p>' +
    sec('種別') +
    field('種別', '<select id="ke-kind"><option value="new">新規登録</option><option value="edit">修正</option></select>') +
    field('対象イベントID（修正のとき）', '<input id="ke-target" type="text" inputmode="numeric">') +
    '<p><button id="ke-load" type="button">現在の内容を読み込む（修正のとき）</button></p>' +
    '<p class="mini">修正のときは、読み込むとこのサイトが表示中のデータで各欄が埋まります。そこから直して送信してください。</p>' +
    sec('テキスト貼り付け取り込み') +
    field('告知文を貼り付け', '<textarea id="ke-paste" placeholder="フライヤーや告知の文章を貼ると、日付・時刻・URLなどを各欄へ振り分けます"></textarea>') +
    '<p><button id="ke-paste-btn" type="button">各欄へ取り込む</button></p>' +
    sec('基本情報') +
    field('タイトル（必須）※公式名そのまま', '<input id="ke-title" type="text" maxlength="200">') +
    '<div class="row2">' +
    field('日付（必須）', '<input id="ke-date" type="date">') +
    field('終了日（複数日のとき）', '<input id="ke-dateend" type="date">') +
    '</div>' +
    field('時刻ラベル（例：開場12:00／開演12:30）', '<input id="ke-time" type="text">') +
    '<div class="row2">' +
    field('開始時刻', '<input id="ke-start" type="time">') +
    field('終了時刻', '<input id="ke-end" type="time">') +
    '</div>' +
    sec('会場') +
    field('会場（正式名称＋自治体。例：エスタシオンホール（和歌山市））', '<input id="ke-venue" type="text">') +
    field('追加会場（1行に1会場、複数会場のとき）', '<textarea id="ke-venues"></textarea>') +
    field('会場補足（会場内のスペース・階など）', '<input id="ke-venuespace" type="text">') +
    '<div class="row2">' +
    field('府県', '<select id="ke-pref"><option>大阪府</option><option>京都府</option><option>兵庫県</option><option>滋賀県</option><option>奈良県</option><option>和歌山県</option></select>') +
    field('エリア（市区町村）', '<input id="ke-area" type="text">') +
    '</div>' +
    sec('カテゴリ') +
    field('カテゴリ', '<input id="ke-category" type="text">') +
    field('追加カテゴリ（1行に1つ）', '<textarea id="ke-categories"></textarea>') +
    field('サブカテゴリ（1行に1つ）', '<textarea id="ke-subcategories"></textarea>') +
    sec('料金') +
    field('料金（例：前売 3,500円／当日 4,000円（ドリンク代別））', '<input id="ke-price" type="text">') +
    field('料金区分（ガイド側の自動判定の目安）', '<select id="ke-priceclass"><option value="">不明</option><option value="free">無料</option><option value="paid">有料</option><option value="partial">一部無料</option></select>') +
    sec('出演者') +
    field('出演者（1行に1組。まとめて貼って「一括分割」も使えます）', '<textarea id="ke-performers"></textarea>') +
    '<p><button id="ke-split" type="button">一括分割（、・／などで区切る）</button></p>' +
    '<div id="ke-perf-preview" class="mini"></div>' +
    sec('タイムテーブル') +
    '<div id="ke-tt"></div>' +
    '<p><button id="ke-tt-add" type="button">＋ 行を追加</button></p>' +
    '<p class="mini">時刻／ステージ／区分（開場・開演・終演など）／内容・出演者の順で1行ずつ。ステージが違うだけでは公演を分けず、この表にステージ別で書きます。</p>' +
    sec('説明') +
    field('説明文', '<textarea id="ke-desc"></textarea>') +
    sec('主催') +
    field('主催者名', '<input id="ke-organizer" type="text">') +
    field('主催 公式サイト', '<input id="ke-orgweb" type="url">') +
    field('主催 X', '<input id="ke-orgx" type="url">') +
    field('主催 Instagram', '<input id="ke-orgig" type="url">') +
    sec('リンク') +
    field('公式サイト', '<input id="ke-linkweb" type="url">') +
    field('チケット販売', '<input id="ke-ticket" type="url">') +
    field('X', '<input id="ke-linkx" type="url">') +
    field('Instagram', '<input id="ke-linkig" type="url">') +
    sec('画像') +
    field('画像URL（1行に1つ、最大8件。並び順＝表示順。公式フライヤーの原寸URL）', '<textarea id="ke-images"></textarea>') +
    sec('その他') +
    '<label class="chk"><input id="ke-collab" type="checkbox"> コラボカフェ</label>' +
    '<label class="chk"><input id="ke-closed" type="checkbox"> 詳細は確定（これ以上の詳細なし）</label>' +
    field('情報源', '<select id="ke-source"><option value="primary">一次情報</option><option value="summary">まとめ情報</option><option value="unconfirmed">未確認</option></select>') +
    field('写真メモ', '<input id="ke-photonote" type="text">') +
    field('備考', '<textarea id="ke-notes"></textarea>') +
    '<div class="kg-sendbar"><button id="ke-send" type="button">送信する</button><button id="ke-cancel" type="button">閉じる</button></div>';
  document.body.appendChild(dlg);
  function status(t) { $('kg-editor-status').textContent = t; }
  function lines(id) { return $(id).value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
  function setLines(id, arr) { $(id).value = (arr || []).join('\n'); }
  /* ---------- タイムテーブル構造化編集 ---------- */
  var ttBox = $('ke-tt');
  function ttRow(data) {
    data = data || {};
    var row = document.createElement('div');
    row.className = 'ttrow';
    row.innerHTML = '<input class="tt-time" type="text" placeholder="時刻 12:30" value="">'
      + '<input class="tt-stage" type="text" placeholder="ステージ" value="">'
      + '<select class="tt-label"><option value="">区分なし</option><option>開場</option><option>開演</option><option>終演</option><option>物販</option><option>特典会</option><option>その他</option></select>'
      + '<input class="tt-text" type="text" placeholder="内容・出演者" value="">'
      + '<button type="button" class="tt-del" aria-label="行を削除">×</button>';
    row.querySelector('.tt-time').value = data.time || '';
    row.querySelector('.tt-stage').value = data.stage || '';
    if (data.label) row.querySelector('.tt-label').value = data.label;
    row.querySelector('.tt-text').value = data.text || data.performer || '';
    row.querySelector('.tt-del').onclick = function () { row.remove(); };
    ttBox.appendChild(row);
    return row;
  }
  function ttRows() {
    var out = [];
    ttBox.querySelectorAll('.ttrow').forEach(function (row) {
      var r = {
        time: row.querySelector('.tt-time').value.trim(),
        stage: row.querySelector('.tt-stage').value.trim(),
        label: row.querySelector('.tt-label').value,
        text: row.querySelector('.tt-text').value.trim()
      };
      if (r.time || r.stage || r.label || r.text) out.push(r);
    });
    return out;
  }
  $('ke-tt-add').onclick = function () { ttRow(); };
  ttRow();
  /* ---------- 出演者の一括分割（分割禁止の名前はそのまま） ---------- */
  var NEVER_SPLIT = ['ジョニー・デッパ', 'と、いうわけで', '君に、胸キュン。', 'mofu/mofu'];
  function splitPerformers(text) {
    var work = String(text || ''), hold = [];
    NEVER_SPLIT.forEach(function (name, i) {
      if (work.indexOf(name) >= 0) { work = work.split(name).join('\u0001' + i + '\u0002'); hold[i] = name; }
    });
    var parts = work.split(/[\n、,・\/／&＆×xX]/).map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.map(function (s) {
      return s.replace(/\u0001(\d+)\u0002/g, function (_, i) { return hold[+i] || ''; });
    });
  }
  function perfList() {
    var raw = $('ke-performers').value;
    var byLine = raw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    return byLine.length > 1 || raw.indexOf('\n') >= 0 ? byLine : splitPerformers(raw);
  }
  function perfPreview() {
    var list = perfList();
    $('ke-perf-preview').textContent = list.length ? '出演者 ' + list.length + '組：' + list.join(' / ') : '';
  }
  $('ke-performers').addEventListener('input', perfPreview);
  $('ke-split').onclick = function () {
    var list = splitPerformers($('ke-performers').value);
    setLines('ke-performers', list);
    perfPreview();
  };
  /* ---------- テキスト貼り付け取り込み ---------- */
  $('ke-paste-btn').onclick = function () {
    var text = $('ke-paste').value;
    if (!text.trim()) { status('貼り付け欄が空です。'); return; }
    var dm = text.match(/(20\d{2})[年\/\-](\d{1,2})[月\/\-](\d{1,2})日?/);
    if (dm) $('ke-date').value = dm[1] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[3]).slice(-2);
    var tm = text.match(/開場\s*(\d{1,2}:\d{2})/), sm = text.match(/開演\s*(\d{1,2}:\d{2})/), em = text.match(/終演\s*(\d{1,2}:\d{2})/);
    var label = [];
    if (tm) { label.push('開場' + tm[1]); $('ke-start').value = tm[1].length === 4 ? '0' + tm[1] : tm[1]; }
    if (sm) { label.push('開演' + sm[1]); if (!tm) $('ke-start').value = sm[1].length === 4 ? '0' + sm[1] : sm[1]; }
    if (em) { label.push('終演' + em[1]); $('ke-end').value = em[1].length === 4 ? '0' + em[1] : em[1]; }
    if (label.length && !$('ke-time').value) $('ke-time').value = label.join('／');
    var urls = text.match(/https?:\/\/[^\s　]+/g) || [];
    urls.forEach(function (u) {
      if (/tiget|livepocket|eplus|ticketdive|pia\.jp/i.test(u)) { if (!$('ke-ticket').value) $('ke-ticket').value = u; }
      else if (/x\.com|twitter\.com/.test(u)) { if (!$('ke-linkx').value) $('ke-linkx').value = u; }
      else if (/instagram\.com/.test(u)) { if (!$('ke-linkig').value) $('ke-linkig').value = u; }
      else if (!$('ke-linkweb').value) $('ke-linkweb').value = u;
    });
    var pm = text.match(/[^\n]*(円|¥)[^\n]*/);
    if (pm && !$('ke-price').value) $('ke-price').value = pm[0].trim();
    if (!$('ke-desc').value) $('ke-desc').value = text.trim();
    status('取り込みました。各欄を確認してから送信してください。');
  };
  /* ---------- 修正：現在の内容を読み込む ---------- */
  function minToTime(m) {
    if (m == null || m === '') return '';
    return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
  }
  $('ke-load').onclick = function () {
    var id = $('ke-target').value.trim();
    if (!id) { status('対象イベントIDを入れてください。'); return; }
    var evs = (typeof window !== 'undefined' && window.allEvents) || [];
    var normId = function (v) { return String(v == null ? '' : v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/\s+/g, ''); };
    var want = normId(id), ev = null;
    for (var i = 0; i < evs.length; i++) { if (normId(evs[i].id) === want) { ev = evs[i]; break; } }
    if (!ev) { status('このサイトが表示中のデータに、そのIDのイベントが見つかりませんでした。'); return; }
    $('ke-kind').value = 'edit';
    $('ke-title').value = ev.title || '';
    $('ke-date').value = ev.date || '';
    $('ke-dateend').value = ev.dateEnd || '';
    $('ke-time').value = ev.timeLabel || '';
    $('ke-start').value = minToTime(ev.startMin);
    $('ke-end').value = minToTime(ev.endMin);
    $('ke-venue').value = ev.venue || '';
    $('ke-venuespace').value = ev.venueSpaceNote || '';
    $('ke-pref').value = ev.prefecture || '大阪府';
    $('ke-area').value = ev.area || '';
    $('ke-category').value = ev.category || '';
    setLines('ke-categories', ev.categories || []);
    $('ke-price').value = ev.price || '';
    $('ke-priceclass').value = ev.priceClass || '';
    var perfs = ev.performers;
    if (typeof perfs === 'string') perfs = perfs ? perfs.split(/[、,]/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
    setLines('ke-performers', perfs || []);
    perfPreview();
    var note = '';
    ttBox.innerHTML = '';
    try {
      var dj = JSON.parse(ev.description || '');
      note = dj.note || '';
      (dj.rows || []).forEach(function (r) {
        if (Array.isArray(r)) ttRow({ time: r[0] || '', text: r.slice(1).join(' ') });
        else ttRow({ time: r.time || '', stage: r.stage || '', label: r.label || '', text: r.text || r.performer || '' });
      });
    } catch (_) { note = ev.description || ''; }
    if (!ttBox.querySelector('.ttrow')) ttRow();
    $('ke-desc').value = note;
    $('ke-organizer').value = ev.organizerName || '';
    $('ke-linkweb').value = ev.linkWeb || '';
    $('ke-ticket').value = ev.linkTicket || '';
    $('ke-linkx').value = ev.linkX || '';
    $('ke-linkig').value = ev.linkInstagram || '';
    setLines('ke-images', ev.imageUrl ? [ev.imageUrl] : []);
    status('読み込みました。直す箇所だけ変更して送信してください（空にした項目は「空にする」という内容で届きます）。');
  };
  $('ke-cancel').onclick = function () { dlg.close(); };
  /* ---------- 送信 ---------- */
  function timeToMin(v) {
    if (!v) return null;
    var m = v.match(/(\d{1,2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  $('ke-send').onclick = async function () {
    var title = $('ke-title').value.trim(), date = $('ke-date').value;
    if (!title || !date) { status('タイトルと日付は必須です。'); return; }
    var submitter = '未ログイン';
    try { if (localStorage.getItem('kg_admin_mode_v1') === '1') submitter = 'admin'; } catch (_) {}
    if (submitter === '未ログイン') { try { if (localStorage.getItem('kg_guest_mode_v1') === '1') submitter = 'guest'; } catch (_) {} }
    if (submitter === '未ログイン') { try { var s = JSON.parse(localStorage.getItem('kg_member_session_v2') || 'null'); if (s && s.acct) submitter = 'member:' + s.acct.slice(0, 12); } catch (_) {} }
    var priceClass = $('ke-priceclass').value;
    var payload = {
      kind: $('ke-kind').value, targetId: $('ke-target').value.trim(),
      title: title, date: date, dateEnd: $('ke-dateend').value,
      timeLabel: $('ke-time').value.trim(),
      startMin: timeToMin($('ke-start').value), endMin: timeToMin($('ke-end').value),
      venue: $('ke-venue').value.trim(), venues: lines('ke-venues'), venueSpaceNote: $('ke-venuespace').value.trim(),
      prefecture: $('ke-pref').value, area: $('ke-area').value.trim(),
      category: $('ke-category').value.trim(), categories: lines('ke-categories'), subCategories: lines('ke-subcategories'),
      price: $('ke-price').value.trim(), priceClass: priceClass, isFree: priceClass === 'free',
      performers: perfList(), timetableRows: ttRows(), description: $('ke-desc').value.trim(),
      organizerName: $('ke-organizer').value.trim(), organizerWeb: $('ke-orgweb').value.trim(), organizerX: $('ke-orgx').value.trim(), organizerInstagram: $('ke-orgig').value.trim(),
      linkWeb: $('ke-linkweb').value.trim(), linkTicket: $('ke-ticket').value.trim(), linkX: $('ke-linkx').value.trim(), linkInstagram: $('ke-linkig').value.trim(),
      importImageUrls: lines('ke-images').slice(0, 8),
      collabCafe: $('ke-collab').checked, detailsClosed: $('ke-closed').checked,
      sourceType: $('ke-source').value, photoNote: $('ke-photonote').value.trim(), notes: $('ke-notes').value.trim(),
      submitter: submitter,
      _subject: '【編集入力】' + ($('ke-kind').value === 'new' ? '新規登録' : '修正') + '：' + title, _template: 'table', _captcha: 'false'
    };
    if (!cfg.endpoint) { status('送信先が未設定です（受付の準備中）。入力内容はまだ送信されていません。'); return; }
    status('送信しています…');
    try {
      var res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) });
      var data = await res.json();
      if (data && (data.ok || data.success === 'true' || data.success === true)) { status('送信しました。確認のうえガイドへ反映されます。'); }
      else { status('送信できませんでした。時間をおいてお試しください。'); }
    } catch (e) { status('送信できたか確認できませんでした。通信状態をご確認ください。'); }
  };
  /* 入口：ヘッダー（ログイン/同期の隣、スペース版と同じメイン画面の位置）に
     「＋ 新規登録・修正」ボタンを常時出す。送信は受付への申請形式なので、
     誰が見えても掲載に直接は影響しない。「ログイン・同期」ダイアログの中からも開ける。 */
  function openEditor() { if (!dlg.open) dlg.showModal(); }
  var headerBtn = document.getElementById('kg-editor-open');
  function refreshEditorEntry() { if (headerBtn) headerBtn.hidden = false; }
  if (headerBtn) { headerBtn.onclick = openEditor; refreshEditorEntry(); }
  var accountDlg = document.getElementById('kg-account-dialog') || document.getElementById('kg-account');
  if (accountDlg) {
    var p = document.createElement('p');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'イベントの新規登録・修正';
    btn.onclick = openEditor;
    p.appendChild(btn);
    accountDlg.appendChild(p);
    accountDlg.addEventListener('close', refreshEditorEntry);
  }
})();
