/* プロフィール（アーティスト/会場）の追加・修正フォーム。
   スペース版ガイドのプロフィール保存項目に合わせ、現在の値を初期表示して
   申請形式で受付へ送る。受付でガイド本体に反映され、プロフィールデータが
   更新されると詳細画面に新しい値が出る（＝確認できる）。
   送信先はイベント編集と同じ受付口（editor-config.js）。 */
(function () {
  var cfg = window.KG_EDITOR_CONFIG || {};
  if (!cfg.formAction) return;
  var css = ''
    + '.kp-overlay{position:fixed;inset:0;background:rgba(10,10,20,.55);z-index:1200;display:none;align-items:flex-start;justify-content:center;padding:10px;box-sizing:border-box}'
    + '.kp-overlay.open{display:flex}'
    + '.kp-box{background:var(--surface,#fff);color:var(--text,#222);width:min(680px,100%);max-height:94dvh;display:flex;flex-direction:column;overflow:hidden;border-radius:14px;box-sizing:border-box;padding:0;box-shadow:0 12px 40px rgba(0,0,0,.35)}'
    + '.kp-top{flex:none;display:flex;align-items:center;justify-content:space-between;padding:12px 16px 8px}'
    + '.kp-scroll{overflow-y:auto;flex:1;padding:0 16px;-webkit-overflow-scrolling:touch}'
    + '.kp-top strong{font-size:16px}'
    + '.kp-x{width:44px;height:44px;border-radius:10px;border:1px solid var(--border,#ccc);background:transparent;color:inherit;font-size:18px;cursor:pointer}'
    + '.kp-box label{display:block;font-size:13px;font-weight:600;margin:14px 0 4px;line-height:1.45}'
    + '.kp-box input,.kp-box textarea{width:100%;box-sizing:border-box;font-size:16px;min-height:44px;padding:10px 12px;border:1px solid var(--border,#bbb);border-radius:10px;background:transparent;color:inherit}'
    + '.kp-box textarea{min-height:76px}'
    + '.kp-note{font-size:12.5px;color:var(--muted,#777);line-height:1.6;margin-top:8px}'
    + '.kp-status{font-size:13.5px;margin-top:12px;line-height:1.6}'
    + '.kp-sendbar{flex:none;display:flex;gap:10px;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--border,#ddd)}'
    + '.kp-send{flex:1;min-height:48px;border:0;border-radius:10px;background:var(--accent,#b8860b);color:#fff;font-size:15px;font-weight:700;cursor:pointer}'
    + '.kp-cancel{min-height:48px;padding:0 18px;border-radius:10px;border:1px solid var(--border,#bbb);background:transparent;color:inherit;font-size:15px;cursor:pointer}'
    + '.kp-mrow{border:1px solid var(--border,#bbb);border-radius:10px;padding:10px 12px 12px;margin-top:10px}'
    + '.kp-mhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px}'
    + '.kp-mhead span{font-size:13px;font-weight:700}'
    + '.kp-mdel{min-height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--border,#bbb);background:transparent;color:inherit;font-size:13px;cursor:pointer}'
    + '.kp-mrow label{margin-top:10px}'
    + '.kp-madd{width:100%;min-height:44px;margin-top:10px;border-radius:10px;border:1px dashed var(--border,#bbb);background:transparent;color:inherit;font-size:14px;cursor:pointer}'
    + '.kp-mbtns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}'
    + '.kp-mbtns button{flex:1;min-height:40px;border-radius:10px;border:1px solid var(--border,#bbb);background:transparent;color:inherit;font-size:13.5px;cursor:pointer;min-width:150px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var ov = document.createElement('div');
  ov.className = 'kp-overlay';
  ov.innerHTML = '<div class="kp-box" role="dialog" aria-modal="true">'
    + '<div class="kp-top"><strong id="kp-title">プロフィールの追加・修正</strong><button type="button" class="kp-x" id="kp-close" aria-label="閉じる">✕</button></div>'
    + '<div class="kp-scroll"><div id="kp-fields"></div>'
    + '<p class="kp-note">現在のプロフィール値を表示しています。直す箇所だけ変更して送信してください。空欄にした項目は「未設定への変更」として送られます。送信内容は受付で確認され、ガイド本体のプロフィールに反映されます。反映後にこの画面を開き直すと新しい値で確認できます。</p>'
    + '<p class="kp-status" id="kp-status"></p></div>'
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
  var mTextManual = false;
  function parseMemberLines(text) {
    return String(text || '').split('\n').map(function (line) {
      var parts = line.split(/[|｜]/).map(function (x) { return x.trim(); });
      return { n: parts[0] || '', r: parts[1] || '', x: parts[2] || '', i: parts[3] || '', g: parts[4] || '' };
    }).filter(function (mb) { return mb.n; });
  }
  function memberLine(mb) { return [mb.n || '', mb.r || '', mb.x || '', mb.i || '', mb.g || ''].join(' | '); }
  function rowsToMembers() {
    var out = [];
    ov.querySelectorAll('.kp-mrow').forEach(function (row) {
      function rv(cls) { var el = row.querySelector(cls); return el ? el.value.trim() : ''; }
      var mb = { n: rv('.kp-m-n'), r: rv('.kp-m-r'), x: rv('.kp-m-x'), i: rv('.kp-m-i'), g: rv('.kp-m-g') };
      if (mb.n) out.push(mb);
    });
    return out;
  }
  function rebuildMembers(mbs) {
    var box = $('kp-members'); if (!box) return;
    box.innerHTML = (mbs || []).map(function (mb, i) { return memberRow(mb, i); }).join('');
    renumberMembers();
  }
  function renumberMembers() {
    var rows = ov.querySelectorAll('.kp-mrow');
    for (var i = 0; i < rows.length; i++) {
      var sp = rows[i].querySelector('.kp-mhead span');
      if (sp) sp.textContent = 'メンバー' + (i + 1);
    }
  }
  /* ログイン必須ゲート（Kota指示 2026-11-24、イベント編集と同一ルール） */
  function kpLoggedIn() {
    try {
      return localStorage.getItem('kg_admin_mode_v1') === '1'
        || !!localStorage.getItem('kg_member_session_v2')
        || !!localStorage.getItem('kg_account_selected_user_v1');
    } catch (e) { return false; }
  }
  function open(kind, name) {
    var bridge = window.KGEditorBridge;
    if (!bridge) return;
    if (!kpLoggedIn()) {
      cur = { kind: kind, name: name };
      $('kp-title').textContent = 'プロフィールの追加・修正';
      $('kp-fields').innerHTML = '<div style="border:1.5px solid #b92b37;border-radius:12px;padding:16px;margin-top:10px">'
        + '<p style="font-weight:800;margin:0 0 8px">ログインが必要です</p>'
        + '<p style="font-size:13.5px;margin:0 0 12px;line-height:1.6">プロフィールの追加・修正の送信は、ログインした方だけが使えます（管理者・主催者・アーティスト運営・閲覧者の役割分けのため）。</p>'
        + '<button type="button" id="kp-tologin" style="background:#b92b37;color:#fff;border:0;border-radius:999px;padding:10px 22px;font-weight:800;font-size:14px;min-height:44px;cursor:pointer">ログインする</button></div>';
      $('kp-status').textContent = '';
      var sb = $('kp-send'); sb.disabled = true; sb.style.opacity = '.4';
      var lb = $('kp-tologin');
      if (lb) lb.addEventListener('click', function () {
        ov.classList.remove('open');
        var b = document.getElementById('kg-account-open');
        if (b) b.click();
      });
      ov.classList.add('open');
      return;
    }
    var sb2 = $('kp-send'); sb2.disabled = false; sb2.style.opacity = '';
    cur = { kind: kind, name: name };
    var data = kind === 'artist' ? bridge.getArtistProfile(name) : bridge.getVenueProfile(name);
    var p = data.profile || {};
    $('kp-title').textContent = (kind === 'artist' ? 'アーティスト' : '会場') + 'プロフィールの追加・修正';
    var h = '<p style="margin:6px 0 0;font-size:15px;font-weight:700">' + esc(name) + '</p>';
    if (kind === 'artist') {
      h += '<label for="kp-f-cat">カテゴリ</label><select id="kp-f-cat"><option value="">（未設定）</option>' + ['アイドル','メンズアイドル','ユニドル','音楽','バンド','ガールズバンド','ダンス','ダンスボーカル','食フェス','バル','マルシェ','ハンドメイド','学祭','文化祭','お笑い','地域まつり','舞台・その他','スポーツ','イルミネーション','展示・展覧会','体験・ワークショップ','コスプレ','DJ','アニクラ','歌い手','踊り手','ファッションショー','撮影会'].map(function (c) { return '<option value="' + c + '"' + (c === (p.c || data.cat || '') ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>';
      h += field('読み（カタカナ）', 'kp-f-rd', data.reading || '');
      h += field('公式サイト', 'kp-f-w', p.w || '');
      h += field('X', 'kp-f-x', p.x || '');
      h += field('Instagram', 'kp-f-i', p.i || '');
      h += field('TikTok', 'kp-f-t', p.t || '');
      h += field('紹介文', 'kp-f-p', p.p || '', true);
      h += field('別名（、区切り）', 'kp-f-al', (p.al || []).join('、'));
      h += field('略称（、区切り）', 'kp-f-ab', '');
      h += field('ファンネーム（、区切り）', 'kp-f-fn', '');
      h += '<p class="kp-note">略称とファンネームは、新しく追加する分だけ書いてください（既存の分は上の「別名」にまとまって表示されています）。送信時に種類付きで受付へ送られ、検索でもその呼び方で探せるようになります。</p>';
      h += '<label>メンバー</label><div id="kp-members">'
        + (p.m || []).map(function (mb, i) { return memberRow(mb, i); }).join('')
        + '</div><button type="button" class="kp-madd" id="kp-madd">＋ メンバーを追加</button>'
        + '<p class="kp-note">スペース版と同じく、1人に1ブロックで名前・役割・X・Instagramを別々の欄に入力します。不要なメンバーは「削除」で外してください。</p>'
        + '<label for="kp-f-mtext">メンバー一括入力（テンプレート・貼り付け用）</label>'
        + '<textarea id="kp-f-mtext">' + esc((p.m || []).map(memberLine).join('\n')) + '</textarea>'
        + '<div class="kp-mbtns"><button type="button" id="kp-m2rows">テキストを行形式に反映</button><button type="button" id="kp-m2text">行形式をテキストに書き出す</button></div>'
        + '<p class="kp-note">1行に1人「名前 | 役割 | X | Instagram | 所属グループ」の形式です。テンプレートを作って貼り付けるのに使えます。テキストを書き換えた場合は、そのまま送信するとテキスト側の内容が優先されます。</p>';
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
    mTextManual = false;
    var mt = $('kp-f-mtext');
    if (mt) mt.addEventListener('input', function () { mTextManual = true; });
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
    if (e.target && e.target.id === 'kp-m2rows') {
      var ta1 = $('kp-f-mtext'); if (!ta1) return;
      rebuildMembers(parseMemberLines(ta1.value));
      mTextManual = false;
      return;
    }
    if (e.target && e.target.id === 'kp-m2text') {
      var ta2 = $('kp-f-mtext'); if (!ta2) return;
      ta2.value = rowsToMembers().map(memberLine).join('\n');
      mTextManual = false;
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
    if (!kpLoggedIn()) { $('kp-status').textContent = 'ログインが必要です。ログインしてから送信してください。'; return; }
    var status = function (t) { $('kp-status').textContent = t; };
    var payload;
    if (cur.kind === 'artist') {
      var srcMembers = (mTextManual && $('kp-f-mtext')) ? parseMemberLines($('kp-f-mtext').value) : rowsToMembers();
      var members = srcMembers.map(function (mb) { return { name: mb.n, role: mb.r, x: mb.x, instagram: mb.i, group: mb.g }; });
      var membersText = members.map(function (mb) { return [mb.name, mb.role, mb.x, mb.instagram, mb.group].join('｜'); }).join('\n');
      payload = {
        kind: 'artistProfile', targetName: cur.name,
        category: val('kp-f-cat'), linkWeb: val('kp-f-w'), linkX: val('kp-f-x'),
        linkInstagram: val('kp-f-i'), linkTikTok: val('kp-f-t'), profileText: val('kp-f-p'),
        aliases: val('kp-f-al') ? val('kp-f-al').split(/[、,，]/).map(function (x) { return x.trim(); }).filter(Boolean) : [],
        reading: val('kp-f-rd'),
        abbreviations: val('kp-f-ab') ? val('kp-f-ab').split(/[、,，]/).map(function (x) { return x.trim(); }).filter(Boolean) : [],
        fanNames: val('kp-f-fn') ? val('kp-f-fn').split(/[、,，]/).map(function (x) { return x.trim(); }).filter(Boolean) : [],
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
    /* 送信の実経路（v163）: イベント編集と同じ Google フォーム受付 */
    async function kgSendPayload(payload, ctl) {
      var body = new URLSearchParams();
      body.set(cfg.formSubjectEntry, payload._subject || '【プロフィール修正】');
      body.set(cfg.formPayloadEntry, JSON.stringify(payload));
      await fetch(cfg.formAction, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: ctl ? ctl.signal : undefined });
      return true;
    }
    var btn = $('kp-send'); btn.disabled = true;
    status('送信しています…');
    try {
      var ctl = ('AbortController' in window) ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, 25000) : null;
      var okSend = await kgSendPayload(payload, ctl);
      if (timer) clearTimeout(timer);
      if (okSend) {
        try {
          var lg = [];
          try { lg = JSON.parse(localStorage.getItem('kg_trial_submissions_v1') || '[]'); if (!Array.isArray(lg)) lg = []; } catch (_) { lg = []; }
          lg.push({ kind: payload.kind, name: cur.name, ts: Date.now() });
          localStorage.setItem('kg_trial_submissions_v1', JSON.stringify(lg.slice(-50)));
        } catch (_) {}
        status('送信しました。確認のうえガイドへ反映されます。');
      }
      else status('送信できませんでした。時間をおいてお試しください。');
    } catch (e) {
      status('送信の確認ができませんでした（受付からの応答がありませんでした）。受付に届いている場合があるので、少し時間をおき、届いていないときだけ再送してください。');
    } finally { btn.disabled = false; }
  });
  window.KGProfileEditor = { open: open };
})();
