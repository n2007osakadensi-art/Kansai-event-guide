/* 試作サイトの編集入力（スペース版と同じ登録・修正の入口、2026-11-23着工）
   送信先は Apps Script ゲートウェイ → シート「編集入力」タブ（ステージング）。
   掲載への反映はスペース版ガイドへの取り込み経由。シート events タブはガイド同期で
   全件上書きされるため、ここから直接は書かない。仕様: trial-site-editor-spec-20261123 */
(function () {
  var cfg = window.KG_EDITOR_CONFIG || {};
  function $(id) { return document.getElementById(id); }
  var style = document.createElement('style');
  style.textContent = '#kg-editor{max-width:560px;width:calc(100vw - 24px)}#kg-editor label{display:block;font-size:13px;margin-top:10px}#kg-editor input,#kg-editor select,#kg-editor textarea{width:100%;box-sizing:border-box;padding:6px;margin-top:2px}#kg-editor textarea{min-height:52px}';
  document.head.appendChild(style);
  var dlg = document.createElement('dialog');
  dlg.id = 'kg-editor';
  function field(label, inner) { return '<label>' + label + inner + '</label>'; }
  dlg.innerHTML = '<form method="dialog"><button value="close" aria-label="閉じる">×</button></form>' +
    '<h2 style="margin-top:0">イベントの新規登録・修正</h2>' +
    '<p style="font-size:13px">送信内容は受付タブに届き、確認のうえスペース版ガイドへ登録・反映されます。</p>' +
    '<p id="kg-editor-status" role="status"></p>' +
    field('種別', '<select id="ke-kind"><option value="new">新規登録</option><option value="edit">修正</option></select>') +
    field('対象イベントID（修正のとき）', '<input id="ke-target" type="text" inputmode="numeric">') +
    field('タイトル（必須）', '<input id="ke-title" type="text">') +
    field('日付（必須）', '<input id="ke-date" type="date">') +
    field('終了日（複数日のとき）', '<input id="ke-dateend" type="date">') +
    field('時刻ラベル（例：開場12:00 開演12:30）', '<input id="ke-time" type="text">') +
    field('会場', '<input id="ke-venue" type="text">') +
    field('府県', '<select id="ke-pref"><option>大阪府</option><option>京都府</option><option>兵庫県</option><option>滋賀県</option><option>奈良県</option><option>和歌山県</option></select>') +
    field('エリア', '<input id="ke-area" type="text">') +
    field('カテゴリ', '<input id="ke-category" type="text">') +
    field('出演者（1行に1組）', '<textarea id="ke-performers"></textarea>') +
    field('タイムテーブル（1行ずつ：時刻と内容）', '<textarea id="ke-timetable"></textarea>') +
    field('料金', '<input id="ke-price" type="text">') +
    field('料金区分', '<select id="ke-priceclass"><option value="">不明</option><option value="free">無料</option><option value="paid">有料</option><option value="partial">一部無料</option></select>') +
    field('主催', '<input id="ke-organizer" type="text">') +
    field('公式リンク', '<input id="ke-official" type="url">') +
    field('チケットリンク', '<input id="ke-ticket" type="url">') +
    field('画像URL（1行に1つ）', '<textarea id="ke-images"></textarea>') +
    field('説明', '<textarea id="ke-desc"></textarea>') +
    field('備考', '<textarea id="ke-notes"></textarea>') +
    '<p><button id="ke-send" type="button">送信する</button></p>';
  document.body.appendChild(dlg);
  function status(t) { $('kg-editor-status').textContent = t; }
  function lines(id) { return $(id).value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
  $('ke-send').onclick = async function () {
    var title = $('ke-title').value.trim(), date = $('ke-date').value;
    if (!title || !date) { status('タイトルと日付は必須です。'); return; }
    var submitter = '未ログイン';
    try { if (localStorage.getItem('kg_admin_mode_v1') === '1') submitter = 'admin'; } catch (_) {}
    if (submitter === '未ログイン') { try { if (localStorage.getItem('kg_guest_mode_v1') === '1') submitter = 'guest'; } catch (_) {} }
    if (submitter === '未ログイン') { try { var s = JSON.parse(localStorage.getItem('kg_member_session_v2') || 'null'); if (s && s.acct) submitter = 'member:' + s.acct.slice(0, 12); } catch (_) {} }
    var payload = { kind: $('ke-kind').value, targetId: $('ke-target').value.trim(), title: title, date: date, dateEnd: $('ke-dateend').value, timeLabel: $('ke-time').value.trim(), venue: $('ke-venue').value.trim(), prefecture: $('ke-pref').value, area: $('ke-area').value.trim(), category: $('ke-category').value.trim(), performers: lines('ke-performers'), timetable: lines('ke-timetable'), price: $('ke-price').value.trim(), priceClass: $('ke-priceclass').value, organizer: $('ke-organizer').value.trim(), linkOfficial: $('ke-official').value.trim(), linkTicket: $('ke-ticket').value.trim(), imageUrls: lines('ke-images'), description: $('ke-desc').value.trim(), notes: $('ke-notes').value.trim(), submitter: submitter };
    if (!cfg.endpoint) { status('送信先が未設定です（受付の準備中）。入力内容はまだ送信されていません。'); return; }
    status('送信しています…');
    try {
      var res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) });
      var data = await res.json();
      if (data && data.ok) { status('送信しました。確認のうえガイドへ反映されます。'); }
      else { status('送信できませんでした。時間をおいてお試しください。'); }
    } catch (e) { status('送信できたか確認できませんでした。通信状態をご確認ください。'); }
  };
  /* 入口：ヘッダー（ログイン/同期の隣、スペース版と同じメイン画面の位置）に
     「＋ 新規登録・修正」ボタンを常時出す。送信は受付タブへの申請形式なので、
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
