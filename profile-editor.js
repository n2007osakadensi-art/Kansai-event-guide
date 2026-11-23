/* プロフィール（アーティスト/会場）の追加・修正フォーム。
   スペース版ガイドのプロフィール保存項目に合わせ、現在の値を初期表示して
   申請形式で受付へ送る。受付でガイド本体に反映され、プロフィールデータが
   更新されると詳細画面に新しい値が出る（＝確認できる）。
   送信先はイベント編集と同じ受付口（editor-config.js）。 */
(function () {
  var cfg = window.KG_EDITOR_CONFIG || {};
  if (!cfg.endpoint) return;
  var css = ''
    + '.kp-overlay{position:fixed;inset:0;background:rgba(10,10,20,.55);z-index:1200;display:none;align-items:flex-start;justify-content:center;padding:10px;box-sizing:border-box}'
    + '.kp-overlay.open{display:flex}'
    + '.kp-box{background:var(--surface,#fff);color:var(--text,#222);width:min(680px,100%);max-height:94dvh;overflow-y:auto;border-radius:14px;box-sizing:border-box;padding:0 16px 16px;box-shadow:0 12px 40px rgba(0,0,0,.35)}'
    + '.kp-top{position:sticky;top:0;background:inherit;display:flex;align-items:center;justify-content:space-between;padding:12px 0 8px;z-index:2}'
    + '.kp-top strong{font-size:16px}'
    + '.kp-x{width:44px;height:44px;border-radius:10px;border:1px solid var(--border,#ccc);background:transparent;color:inherit;font-size:18px;cursor:pointer}'
    + '.kp-box label{display:block;font-size:13px;font-weight:600;margin:14px 0 4px;line-height:1.45}'
    + '.kp-box input,.kp-box textarea{width:100%;box-sizing:border-box;font-size:16px;min-height:44px;padding:10px 12px;border:1px solid var(--border,#bbb);border-radius:10px;background:transparent;color:inherit}'
    + '.kp-box textarea{min-height:76px}'
    + '.kp-note{font-size:12.5px;color:var(--muted,#777);line-height:1.6;margin-top:8px}'
    + '.kp-status{font-size:13.5px;margin-top:12px;line-height:1.6}'
    + '.kp-sendbar{position:sticky;bottom:0;background:inherit;display:flex;gap:10px;padding:12px 0 2px;z-index:2}'
    + '.kp-send{flex:1;min-height:48px;border:0;border-radius:10px;background:var(--accent,#b8860b);color:#fff;font-size:15px;font-weight:700;cursor:pointer}'
    + '.kp-cancel{min-height:48px;padding:0 18px;border-radius:10px;border:1px solid var(--border,#bbb);background:transparent;color:inherit;font-size:15px;cursor:pointer}'
    + '.kp-mrow{border:1px solid var(--border,#bbb);border-radius:10px;padding:10px 12px 12px;margin-top:10px}'
    + '.kp-mhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px}'
    + '.kp-mhead span{font-size:13px;font-weight:700}'
    + '.kp-mdel{min-height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--border,#bbb);background:transparent;color:inherit;font-size:13px;cursor:pointer}'
    + '.kp-mrow label{margin-top:10px}'
    + '.kp-madd{width:100%;min-height:44px;margin-top:10px;border-radius:10px;border:1px dashed var(--border,#bbb);background:transparent;color:inherit;font-size:14px;cursor:pointer}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var ov = document.createElement('div');
  ov.className = 'kp-overlay';
  ov.innerHTML = '<div class="kp-box" role="dialog" aria-modal="true">'
    + '<div class="kp-top"><strong id="kp-title">プロフィールの追加・修正</strong><button type="button" class="kp-x" id="kp-close" aria-label="閉じる">✕</button></div>'
    + '<div id="kp-fields"></div>'
    + '<p class="kp-note">現在のプロフィール値を表示しています。直す箇所だけ変更して送信してください。空欄にした項目は「未設定への変更」として送られます。送信内容は受付で確認され、ガイド本体のプロフィールに反映されます。反映後にこの画面を開き直すと新しい値で確認できます。</p>'
    + '<p class="kp-status" id="kp-status"></p>'
    + '<div class="kp-sendbar"><button type="button" class="kp-send" id="kp-send">送信する</button><button type="button" class="kp-cancel" id="kp-cancel">閉じる</button></div>'
    + '</div>';
  document.body.appendChild(ov);
  function $(id) { return ov.querySelector('#' + id); }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function field(label, id, val, area) {
    if (area) return '<label for="' + id + '">' + label + '</label><textarea id="' + id + '">' + esc(val) + '</textarea>';
    return '<label for="' + id + '">' + label + '</label><input id="' + id + '" type="text" value="' + esc(val) + '">';
  }
  var cur = { kind: '', name: '' };
  function memberRow(mb, idx) {
    mb = mb || {};
    return '<div class="kp-mrow">'
      + '<div class="kp-mhead"><span>メンバー' + (idx + 1) + '</span><button type="button" class="kp-mdel">削除</button></div>'
      + '<label>名前<input type="text" class="kp-m-n" value="' + esc(mb.n || '') + '"></label>'
      + '<label>役割<input type="text" class="kp-m-r" value="' + esc(mb.r || '') + '"></label>'
      + '<label>X<input type="text" class="kp-m-x" value="' + esc(mb.x || '') + '"></label>'
      + '<label>Instagram<input type="text" class="kp-m-i" value="' + esc(mb.i || '') + '"></label>'
      + '<label>所属グループ（任意）<input type="text" class="kp-m-g" value="' + esc(mb.g || '') + '"></label>'
      + '</div>';
  }
  function renumberMembers() {
    var rows = ov.querySelectorAll('.kp-mrow');
    for (var i = 0; i < rows.length; i++) {
      var sp = rows[i].querySelector('.kp-mhead span');
      if (sp) sp.textContent = 'メンバー' + (i + 1);
    }
  }
  function open(kind, name) {
    var bridge = window.KGEditorBridge;
    if (!bridge) return;
    cur = { kind: kind, name: name };
    var data = kind === 'artist' ? bridge.getArtistProfile(name) : bridge.getVenueProfile(name);
    var p = data.profile || {};
    $('kp-title').textContent = (kind === 'artist' ? 'アーティスト' : '会場') + 'プロフィールの追加・修正';
    var h = '<p style="margin:6px 0 0;font-size:15px;font-weight:700">' + esc(name) + '</p>';
    if (kind === 'artist') {
      h += field('カテゴリ', 'kp-f-cat', p.c || data.cat || '');
      h += field('公式サイト', 'kp-f-w', p.w || '');
      h += field('X', 'kp-f-x', p.x || '');
      h += field('Instagram', 'kp-f-i', p.i || '');
      h += field('TikTok', 'kp-f-t', p.t || '');
      h += field('紹介文', 'kp-f-p', p.p || '', true);
      h += field('別名（、区切り）', 'kp-f-al', (p.al || []).join('、'));
      h += '<label>メンバー</label><div id="kp-members">'
        + (p.m || []).map(function (mb, i) { return memberRow(mb, i); }).join('')
        + '</div><button type="button" class="kp-madd" id="kp-madd">＋ メンバーを追加</button>'
        + '<p class="kp-note">スペース版と同じく、1人に1ブロックで名前・役割・X・Instagramを別々の欄に入力します。不要なメンバーは「削除」で外してください。</p>';
    } else {
      h += field('住所', 'kp-f-ad', p.ad || '');
      h += field('ジャンル', 'kp-f-gn', p.gn || '');
      h += field('施設種別', 'kp-f-tp', p.tp || '');
      h += field('公式サイト', 'kp-f-ws', p.ws || '');
      h += field('X', 'kp-f-x', p.x || '');
      h += field('Instagram', 'kp-f-ig', p.ig || '');
      h += field('アクセス', 'kp-f-ac', p.ac || '', true);
      h += field('収容人数', 'kp-f-cp', p.cp || '');
      h += field('営業時間', 'kp-f-hr', p.hr || '');
      h += field('紹介文', 'kp-f-sm', p.sm || '', true);
    }
    h += field('根拠・出典（公式ページや公式SNSのURLなど）', 'kp-f-src', '', true);
    h += field('備考', 'kp-f-note', '', true);
    $('kp-fields').innerHTML = h;
    $('kp-status').textContent = '';
    ov.classList.add('open');
  }
  $('kp-fields').addEventListener('click', function (e) {
    if (e.target && e.target.id === 'kp-madd') {
      var box = $('kp-members'); if (!box) return;
      box.insertAdjacentHTML('beforeend', memberRow({}, box.querySelectorAll('.kp-mrow').length));
      renumberMembers();
      return;
    }
    var del = e.target && e.target.closest ? e.target.closest('.kp-mdel') : null;
    if (del) {
      var row = del.closest('.kp-mrow');
      if (row) { row.remove(); renumberMembers(); }
    }
  });
  function close() { ov.classList.remove('open'); }
  $('kp-close').addEventListener('click', close);
  $('kp-cancel').addEventListener('click', close);
  ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  function val(id) { var el = $(id); return el ? el.value.trim() : ''; }
  $('kp-send').addEventListener('click', async function () {
    var status = function (t) { $('kp-status').textContent = t; };
    var payload;
    if (cur.kind === 'artist') {
      var members = [];
      ov.querySelectorAll('.kp-mrow').forEach(function (row) {
        function rv(cls) { var el = row.querySelector(cls); return el ? el.value.trim() : ''; }
        var mb = { name: rv('.kp-m-n'), role: rv('.kp-m-r'), x: rv('.kp-m-x'), instagram: rv('.kp-m-i'), group: rv('.kp-m-g') };
        if (mb.name) members.push(mb);
      });
      var membersText = members.map(function (mb) { return [mb.name, mb.role, mb.x, mb.instagram, mb.group].join('｜'); }).join('\n');
      payload = {
        kind: 'artistProfile', targetName: cur.name,
        category: val('kp-f-cat'), linkWeb: val('kp-f-w'), linkX: val('kp-f-x'),
        linkInstagram: val('kp-f-i'), linkTikTok: val('kp-f-t'), profileText: val('kp-f-p'),
        aliases: val('kp-f-al') ? val('kp-f-al').split(/[、,，]/).map(function (x) { return x.trim(); }).filter(Boolean) : [],
        members: members, membersText: membersText, source: val('kp-f-src'), notes: val('kp-f-note')
      };
    } else {
      payload = {
        kind: 'venueProfile', targetName: cur.name,
        address: val('kp-f-ad'), genre: val('kp-f-gn'), type: val('kp-f-tp'),
        linkWeb: val('kp-f-ws'), linkX: val('kp-f-x'), linkInstagram: val('kp-f-ig'),
        access: val('kp-f-ac'), capacity: val('kp-f-cp'), hours: val('kp-f-hr'),
        summary: val('kp-f-sm'), source: val('kp-f-src'), notes: val('kp-f-note')
      };
    }
    payload.submitter = (function () { try { return localStorage.getItem('kg_admin_mode_v1') === '1' ? 'admin' : 'guest'; } catch (e) { return 'guest'; } })();
    payload._subject = '【プロフィール修正】' + (cur.kind === 'artist' ? 'アーティスト' : '会場') + '：' + cur.name;
    payload._template = 'table';
    payload._captcha = 'false';
    var btn = $('kp-send'); btn.disabled = true;
    status('送信しています…');
    try {
      var ctl = ('AbortController' in window) ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, 25000) : null;
      var res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload), signal: ctl ? ctl.signal : undefined });
      if (timer) clearTimeout(timer);
      var data = await res.json().catch(function () { return null; });
      if (data && (data.ok || data.success === 'true' || data.success === true)) status('送信しました。確認のうえガイドへ反映されます。');
      else status('送信できませんでした。時間をおいてお試しください。');
    } catch (e) {
      status('送信の確認ができませんでした（受付からの応答がありませんでした）。受付に届いている場合があるので、少し時間をおき、届いていないときだけ再送してください。');
    } finally { btn.disabled = false; }
  });
  window.KGProfileEditor = { open: open };
})();
