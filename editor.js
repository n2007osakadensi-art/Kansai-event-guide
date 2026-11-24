/* 試作サイトの編集入力 — スペース版ガイドのイベント編集フォーム（正本）に
   項目・並び・入力補助・保存時の挙動を揃えた版（2026-11-23、Kota指示文で統一。
   正本の実物確認に基づく：セクション順、一括分割の区切り仕様、料金区分は
   自動判定の参考表示のみ、重複チェックと公開状態の項目は正本にも無いため
   追加しない。詳細は docs/editor-spec.md）。
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
    + '#kg-editor label{display:block;font-size:13px;line-height:1.45;margin-top:14px}'
    + '#kg-editor input,#kg-editor select,#kg-editor textarea{width:100%;box-sizing:border-box;padding:10px 12px;margin-top:4px;font-size:16px;line-height:1.4;min-height:44px}'
    + '#kg-editor textarea{min-height:64px}'
    + '#kg-editor #ke-paste{min-height:96px}'
    + '#kg-editor p>button{min-height:44px;padding:8px 16px;font-size:14px}'
    + '#kg-editor h3{font-size:14px;margin:24px 0 2px;border-bottom:1px solid #ccc;padding-bottom:4px}'
    + '#kg-editor .row2{display:flex;gap:10px}#kg-editor .row2>label{flex:1}'
    + '#kg-editor .ttrow{display:flex;gap:6px;margin-top:6px;align-items:flex-start}'
    + '#kg-editor .ttrow input{margin-top:0}#kg-editor .tt-time{flex:0 0 118px}#kg-editor .tt-stage{flex:0 0 110px}'
    + '#kg-editor .tt-label{flex:0 0 92px}#kg-editor .tt-text{flex:1}#kg-editor .tt-del{flex:0 0 34px}'
    + '#kg-editor .chk{display:flex;gap:8px;align-items:center;font-size:13px;margin-top:10px;padding:6px 0}'
    + '#kg-editor .chk input{width:18px;height:18px;min-height:0;margin:0;padding:0}'
    + '#kg-editor .mini{font-size:12px;color:#666;margin-top:2px;line-height:1.5}'
    + '#kg-editor .ke-venue-wrap{display:block;position:relative}'
    + '#kg-editor .ke-sug{position:absolute;left:0;right:0;top:100%;z-index:6;background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--border,#bbb);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);max-height:264px;overflow-y:auto;display:none}'
    + '#kg-editor .ke-sug.show{display:block}'
    + '#kg-editor .ke-sug button{display:block;width:100%;text-align:left;padding:11px 12px;border:0;background:transparent;color:inherit;font-size:15px;cursor:pointer}'
    + '@media (max-width:640px){'
    + '#kg-editor{width:calc(100vw - 12px)}'
    + '#kg-editor .row2{flex-direction:column;gap:0}'
    + '#kg-editor p>button{width:100%}'
    + '#kg-editor .ttrow{flex-wrap:wrap}'
    + '#kg-editor .tt-time{flex:0 0 104px}#kg-editor .tt-stage{flex:1 1 110px}'
    + '#kg-editor .tt-label{flex:0 0 96px}#kg-editor .tt-text{flex:1 1 100%;order:5}'
    + '#kg-editor .tt-del{flex:0 0 40px;min-height:40px}'
    + '#kg-editor .ttrow input,#kg-editor .ttrow select{min-height:40px}'
    + '}';
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
    field('対象イベントをタイトルで探す（修正のとき）', '<input id="ke-pick-q" type="text" placeholder="タイトルの一部を入力すると候補が出ます" autocomplete="off">') +
    '<div id="ke-pick-list"></div>' +
    '<p><button id="ke-load" type="button">現在の内容を読み込む（修正のとき）</button></p>' +
    '<p class="mini">修正のときは、読み込むとこのサイトが表示中のデータで各欄が埋まります。そこから直して送信してください。このサイトの表示データに無い項目（追加会場・主催リンクなど）は、読み込みで空欄でもガイド側の既存値が保持されます（変更した項目だけが届きます）。</p>' +
    sec('テキスト貼り付け取り込み') +
    field('告知文を貼り付け', '<textarea id="ke-paste" placeholder="フライヤーや告知の文章を貼ると、日付・時刻・URLなどを各欄へ振り分けます"></textarea>') +
    '<p><button id="ke-paste-btn" type="button">各欄へ取り込む</button></p>' +
    sec('画像') +
    field('画像URL（1行に1つ、最大8件。並び順＝表示順。公式フライヤーの原寸URL）', '<textarea id="ke-images"></textarea>') +
    sec('タイトル') +
    field('タイトル（必須）※公式名そのまま', '<input id="ke-title" type="text" maxlength="200">') +
    sec('日付') +
    '<div class="row2">' +
    field('日付（必須）', '<input id="ke-date" type="date">') +
    field('終了日（複数日のとき）', '<input id="ke-dateend" type="date">') +
    '</div>' +
    sec('時刻') +
    '<div class="row2">' +
    field('開始時刻', '<input id="ke-start" type="time">') +
    field('終了時刻', '<input id="ke-end" type="time">') +
    '</div>' +
    field('時刻の表示文（例：開場12:00／開演12:30）', '<input id="ke-time" type="text">') +
    sec('会場') +
    field('会場（会場DBの正式キー「名称（自治体）」。入力すると候補が出ます）', '<span class="ke-venue-wrap"><input id="ke-venue" type="text" autocomplete="off"><span id="ke-venue-sug" class="ke-sug"></span></span>') +
    field('会場補足（会場内のスペース・階など）', '<input id="ke-venuespace" type="text">') +
    field('追加の会場（1行に1会場、複数会場のとき）', '<textarea id="ke-venues"></textarea>') +
    sec('出演者') +
    field('出演者（1行に1組。まとめて貼って「一括分割」も使えます）', '<textarea id="ke-performers"></textarea>') +
    '<p><button id="ke-split" type="button">一括分割（改行・、・／・｜などで区切る）</button></p>' +
    '<div id="ke-perf-preview" class="mini"></div>' +
    sec('カテゴリ') +
    field('カテゴリ', '<input id="ke-category" type="text">') +
    field('追加カテゴリ（1行に1つ）', '<textarea id="ke-categories"></textarea>') +
    field('サブカテゴリ（1行に1つ）', '<textarea id="ke-subcategories"></textarea>') +
    '<label class="chk"><input id="ke-collab" type="checkbox"> コラボカフェ</label>' +
    '<label class="chk"><input id="ke-closed" type="checkbox"> 完結・完了（詳細はこれで確定）</label>' +
    sec('エリア・都道府県') +
    '<div class="row2">' +
    field('府県', '<select id="ke-pref"><option>大阪府</option><option>京都府</option><option>兵庫県</option><option>滋賀県</option><option>奈良県</option><option>和歌山県</option></select>') +
    field('エリア（市区町村）', '<input id="ke-area" type="text">') +
    '</div>' +
    sec('料金・チケット') +
    field('料金（例：前売 3,500円／当日 4,000円（ドリンク代別））', '<input id="ke-price" type="text">') +
    '<label class="chk"><input id="ke-isfree" type="checkbox"> 無料イベント（観覧・入場無料）</label>' +
    '<p class="mini" id="ke-pc-auto">料金区分は保存時に自動で決まります（編集はできません）。</p>' +
    field('チケット販売ページ', '<input id="ke-ticket" type="url">') +
    sec('公式リンク・SNS') +
    field('公式サイト', '<input id="ke-linkweb" type="url">') +
    field('X', '<input id="ke-linkx" type="url">') +
    field('Instagram', '<input id="ke-linkig" type="url">') +
    sec('撮影') +
    field('撮影について・詳細', '<input id="ke-photonote" type="text">') +
    sec('詳細・タイムテーブル') +
    '<div id="ke-tt"></div>' +
    '<p><button id="ke-tt-add" type="button">＋ 行を追加</button></p>' +
    '<p class="mini">時刻／ステージ／区分（開場・開演・終演など）／内容・出演者の順で1行ずつ。ステージが違うだけでは公演を分けず、この表にステージ別で書きます。送信時にステージごとに開始時刻順へ並べ替えます。</p>' +
    field('説明文（補足）', '<textarea id="ke-desc"></textarea>') +
    sec('主催') +
    field('主催者名', '<input id="ke-organizer" type="text">') +
    field('主催 公式サイト', '<input id="ke-orgweb" type="url">') +
    field('主催 X', '<input id="ke-orgx" type="url">') +
    field('主催 Instagram', '<input id="ke-orgig" type="url">') +
    sec('備考') +
    field('備考（注意事項）', '<textarea id="ke-notes"></textarea>') +
    field('出典種別', '<select id="ke-source"><option value="primary">一次情報</option><option value="summary">まとめのみ</option><option value="unconfirmed">要確認</option></select>') +
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
  /* ---------- 出演者の一括分割（スペース版 performerSplit と同一仕様） ----------
     NFKC正規化のうえ、区切りは 改行・、,，;；・/／|｜• のみ。空白と✕/×では割らない。
     例外4件と登録辞書名は「トークン全体として立つ場合」だけ保護する。
     完全一致の重複は先勝ち1件、末尾コロンのラベル断片は捨てる。 */
  var NEVER_SPLIT = ['ジョニー・デッパ', 'と、いうわけで', '君に、胸キュン。', 'mofu/mofu'];
  var SEP_RE = /[\n\r、,，;；・\/／|｜•]/;
  var dictNames = [];
  var venueKeys = [];
  function sortDictNames() {
    var seen = {}, out = [];
    dictNames.forEach(function (n) { if (n && n.length >= 2 && !seen[n]) { seen[n] = 1; out.push(n); } });
    dictNames = out.sort(function (a, b) { return b.length - a.length; });
  }
  function loadDictNames() {
    if (loadDictNames.done) return; loadDictNames.done = true;
    fetch('assets/artists.json').then(function (r) { return r.json(); }).then(function (j) {
      Object.keys(j).forEach(function (k) { dictNames.push(k); ((j[k] && j[k].m) || []).forEach(function (m) { if (m && m.n) dictNames.push(m.n); }); });
      sortDictNames();
    }).catch(function () {});
    fetch('assets/dict.json').then(function (r) { return r.json(); }).then(function (j) {
      Object.keys(j).forEach(function (k) { dictNames.push(k); });
      sortDictNames();
    }).catch(function () {});
    fetch('assets/venues.json').then(function (r) { return r.json(); }).then(function (j) {
      venueKeys = Object.keys(j);
    }).catch(function () {});
  }
  function protectTokens(work, names, hold) {
    names.forEach(function (name) {
      var idx = 0;
      while (true) {
        var i = work.indexOf(name, idx); if (i < 0) break;
        var before = i === 0 ? '' : work.charAt(i - 1);
        var after = (i + name.length) >= work.length ? '' : work.charAt(i + name.length);
        if ((before === '' || SEP_RE.test(before)) && (after === '' || SEP_RE.test(after))) {
          var token = '\u0001' + hold.length + '\u0002'; hold.push(name);
          work = work.slice(0, i) + token + work.slice(i + name.length);
          idx = i + token.length;
        } else idx = i + 1;
      }
    });
    return work;
  }
  function splitPerformers(text) {
    var work = String(text || '').normalize('NFKC'), hold = [];
    work = protectTokens(work, NEVER_SPLIT, hold);
    if (dictNames.length) work = protectTokens(work, dictNames, hold);
    var seen = {}, out = [];
    work.split(SEP_RE).forEach(function (frag) {
      var t = frag.trim();
      if (!t || /[:：]$/.test(t)) return;
      var cm = t.match(/^[^:：]{1,12}[:：]/);
      if (cm) t = t.slice(cm[0].length).trim();
      if (!t) return;
      t = t.replace(/\u0001(\d+)\u0002/g, function (_, i) { return hold[+i] || ''; }).trim();
      if (t && !seen[t]) { seen[t] = 1; out.push(t); }
    });
    return out;
  }
  function perfList() { return splitPerformers($('ke-performers').value); }
  function perfPreview() {
    var list = perfList();
    $('ke-perf-preview').textContent = list.length ? '出演者 ' + list.length + '組：' + list.join(' / ') : '';
  }
  $('ke-performers').addEventListener('input', perfPreview);
  var venueInput = $('ke-venue'), venueSug = $('ke-venue-sug');
  function hideVenueSug() { venueSug.classList.remove('show'); venueSug.innerHTML = ''; }
  function showVenueSug() {
    var q = venueInput.value.trim();
    if (!q || !venueKeys.length) { hideVenueSug(); return; }
    var hits = [];
    for (var vi = 0; vi < venueKeys.length && hits.length < 8; vi++) { if (venueKeys[vi].indexOf(q) >= 0) hits.push(venueKeys[vi]); }
    if (!hits.length) { hideVenueSug(); return; }
    venueSug.innerHTML = hits.map(function (k) { return '<button type="button" data-vsug="' + k.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">' + k.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</button>'; }).join('');
    venueSug.classList.add('show');
  }
  venueInput.addEventListener('input', showVenueSug);
  venueInput.addEventListener('focus', showVenueSug);
  venueInput.addEventListener('blur', function () { setTimeout(hideVenueSug, 150); });
  venueSug.addEventListener('mousedown', function (ev2) {
    var b = ev2.target.closest('[data-vsug]');
    if (b) { venueInput.value = b.getAttribute('data-vsug'); hideVenueSug(); }
  });
  $('ke-split').onclick = function () {
    var list = splitPerformers($('ke-performers').value);
    setLines('ke-performers', list);
    perfPreview();
  };
  /* ---------- 料金区分の自動判定（スペース版の保存時ルールの鏡像・参考表示） ---------- */
  function judgePriceClass(price, isFree) {
    var t = String(price || '');
    function amounts(str) { var out = [], re = /(?:¥|￥)\s*([0-9,]+)|([0-9,]+)\s*円/g, m; while ((m = re.exec(str))) out.push(parseInt((m[1] || m[2]).replace(/,/g, ''), 10)); return out; }
    var drinkMention = /(ドリンク|1D|2D)/.test(t) && !/(ドリンク不要|ドリンク代なし|ドリンク代無し)/.test(t);
    var tNoDrink = t.replace(/(ドリンク代|ドリンク|1ドリンク|2ドリンク|1D|2D)\s*(別途|別|のみ)?\s*(?:¥|￥)?\s*[0-9,]+\s*円?/g, '');
    var hasPositive = amounts(tNoDrink).some(function (a) { return a > 0; });
    if (hasPositive) {
      if (/(一般|通常)[^。\n]{0,12}(無料|¥\s*0(?![0-9])|￥\s*0(?![0-9])|(^|[^0-9,])0円)/.test(t)) return 'partial';
      if (/(女性|学生)[^。\n]{0,10}無料/.test(t) && !/(中学生|小学生)[^。\n]{0,6}無料/.test(t) && drinkMention) return 'partial';
      if (/(観覧|入場)[^。\n]{0,4}無料/.test(t) && /(優先|前方)/.test(t)) return 'partial';
      return 'paid';
    }
    if (isFree || /無料/.test(t)) return drinkMention ? 'drink' : 'free';
    return '';
  }
  var PC_LABEL = { free: '無料', drink: 'ドリンク代のみ', partial: '一部無料', paid: '有料', '': '未区分' };
  function updatePcAuto() {
    var el = $('ke-pc-auto'); if (!el) return;
    var pc = judgePriceClass($('ke-price').value, $('ke-isfree').checked);
    el.textContent = '料金区分（参考表示）: ' + (PC_LABEL[pc] || '未区分') + ' — 保存時にガイド側で自動判定されます（編集はできません）。';
  }
  $('ke-price').addEventListener('input', updatePcAuto);
  $('ke-isfree').addEventListener('change', updatePcAuto);
  /* ---------- タイムテーブルの変更検知（未編集なら元の説明文を保持） ---------- */
  var ttTouched = false, noteTouched = false, loadedEventId = '', dupArmKey = '';
  $('ke-tt').addEventListener('input', function () { ttTouched = true; });
  $('ke-tt').addEventListener('click', function () { ttTouched = true; });
  $('ke-desc').addEventListener('input', function () { noteTouched = true; });
  /* 送信時のタイムテーブル整列（正本 sortTimetables と同じ規則：
     ステージの出現順を保ち、各ステージ内で開場・開演を先頭、時刻行を開始時刻昇順、時刻なしを末尾） */
  function sortTtRows(rows) {
    var order = [], groups = {};
    rows.forEach(function (r) { var k = r.stage || ''; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(r); });
    function startOf(r) { var m = String(r.time || '').match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
    var out = [];
    order.forEach(function (k) {
      var g = groups[k];
      var head = g.filter(function (r) { return r.label === '開場' || r.label === '開演'; });
      var rest = g.filter(function (r) { return !(r.label === '開場' || r.label === '開演'); });
      var timed = rest.filter(function (r) { return startOf(r) != null; }).sort(function (a, b) { return startOf(a) - startOf(b); });
      var untimed = rest.filter(function (r) { return startOf(r) == null; });
      out = out.concat(head, timed, untimed);
    });
    return out;
  }
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
  /* ---------- 表示データに無い項目の保持（修正で未変更なら payload から除く） ---------- */
  var unloadedSnapshot = null;
  function unloadedState() {
    return {
      venues: lines('ke-venues').join('\n'), subCategories: lines('ke-subcategories').join('\n'),
      organizerWeb: $('ke-orgweb').value.trim(), organizerX: $('ke-orgx').value.trim(), organizerInstagram: $('ke-orgig').value.trim(),
      collabCafe: $('ke-collab').checked, detailsClosed: $('ke-closed').checked,
      sourceType: $('ke-source').value, photoNote: $('ke-photonote').value.trim(), notes: $('ke-notes').value.trim()
    };
  }
  /* ---------- タイムテーブル行の判別（表示側 descRowParts と同じ規則） ----------
     [時刻,内容] / [ラベル,時刻]（id 1 の実形式）/ [ラベル+時刻,内容] /
     {time,act} などのオブジェクト行 / 文字列行を判別して正しい列へ入れる */
  var TT_LABELS = ['開場', '開演', '終演', '物販', '特典会'];
  function ttFromDescRow(r) {
    if (r == null) return { time: '', stage: '', label: '', text: '' };
    if (typeof r === 'string') {
      var am = r.match(/act['"]?\s*[:：]\s*['"]([^'"]*)['"]/);
      var tm = r.match(/(?:time|時刻)['"]?\s*[:：]\s*['"]?(\d{1,2}[:：]\d{2})/);
      if (am || tm) return { time: tm ? tm[1].replace('：', ':') : '', stage: '', label: '', text: am ? am[1] : r };
      return { time: '', stage: '', label: '', text: r };
    }
    if (Array.isArray(r)) {
      var cells = r.map(function (c) { return c == null ? '' : String(c).trim(); });
      var c0 = cells[0] || '', c1 = cells[1] || '', rest = cells.slice(2).filter(Boolean).join(' ');
      var isTime = function (x) { return /^\d{1,2}[:：]\d{2}/.test(x); };
      if (TT_LABELS.indexOf(c0) >= 0) {
        if (isTime(c1)) return { time: c1.replace('：', ':'), stage: '', label: c0, text: rest };
        return { time: '', stage: '', label: c0, text: [c1, rest].filter(Boolean).join(' ') };
      }
      var cm = c0.match(/^(開場|開演|終演|物販|特典会)\s*(\d{1,2}[:：]\d{2})/);
      if (cm) return { time: cm[2].replace('：', ':'), stage: '', label: cm[1], text: [c1, rest].filter(Boolean).join(' ') };
      return { time: c0, stage: '', label: '', text: [c1, rest].filter(Boolean).join(' ') };
    }
    return { time: String(r.time || ''), stage: String(r.stage || ''), label: String(r.label || ''), text: String(r.act || r.text || r.performer || r.content || '') };
  }
  /* ---------- 修正：現在の内容を読み込む ---------- */
  function minToTime(m) {
    if (m == null || m === '') return '';
    return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
  }
  function loadTarget() {
    var id = $('ke-target').value.trim();
    if (!id) { status('対象イベントIDを入れてください。'); return; }
    var normId = function (v) { return String(v == null ? '' : v).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/\s+/g, ''); };
    var want = normId(id), ev = null;
    if (window.KGEditorBridge) { ev = window.KGEditorBridge.getById(want); }
    if (!ev && window.allEvents) {
      for (var i = 0; i < window.allEvents.length; i++) { if (normId(window.allEvents[i].id) === want) { ev = window.allEvents[i]; break; } }
    }
    if (!ev) {
      var loaded = window.KGEditorBridge ? window.KGEditorBridge.count() : 0;
      status(loaded ? 'このサイトが表示中のデータに、そのIDのイベントが見つかりませんでした。' : 'イベントデータの読み込みが終わっていません。件数が表示されてからお試しください。');
      return;
    }
    if (window.KGEditorBridge && window.KGEditorBridge.detailsReady && !window.KGEditorBridge.detailsReady()) {
      status(window.KGEditorBridge.detailsFailed && window.KGEditorBridge.detailsFailed()
        ? '詳細データ（出演者・説明・リンク）の読み込みに失敗しました。再読み込みしてからお試しください。'
        : '詳細データ（出演者・説明・リンク）を読み込み中です。少し待ってから、再度「現在の内容を読み込む」を押してください。');
      return;
    }
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
    setLines('ke-categories', (ev.categories || []).filter(function (c) { return String(c).trim() !== String(ev.category || '').trim(); }));
    $('ke-price').value = ev.price || '';
    $('ke-isfree').checked = !!ev.isFree;
    updatePcAuto();
    loadedEventId = String(ev.id); ttTouched = false; noteTouched = false;
    var perfs = ev.performers;
    if (typeof perfs === 'string') perfs = perfs ? perfs.split(/[、,]/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
    setLines('ke-performers', perfs || []);
    perfPreview();
    var note = '';
    ttBox.innerHTML = '';
    try {
      var dj = JSON.parse(ev.description || '');
      note = dj.note || '';
      (dj.rows || []).forEach(function (r) { ttRow(ttFromDescRow(r)); });
    } catch (_) { note = ev.description || ''; }
    if (!ttBox.querySelector('.ttrow')) ttRow();
    $('ke-desc').value = note;
    $('ke-organizer').value = ev.organizerName || '';
    $('ke-linkweb').value = ev.linkWeb || '';
    $('ke-ticket').value = ev.linkTicket || '';
    $('ke-linkx').value = ev.linkX || '';
    $('ke-linkig').value = ev.linkInstagram || '';
    setLines('ke-images', ev.imageUrl ? [ev.imageUrl] : []);
    unloadedSnapshot = unloadedState();
    status('読み込みました。直す箇所だけ変更して送信してください。このサイトの表示データに無い項目は、変更していなければガイド側の既存値が保持されます。');
  }
  $('ke-load').onclick = loadTarget;
  /* タイトル検索ピッカー: 候補をタップすると ID が入り、そのまま読み込む */
  var pickQ = $('ke-pick-q'), pickList = $('ke-pick-list');
  if (pickQ && pickList) {
    pickQ.addEventListener('input', function () {
      var q = pickQ.value.trim();
      pickList.innerHTML = '';
      if (!q || !window.KGEditorBridge || !window.KGEditorBridge.findByTitle) return;
      var hits = window.KGEditorBridge.findByTitle(q, 8);
      hits.forEach(function (h) {
        var b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = 'display:block;width:100%;text-align:left;margin-top:6px;padding:10px 12px;font-size:14px';
        b.textContent = '「' + h.title + '」 ' + (h.date || '') + (h.venue ? ' ＠ ' + h.venue : '') + '（ID ' + h.id + '）';
        b.onclick = function () { $('ke-target').value = String(h.id); pickList.innerHTML = ''; loadTarget(); };
        pickList.appendChild(b);
      });
      if (!hits.length) pickList.innerHTML = '<p class="mini">タイトルに合うイベントが見つかりませんでした。</p>';
    });
  }
  $('ke-cancel').onclick = function () { dlg.close(); };
  /* ---------- 送信 ---------- */
  function timeToMin(v) {
    if (!v) return null;
    var m = v.match(/(\d{1,2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  /* 反映待ち（v57）: 送信が受付に届いたら、その内容をこの端末だけに保存する。
     サイト本体（index.html）が読み込みのたびにシート由来データへ重ねて表示するので、
     送信した本人の画面では「送信＝即反映」に見える。他の利用者には出ない。
     シート側に同じ内容が現れたら本体側が自動で外す（30日で失効） */
  function savePending(payload) {
    try {
      var key = 'kg_trial_pending_events_v1';
      var list = [];
      try { list = JSON.parse(localStorage.getItem(key) || '[]'); if (!Array.isArray(list)) list = []; } catch (_) { list = []; }
      var descText;
      if (payload.kind === 'edit' && payload.descriptionUnchanged && window.KGEditorBridge && window.KGEditorBridge.getById) {
        var cur = window.KGEditorBridge.getById(payload.targetId);
        descText = cur ? (cur.description || '') : '';
      } else {
        descText = JSON.stringify({ rows: payload.timetableRows || [], note: payload.description || '' });
      }
      var ev = {
        title: payload.title, date: payload.date, dateEnd: payload.dateEnd || '',
        timeLabel: payload.timeLabel || '', startMin: payload.startMin, endMin: payload.endMin,
        venue: payload.venue || '', venueSpaceNote: payload.venueSpaceNote || '',
        area: payload.area || '', prefecture: payload.prefecture || '',
        category: payload.category || '', categories: (payload.categories || []).join('、'),
        price: payload.price || '', performers: (payload.performers || []).join('、'),
        description: descText, imageUrl: (payload.importImageUrls || [])[0] || '',
        linkWeb: payload.linkWeb || '', linkTicket: payload.linkTicket || '', linkX: payload.linkX || '', linkInstagram: payload.linkInstagram || '',
        organizerName: payload.organizerName || '', isFree: !!payload.isFree, priceClass: payload.priceClass || ''
      };
      if (payload.kind === 'edit' && payload.targetId) {
        list = list.filter(function (p) { return !(p.kind === 'edit' && String(p.targetId) === String(payload.targetId)); });
        list.push({ kind: 'edit', targetId: String(payload.targetId), ts: Date.now(), ev: ev });
      } else {
        list.push({ kind: 'new', ts: Date.now(), ev: ev });
      }
      localStorage.setItem(key, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('kg:pending-change'));
    } catch (_) {}
  }
  $('ke-send').onclick = async function () {
    var title = $('ke-title').value.trim(), date = $('ke-date').value;
    if (!title || !date) { status('タイトルと日付は必須です。'); return; }
    /* 重複チェック（指示文§3）: 新規登録の前に、日付が一致しタイトルまたは会場が
       一致する既存イベントがあれば候補を示す。1部・2部や別公演は別件なので
       ブロックはせず、確認のうえもう一度押すと送信できる。 */
    if ($('ke-kind').value === 'new') {
      var dupKey = title + '|' + date + '|' + $('ke-venue').value.trim();
      if (dupArmKey !== dupKey) {
        var cands = (window.KGEditorBridge && window.KGEditorBridge.findOnDate) ? window.KGEditorBridge.findOnDate(date) : [];
        var venueVal = $('ke-venue').value.trim();
        var hits = cands.filter(function (c) { return c.title === title || (venueVal && c.venue === venueVal); });
        if (hits.length) {
          dupArmKey = dupKey;
          status('同じ日付で、タイトルまたは会場が一致する既存イベントがあります: ' + hits.slice(0, 5).map(function (c) { return '「' + c.title + '」(' + (c.venue || '会場未定') + '/ID ' + c.id + ')'; }).join('、') + '。1部・2部や別公演であれば別件として登録できます。内容を確認したら、もう一度「送信する」を押してください。');
          return;
        }
        dupArmKey = dupKey;
      }
    }
    var submitter = '未ログイン';
    try { if (localStorage.getItem('kg_admin_mode_v1') === '1') submitter = 'admin'; } catch (_) {}
    if (submitter === '未ログイン') { try { if (localStorage.getItem('kg_guest_mode_v1') === '1') submitter = 'guest'; } catch (_) {} }
    if (submitter === '未ログイン') { try { var s = JSON.parse(localStorage.getItem('kg_member_session_v2') || 'null'); if (s && s.acct) submitter = 'member:' + s.acct.slice(0, 12); } catch (_) {} }
    var priceClass = judgePriceClass($('ke-price').value, $('ke-isfree').checked);
    var payload = {
      kind: $('ke-kind').value, targetId: $('ke-target').value.trim(),
      title: title, date: date, dateEnd: $('ke-dateend').value,
      timeLabel: $('ke-time').value.trim(),
      startMin: timeToMin($('ke-start').value), endMin: timeToMin($('ke-end').value),
      venue: $('ke-venue').value.trim(), venues: lines('ke-venues'), venueSpaceNote: $('ke-venuespace').value.trim(),
      prefecture: $('ke-pref').value, area: $('ke-area').value.trim(),
      category: $('ke-category').value.trim(), categories: lines('ke-categories').filter(function (c) { return c !== $('ke-category').value.trim(); }), subCategories: lines('ke-subcategories'),
      price: $('ke-price').value.trim(), priceClass: priceClass, isFree: $('ke-isfree').checked,
      performers: perfList(), timetableRows: sortTtRows(ttRows()), description: $('ke-desc').value.trim(),
      descriptionUnchanged: ($('ke-kind').value === 'edit' && loadedEventId !== '' && !ttTouched && !noteTouched),
      organizerName: $('ke-organizer').value.trim(), organizerWeb: $('ke-orgweb').value.trim(), organizerX: $('ke-orgx').value.trim(), organizerInstagram: $('ke-orgig').value.trim(),
      linkWeb: $('ke-linkweb').value.trim(), linkTicket: $('ke-ticket').value.trim(), linkX: $('ke-linkx').value.trim(), linkInstagram: $('ke-linkig').value.trim(),
      importImageUrls: lines('ke-images').slice(0, 8),
      collabCafe: $('ke-collab').checked, detailsClosed: $('ke-closed').checked,
      sourceType: $('ke-source').value, photoNote: $('ke-photonote').value.trim(), notes: $('ke-notes').value.trim(),
      submitter: submitter,
      _subject: '【編集入力】' + ($('ke-kind').value === 'new' ? '新規登録' : '修正') + '：' + title, _template: 'table', _captcha: 'false'
    };
    if (payload.kind === 'edit' && loadedEventId !== '' && unloadedSnapshot) {
      var nowState = unloadedState(), dropped = [];
      Object.keys(unloadedSnapshot).forEach(function (k) {
        if (nowState[k] === unloadedSnapshot[k]) { delete payload[k]; dropped.push(k); }
      });
      if (dropped.length) payload.preservedUnloadedFields = dropped;
    }
    if (!cfg.endpoint) { status('送信先が未設定です（受付の準備中）。入力内容はまだ送信されていません。'); return; }
    var sendBtn = $('ke-send'); sendBtn.disabled = true;
    status('送信しています…');
    try {
      var ctl = ('AbortController' in window) ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, 25000) : null;
      var res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload), signal: ctl ? ctl.signal : undefined });
      if (timer) clearTimeout(timer);
      var data = await res.json().catch(function () { return null; });
      if (data && (data.ok || data.success === 'true' || data.success === true)) { savePending(payload); status('送信しました。確認のうえガイドへ反映されます。この端末では「反映待ち」として、送信した内容をそのまま表示しています。'); }
      else { status('送信できませんでした。時間をおいてお試しください。'); }
    } catch (e) { status('送信の確認ができませんでした（受付からの応答がありませんでした）。受付に届いている場合があるので、少し時間をおき、届いていないときだけ再送してください。'); }
    finally { sendBtn.disabled = false; }
  };
  /* 入口：ヘッダー（ログイン/同期の隣、スペース版と同じメイン画面の位置）に
     「＋ 新規登録・修正」ボタンを常時出す。送信は受付への申請形式なので、
     誰が見えても掲載に直接は影響しない。「ログイン・同期」ダイアログの中からも開ける。 */
  /* 開くたびに前回の入力を残さない（下書き扱いはしない） */
  function resetEditorForm() {
    ['ke-target', 'ke-pick-q', 'ke-paste', 'ke-images', 'ke-title', 'ke-time', 'ke-venue', 'ke-venuespace', 'ke-venues', 'ke-performers', 'ke-category', 'ke-categories', 'ke-subcategories', 'ke-area', 'ke-price', 'ke-ticket', 'ke-linkweb', 'ke-linkx', 'ke-linkig', 'ke-photonote', 'ke-desc', 'ke-organizer', 'ke-orgweb', 'ke-orgx', 'ke-orgig', 'ke-notes', 'ke-start', 'ke-end'].forEach(function (id) { var el = $(id); if (el) el.value = ''; });
    $('ke-kind').value = 'new';
    $('ke-date').value = ''; $('ke-dateend').value = '';
    $('ke-isfree').checked = false; $('ke-collab').checked = false; $('ke-closed').checked = false;
    $('ke-source').value = 'primary';
    if ($('ke-pick-list')) $('ke-pick-list').innerHTML = '';
    if ($('ke-perf-preview')) $('ke-perf-preview').textContent = '';
    ttBox.innerHTML = ''; ttRow();
    ttTouched = false; noteTouched = false; loadedEventId = ''; dupArmKey = ''; unloadedSnapshot = null;
    status('');
    updatePcAuto();
  }
  function openEditor() { loadDictNames(); resetEditorForm(); if (!dlg.open) dlg.showModal(); }
  /* 詳細モーダルからの導線: 対象イベントがセット済みの状態で開く */
  window.KGEditorOpenWithId = function (id) {
    loadDictNames(); resetEditorForm();
    $('ke-kind').value = 'edit';
    $('ke-target').value = String(id == null ? '' : id);
    if (!dlg.open) dlg.showModal();
    loadTarget();
  };
  var headerBtn = document.getElementById('kg-editor-open');
  function refreshEditorEntry() { if (headerBtn) headerBtn.hidden = false; }
  if (headerBtn) { headerBtn.onclick = openEditor; refreshEditorEntry(); }
  /* アカウントダイアログ最下部への編集ボタン追加は廃止（v53 Minor）。
     入口はヘッダーの「＋ 新規登録・修正」だけに統一する */
  var accountDlg = document.getElementById('kg-account-dialog') || document.getElementById('kg-account');
  if (accountDlg) {
    accountDlg.addEventListener('close', refreshEditorEntry);
  }
})();
