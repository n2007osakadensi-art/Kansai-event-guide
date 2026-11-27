/* アカウントと推し／イベントの同期。
   保存先は二重化（Kota決定 2026-11-25）: 主軸＝アカウント用スプレッドシート
   （非公開＋Apps Script の入口経由）、保険＝Firestore。
   書き込みは主軸へ先に書き、保険へも best-effort で書く。読み込みは主軸を正とし、
   失敗したときだけ保険から読む。どちらか片方だけの設定でも動く。
   Google ログインの認証は Firebase Auth。未設定時は従来の端末内保存を維持します。 */
(function () {
  'use strict';
  var cfg = window.KG_ACCOUNT_CONFIG || {}, bridge = window.KGAccountBridge;
  var client = null, fbUser = null, user = null, initialized = false, running = false, generation = 0;
  var currentMarker = 'kg_account_selected_user_v1';
  var member = null, memberReady = false, choiceMode = 'google', pendingMemberCloud = null, memberPushTimer = null;
  var retryMemberBoot = null;
  var bootRestoring = false;
  var $ = function (id) { return document.getElementById(id); };
  var overlay = document.createElement('div');
  overlay.innerHTML = '<dialog id="kg-account-dialog" aria-labelledby="kg-account-title" style="width:min(94vw,480px);max-height:90vh;overflow:auto;border:1px solid #ccc;border-radius:16px;padding:22px;color:CanvasText;background:Canvas;box-shadow:0 8px 30px #0005">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><h2 id="kg-account-title" style="font-size:19px;margin:0">ログイン・同期</h2><button id="kg-account-close" type="button" aria-label="閉じる" style="min-width:44px">✕</button></div>' +
    '<p id="kg-account-status" role="status" aria-live="polite"></p>' +
    '<div id="kg-webview-warn" hidden style="border:1px solid #c0392b;border-radius:10px;padding:10px 12px;margin:8px 0"><p style="margin:0 0 6px;font-weight:700">アプリ内ブラウザではログインできません</p><p style="font-size:13px;margin:0 0 8px">Xなどのアプリの中で開いたページでは、Google本人確認が使えません。ログインしても、いつものブラウザに情報は引き継がれません。通常のブラウザ（Safari／Chrome）で開き直してください。</p><p style="margin:0"><button id="kg-webview-copy" type="button">このページのURLをコピー</button> <a id="kg-webview-open" href="#" hidden>ブラウザで開く（Android）</a></p></div>' +
    '<div id="kg-sync-panel" hidden><p id="kg-sync-last" style="font-size:13px;margin:4px 0"></p><p id="kg-sync-cloud" style="font-size:13px;margin:4px 0"></p><p id="kg-sync-err" style="font-size:13px;margin:4px 0;color:#b03a2e"></p><p style="font-size:13px;margin:4px 0">同期は自動でも行われます（変更時・約45秒ごと・アプリを離れる時）。確実に反映したいときは、このボタンで今すぐ同期できます。</p><button id="kg-sync-now" type="button">今すぐ同期する</button></div>' +
    '<div id="kg-account-off" hidden><p>ログインの接続設定はまだ完了していません。現在の推し・お気に入りはこの端末だけに保存されます。</p></div>' +
    '<div id="kg-login-form" hidden><p>Googleアカウントでログインします（ログインすると、推し・お気に入りの同期も始まります）。</p><button id="kg-google-login" type="button">Googleでログイン</button></div>' +
    '<div id="kg-account-user" hidden><p id="kg-email-display"></p><p>推し・お気に入り・マイリスト・行きたい／気になる・フォロー・好みなどをこのアカウントに同期します。回しプランはこの情報から作られます。</p><button id="kg-refresh" type="button">クラウドから再読み込み</button> <button id="kg-signout" type="button">ログアウト</button><span id="kg-signout-confirm" hidden> <span style="font-size:13px">ログアウトすると、この端末内のデータをすべて消去します。アカウントのデータは残ります。</span> <button id="kg-signout-yes" type="button">ログアウトする</button> <button id="kg-signout-no" type="button">やめる</button></span></div>' +
    '<div id="kg-account-choice" hidden><p><strong>この端末のデータをどうしますか？</strong></p><p>統合すると、この端末の推しとお気に入りがアカウントに追加されます。共有端末や別の方のデータなら「アカウントのデータを使う」を選んでください。</p><button id="kg-merge" type="button">この端末のデータを統合</button> <button id="kg-use-cloud" type="button">アカウントのデータを使う</button></div>' +
    '<div id="kg-member" hidden><hr><p><strong>会員コード</strong>（Googleアカウント不要）</p>' +
    '<div id="kg-member-off"><p>サイトが発行するコードがログインの鍵です。普段のログインはコードだけで、Googleアカウントは要りません。コードの発行（初回のみ）と、コードを失くしたときの再発行には、本人確認としてGoogleアカウントでの確認を行い、コードはそのGoogleアカウントに紐づきます。</p><button id="kg-code-issue" type="button">会員コードを発行する（初回はGoogle本人確認）</button><p><input id="kg-code-input" type="text" placeholder="持っているコードを入力" autocomplete="off" autocapitalize="characters" style="min-width:200px;padding:6px"> <button id="kg-code-login" type="button">コードでログイン</button></p><p style="font-size:13px">コードを失くした方は、発行時に紐づけたGoogleアカウントで本人確認をして、新しいコードを発行できます（古いコードは使えなくなります）。</p><p><button id="kg-google-recover" type="button">コードを失くした方（Google本人確認で新しいコードを発行）</button></p></div>' +
    '<div id="kg-role-apply"><hr><p><strong>アーティスト・主催者・会場の方へ</strong></p><p style="font-size:13px">ご本人確認のうえ、専用の会員コードを発行しています。希望される方は、次の内容を書いて kansai-event-info@muse.ai へメールしてください。</p><p style="font-size:13px">・お名前（アーティスト名・団体名・会場名）<br>・種別（アーティスト／主催者／会場）<br>・公式SNS（X・Instagram）または公式サイトのURL</p><p style="font-size:13px">ガイドのプロフィールに登録されている公式リンクと一致するか確認し、問題なければ会員コードを返信でお送りします。初回ログイン時に、Google本人確認でコードがそのGoogleアカウントに紐づきます。なお、このコードに特別な編集権限は付かず、イベントの登録・修正は従来どおりサイトのフォームからお送りいただく形です。</p><p><a href="mailto:kansai-event-info@muse.ai?subject=%E3%82%A2%E3%82%AB%E3%82%A6%E3%83%B3%E3%83%88%E7%99%BB%E9%8C%B2%E5%B8%8C%E6%9C%9B">メールで申し込む</a></p></div>' +
    '<div id="kg-member-on" hidden><p>会員コードでログイン中です。</p><p id="kg-role-display" hidden style="font-weight:700"></p><p>あなたのコード：<strong id="kg-code-display"></strong> <button id="kg-code-copy" type="button">コピー</button> <button id="kg-code-reissue" type="button">コードを再発行</button><span id="kg-code-reissue-confirm" hidden> <span style="font-size:13px">新しいコードを発行します。今までのコードは使えなくなります。</span> <button id="kg-code-reissue-yes" type="button">発行する</button> <button id="kg-code-reissue-no" type="button">やめる</button></span></p><p style="font-size:13px">このコードの控えがバックアップになります。別の端末ではこのコードを入力してください。</p><div id="kg-bind-block" hidden><p style="font-size:13px">このアカウントは、まだGoogleアカウントと紐づいていません。コードを失くしたときの本人確認のため、初回のみ紐づけをお願いします。</p><p><button id="kg-bind-google" type="button">Googleアカウントと紐づける</button></p></div><p style="font-size:13px">コードの再発行には、紐づけたGoogleアカウントでの本人確認が必要です。再発行すると、今までのコードは使えなくなります。</p><button id="kg-code-logout" type="button">この端末からログアウト</button><span id="kg-code-logout-confirm" hidden> <span style="font-size:13px">この端末内のデータをすべて消去します。会員コードの控えがない場合、データに戻れなくなります。</span> <button id="kg-code-logout-yes" type="button">ログアウトする</button> <button id="kg-code-logout-no" type="button">やめる</button></span></div></div>' +
    '<div id="kg-guest"><hr><p><strong>ゲスト利用</strong>（一時的な端末向け）</p>' +
    '<div id="kg-guest-off"><p style="font-size:13px">ログインせず、この端末にだけ保存して使います。共有端末や一時的な利用向けです。</p><button id="kg-guest-start" type="button">ゲストとして使う</button></div>' +
    '<div id="kg-guest-on" hidden><p>ゲスト利用中です。推し・お気に入りはこの端末にだけ保存されます。引き継ぎはヘッダーの「データ引っ越し」からバックアップできます。</p><button id="kg-guest-end" type="button">ゲスト利用を終了してデータを消す</button><span id="kg-guest-end-confirm" hidden> <span style="font-size:13px">この端末のデータを消去しますか？</span> <button id="kg-guest-end-yes" type="button">消去する</button> <button id="kg-guest-end-no" type="button">やめる</button></span></div></div>' +
    '<div id="kg-admin"><hr><p><strong>管理者モード</strong></p>' +
    '<div id="kg-admin-off"><p style="font-size:13px">管理者のGoogleアカウントでログインすると、この端末は自動で管理者モードになります（同期も同時に始まります）。有効化はGoogleログインだけです。</p></div>' +
    '<div id="kg-admin-on" hidden><p>管理者モードが有効です（この端末）。Googleログインで管理者になっている場合は、同期も有効になっています。同期にはGoogleログイン、または会員コードのログインが必要です（併用できます）。</p><div id="kg-role-admin"><hr><p><strong>アーティスト・主催者コード管理</strong></p><p style="font-size:13px">アーティスト・主催者向けの会員コードを発行・管理します。発行したコードを相手に渡してください。相手の初回ログイン時に、Google本人確認でコードがそのGoogleに紐づきます（通常のコードと同じ仕組み）。このコードに特別な編集権限は付かず、送信は従来どおりフォーム＋取り込み確認を通ります。</p><p><label>種別 <select id="kg-role-kind"><option value="artist">アーティスト</option><option value="organizer">主催者</option><option value="venue">会場</option></select></label></p><p><input id="kg-role-email" type="email" placeholder="申し込みメールアドレス（任意）" style="min-width:260px;padding:6px"></p><p><input id="kg-role-link" type="text" placeholder="紐づけ先（アーティストのプロフィールキー／主催者名）" list="kg-role-link-list" style="min-width:260px;padding:6px"><datalist id="kg-role-link-list"></datalist></p><p><button id="kg-role-issue" type="button">コードを発行する</button></p><p id="kg-role-issued" hidden>発行したコード：<strong id="kg-role-issued-code"></strong> <button id="kg-role-issued-copy" type="button">コピー</button> <button id="kg-role-issued-mail" type="button">返信文をコピー</button><br><span style="font-size:13px">このコードは後から再表示できません。必ず控えてから相手に渡してください。</span></p><p id="kg-role-list-status" style="font-size:13px"></p><div id="kg-role-list"></div><p><button id="kg-role-reload" type="button">一覧を読み直す</button></p></div><div id="kg-notice-admin"><hr><p><strong>\u304a\u77e5\u3089\u305b\u6295\u7a3f</strong></p><p style="font-size:13px">\u7ba1\u7406\u8005\u304b\u3089\u306e\u304a\u77e5\u3089\u305b\u3092\u6295\u7a3f\u3057\u307e\u3059\u3002\u9001\u4fe1\u3059\u308b\u3068\u53d7\u4ed8\u306b\u5c4a\u304d\u3001\u78ba\u8a8d\u5f8c\u306b\u30b5\u30a4\u30c8\u306e\u300c\u304a\u77e5\u3089\u305b\u300d\u3078\u53cd\u6620\u3055\u308c\u307e\u3059\uff08\u901a\u5e3030\u5206\u4ee5\u5185\uff09\u3002SNS\u6295\u7a3f\u306eURL\u3092\u5165\u308c\u308b\u3068\u3001X\u30fbInstagram\u30fbTikTok\u30fbThreads\u306e\u6295\u7a3f\u304c\u57cb\u3081\u8fbc\u307f\u8868\u793a\u3055\u308c\u307e\u3059\u3002</p><p><input id="kg-notice-title" type="text" placeholder="\u30bf\u30a4\u30c8\u30eb\uff08\u4efb\u610f\uff09" style="min-width:260px;padding:6px"></p><p><textarea id="kg-notice-body" rows="3" placeholder="\u672c\u6587" style="min-width:260px;padding:6px"></textarea></p><p><input id="kg-notice-embed" type="url" placeholder="SNS\u6295\u7a3f\u306eURL\uff08\u57cb\u3081\u8fbc\u307f\uff09" style="min-width:260px;padding:6px"></p><p><input id="kg-notice-url" type="url" placeholder="\u30ea\u30f3\u30afURL\uff08\u4efb\u610f\uff09" style="min-width:260px;padding:6px"></p><p><input id="kg-notice-urllabel" type="text" placeholder="\u30ea\u30f3\u30af\u6587\u8a00\uff08\u4efb\u610f\uff09" style="min-width:260px;padding:6px"></p><p><button id="kg-notice-send" type="button">\u304a\u77e5\u3089\u305b\u3092\u9001\u4fe1\u3059\u308b</button></p><p id="kg-notice-status" style="font-size:13px"></p></div><p><button id="kg-admin-disable" type="button">管理者モードを解除する</button></p></div></div>' +
    '<p style="font-size:13px">メールアドレス・推し・お気に入りを認証・保存サービスで扱います。サービス提供者のプライバシーポリシーをご確認ください。</p></dialog>';
  document.body.appendChild(overlay);
  var dialog = $('kg-account-dialog');
  function text(s) { $('kg-account-status').textContent = s; }
  function fmtSyncTime(t){ var d=new Date(t); function p2(n){ return (n<10?'0':'')+n; } return (d.getMonth()+1)+'/'+d.getDate()+' '+p2(d.getHours())+':'+p2(d.getMinutes()); }
  function markSynced(){ try{ localStorage.setItem('kg_last_sync_v1', String(Date.now())); }catch(e){} syncPanelRender(); }
  function syncPanelRender(){ var p=$('kg-sync-panel'); if(!p) return; p.hidden=!(member||user); var el=$('kg-sync-last'); if(el){ var t=0; try{ t=Number(localStorage.getItem('kg_last_sync_v1')||0);  syncCloudRender(); }catch(e){} el.textContent = t? ('最終同期：'+fmtSyncTime(t)) : '最終同期：まだ同期されていません'; } var ee=$('kg-sync-err'); if(ee){ var le=null; try{ le=JSON.parse(localStorage.getItem('kg_last_cloud_err_v1')||'null'); }catch(_){} ee.textContent = (le && le.m)? ('直近の同期エラー：'+le.m+'（'+fmtSyncTime(le.t)+'）') : ''; } }
  var syncCloudBusy=false;
  async function syncCloudRender(){
    var el=$('kg-sync-cloud'); if(!el) return;
    if(!(member&&memberReady) && !(user&&initialized)){ el.textContent=''; return; }
    if(syncCloudBusy) return; syncCloudBusy=true;
    try{
      var parts2=[], ud=null, upd=null;
      if(member&&memberReady){
        try{ docCacheDrop('m:'+member.acct); }catch(_){}
        var d=await memberDoc(member.acct);
        if(d){ parts2.push('お気に入り '+((d.events||[]).length)+'件'); parts2.push('推し '+((d.artists||[]).length)+'件'); ud=d.userdata||null; upd=d.udUpdatedAt||d.updatedAt||null; }
      } else {
        ud=await udGoogleGet(user.id);
      }
      ud=ud||{};
      var f=ud.follows||{};
      var pc=0; if(ud.plans&&Array.isArray(ud.plans.patterns)) ud.plans.patterns.forEach(function(p){ pc+=((p&&p.ids)||[]).length; });
      parts2.push('行きたい '+((ud.want||[]).length)+'件');
      parts2.push('気になる '+((ud.interest||[]).length)+'件');
      parts2.push('フォロー '+(((f.venues||[]).length)+((f.organizers||[]).length))+'件');
      parts2.push('マイリスト '+((ud.lists||[]).length)+'件');
      parts2.push('回しプラン '+pc+'件');
      parts2.push('カレンダー '+((ud.cals||[]).length)+'件');
      parts2.push('キーワード '+((ud.words||[]).length)+'件');
      var tx='クラウド保存：'+parts2.join('・');
      if(upd){ var dt=new Date(upd); tx+='（最終保存 '+(dt.getMonth()+1)+'/'+dt.getDate()+' '+('0'+dt.getHours()).slice(-2)+':'+('0'+dt.getMinutes()).slice(-2)+'）'; }
      el.textContent=tx;
    }catch(e){ el.textContent='クラウドの保存内容を確認できませんでした。'; }
    finally{ syncCloudBusy=false; }
  }
  function inAppBrowser(){ var ua=navigator.userAgent||''; if(/Twitter|Line\/|Instagram|FBAN|FBAV|FB_IAB|; wv\)/.test(ua)) return true; if(/(iPhone|iPad|iPod)/.test(ua) && !/Safari/.test(ua)) return true; return false; }
  function showModal() { syncPanelRender(); refreshBindBlock(); var wv=$('kg-webview-warn'); if(wv){ wv.hidden=!inAppBrowser(); var op=$('kg-webview-open'); if(op){ if(/Android/.test(navigator.userAgent||'')){ op.hidden=false; op.href='intent://'+location.host+location.pathname+'#Intent;scheme=https;end'; } else { op.hidden=true; } } } if(retryMemberBoot && !member){ try{ retryMemberBoot(); }catch(_){} } if (!dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open',''); } }
  $('kg-account-open').onclick = showModal;
  $('kg-webview-copy').onclick=function(){ var u=location.href; if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(u).then(function(){ text('URLをコピーしました。通常のブラウザに貼って開いてください。'); }, function(){ text('コピーできませんでした。アドレスバーのURLをコピーしてください。'); }); } };
  $('kg-account-close').onclick = function () { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); };
  function parts(off, login, logged, choice) { $('kg-account-off').hidden=!off; $('kg-login-form').hidden=!login; $('kg-account-user').hidden=!logged; $('kg-account-choice').hidden=!choice; }
  /* 同期待ち行列: 主軸用（kg_account_pending_v1_）と保険（Firestore）用を分ける。
     主軸の成功が利用者への「同期済み」。保険側は専用行列で静かに追いつく */
  function queueKey(uid) { return 'kg_account_pending_v1_' + uid; }
  function queueRead(uid) { try { var x=JSON.parse(localStorage.getItem(queueKey(uid))||'[]'); return Array.isArray(x)?x:[]; } catch(e) { return []; } }
  function queueWrite(uid,q) { localStorage.setItem(queueKey(uid),JSON.stringify(q)); }
  function enqueue(uid, ops) { var q=queueRead(uid); queueWrite(uid,q.concat(ops)); }
  function fsQueueKey(uid) { return 'kg_account_pending_fs_v1_' + uid; }
  function fsQueueRead(uid) { try { var x=JSON.parse(localStorage.getItem(fsQueueKey(uid))||'[]'); return Array.isArray(x)?x:[]; } catch(e) { return []; } }
  function fsQueueWrite(uid,q) { localStorage.setItem(fsQueueKey(uid),JSON.stringify(q.slice(-500))); }
  function fsEnqueue(uid, ops) { var q=fsQueueRead(uid); fsQueueWrite(uid,q.concat(ops)); }
  function sameUser(uid,g) { return !!user && user.id===uid && generation===g; }
  function favoriteId(kind,value) {
    var bytes=new TextEncoder().encode(kind+':'+value), binary='';
    bytes.forEach(function(b){binary+=String.fromCharCode(b);});
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  /* 通信のタイムアウト（v53）: オフライン等で Promise が永遠に戻らないと
     同期全体が無言で止まるため、15秒で失敗として扱う */
  function fsTimeout(p, label) {
    return Promise.race([p, new Promise(function (_, rej) {
      setTimeout(function () { var e = new Error(label || '通信がタイムアウトしました'); e.code = 'kg-timeout'; rej(e); }, 15000);
    })]);
  }
  /* クラウド同期の自動停止（v110）: 接続できない状態で自動リトライを繰り返すと
     端末に負荷がかかり続けるため、2回連続で失敗したらそのセッションでは30分間、
     自動のクラウド通信を止める。手動の操作は止めない。成功したら即解除する */
  var cloudFails=0, cloudDownUntil=0;
  try{ cloudDownUntil=+sessionStorage.getItem('kg_cloud_down_until')||0; }catch(e){}
  function cloudBlocked(){ return Date.now()<cloudDownUntil; }
  function noteCloudFail(err){ cloudFails++; if(err && (err.message||err.code)){ try{ localStorage.setItem('kg_last_cloud_err_v1', JSON.stringify({m:String(err.message||err.code).slice(0,120), t:Date.now()})); }catch(_){} } if(cloudFails>=4){ cloudDownUntil=Date.now()+10*60*1000; try{ sessionStorage.setItem('kg_cloud_down_until', String(cloudDownUntil)); }catch(e){} } }
  function noteCloudOk(){ cloudFails=0; try{ localStorage.removeItem('kg_last_cloud_err_v1'); }catch(_){} if(cloudDownUntil){ cloudDownUntil=0; try{ sessionStorage.removeItem('kg_cloud_down_until'); }catch(e){} } }
  /* ================= 保険側: Firestore ================= */
  async function fsApplyOps(uid, readFn, writeFn) {
    var q=readFn(uid);
    while(q.length) {
      var x=q[0];
      var ref=client.doc(client.db,'users',uid,'favorites',favoriteId(x.kind,x.value));
      if(x.op==='add') await fsTimeout(client.setDoc(ref,{kind:x.kind,item_id:x.value}), '同期がタイムアウトしました');
      else await fsTimeout(client.deleteDoc(ref), '同期がタイムアウトしました');
      // 読み出し中に追加された操作を失わない
      var now=readFn(uid); now.shift(); writeFn(uid,now); q=now;
    }
    return true;
  }
  var fsDraining=false;
  async function fsDrain(uid) {
    if(!client || fsDraining) return;
    if(!fsQueueRead(uid).length) return;
    fsDraining=true;
    try { await fsApplyOps(uid, fsQueueRead, fsQueueWrite); } catch(e) { /* 保険側の失敗は静かに残す */ }
    finally { fsDraining=false; }
  }
  async function fsPull(uid) {
    var data={event:[],artist:[]}, last=null, pageSize=500;
    var pages=0;
    while(true) {
      if(++pages>20) throw new Error('読み込み件数が上限を超えました');
      var col=client.collection(client.db,'users',uid,'favorites');
      var q=last ? client.query(col,client.orderBy(client.documentId()),client.startAfter(last),client.limit(pageSize)) : client.query(col,client.orderBy(client.documentId()),client.limit(pageSize));
      var snapshot=await fsTimeout(client.getDocs(q), 'クラウドの読み込みがタイムアウトしました');
      snapshot.docs.forEach(function(doc){var x=doc.data();if(data[x.kind] && typeof x.item_id==='string')data[x.kind].push(x.item_id);});
      if(snapshot.docs.length<pageSize)break;
      last=snapshot.docs[snapshot.docs.length-1];
    }
    return data;
  }
  /* ================= 主軸: アカウント用シート（Apps Script 経由） ================= */
  var SYNC_URL = (cfg.syncEndpoint || '').trim();
  function syncReady(){ return !!SYNC_URL; }
  /* 入口は同時リクエストを1本の行列で捌くため、この端末からの
     呼び出しは1件ずつ順番に送る（v153）。自分のリクエスト同士が
     入口で競合して制限時間を超える失敗を防ぐ */
  var kvChain=Promise.resolve();
  async function kvCall(body){
    var run=kvChain.then(function(){ return kvCallInner(body); });
    kvChain=run.then(function(){}, function(){});
    return run;
  }
  async function kvCallInner(body) {
    if(!SYNC_URL){ var e0=new Error('同期の接続先が未設定です'); e0.code='kg-no-endpoint'; throw e0; }
    // 入口側が混んでいる（ロック待ち）・一時的に遅い場合は、間隔をあけて
    // 最大3回まで試す。恒常的な失敗は最後のエラーをそのまま投げる。
    var waits=[0, 2500, 5000], lastErr=null;
    for(var ai=0; ai<waits.length; ai++){
      if(waits[ai]) await new Promise(function(r){ setTimeout(r, waits[ai]); });
      try {
        var p=(async function(){
          var res=await fetch(SYNC_URL, {method:'POST', headers:{'Content-Type':'text/plain'}, body:JSON.stringify(body)});
          var j=null; try{ j=await res.json(); }catch(_){}
          if(!j || !j.ok){ var e=new Error((j&&j.error)||('HTTP '+res.status)); e.code=(j&&j.code)||'kg-sync'; if(/Lock/.test(e.message)) e.code='kg-busy'; throw e; }
          return j;
        })();
        return await Promise.race([p, new Promise(function(_, rej){ setTimeout(function(){ var e=new Error('同期がタイムアウトしました'); e.code='kg-timeout'; rej(e); }, 30000); })]);
      } catch(e) {
        lastErr=e;
        var retryable = e && (e.code==='kg-busy' || e.code==='kg-timeout' || /^HTTP 5/.test(e.message||''));
        if(!retryable) throw e;
      }
    }
    throw lastErr;
  }
  async function kvGet(key, token){ var body={op:'get', key:key}; if(token) body.token=token; var j=await kvCall(body); return j.found ? j.value : null; }
  async function kvSet(key, value, token){ var body={op:'set', key:key, value:value}; if(token) body.token=token; await kvCall(body); }
  async function kvMerge(key, fields, token){ var body={op:'merge', key:key, value:fields}; if(token) body.token=token; await kvCall(body); }
  async function kvDel(key, token){ var body={op:'del', key:key}; if(token) body.token=token; await kvCall(body); }
  /* アカウント文書の短期キャッシュ（v156）: ログイン直後は同じ文書
     （m:/g:）を お気に入り取得・userdata取得・書き戻し判定で何度も読む。
     入口は全リクエスト直列＋ロックで1回が重いため、30秒以内の再読は
     通信せず、書き込みはキャッシュへも反映して整合を保つ */
  var docCache={};
  function docCacheGet(key){ var c=docCache[key]; return (c && (Date.now()-c.at)<30000) ? c.value : undefined; }
  function docCachePut(key, v){ docCache[key]={value:v, at:Date.now()}; }
  function docCacheMerge(key, fields){ var c=docCache[key]; if(c && c.value && typeof c.value==='object'){ Object.keys(fields).forEach(function(k){ c.value[k]=fields[k]; }); c.at=Date.now(); } }
  function docCacheDrop(key){ delete docCache[key]; }
  async function idToken(){
    if(!fbUser) return null;
    try{ var t=await fbUser.getIdToken(); if(t) return t; }catch(_){}
    /* キャッシュ側のトークンが失効・破損していても、更新トークンが生きて
       いれば強制更新で取り直せる（v241、Kota指摘「トークン失ってる」対策）。
       ここで null を返すと同期全体が「ログイン情報が確認できませんでした」
       で止まるため、1回だけ強制更新を試す */
    try{ return await fbUser.getIdToken(true); }catch(_){ return null; }
  }
  async function googleKeyOf(uid){ return 'g:' + await sha256hex('kg-google:' + uid); }
  /* ================= 振り分け（主軸→保険） ================= */
  async function flush(uid,g) {
    if (running) return false;
    running=true;
    try {
      if(queueRead(uid).length) {
        if(syncReady()) {
          var token=await idToken(); if(!token) throw new Error('ログイン情報が確認できませんでした');
          var key=await googleKeyOf(uid);
          var q=queueRead(uid);
          await kvCall({op:'favops', key:key, token:token, ops:q});
          docCacheDrop(key);
          // 送信中に追加された操作を失わない: 送った分だけ先頭から落とす
          var now=queueRead(uid); now.splice(0,q.length); queueWrite(uid,now);
        } else if(client) {
          await fsApplyOps(uid, queueRead, queueWrite);
        } else {
          return false;
        }
      }
      return sameUser(uid,g) && !queueRead(uid).length;
    } catch(e) { noteCloudFail(e); text('同期できていません。端末内には保存済みです。通信を確認して「クラウドから再読み込み」を押してください。'); return false; }
    finally { running=false; }
  }
  /* ログイン直後の初期化が一時的な失敗（通信の競合・トークンの取り直し・
     別処理の送信中）で止まると、initialized が立たず、その後の同期が全部
     静かに止まっていた（v241で自己回復化）。送信中なら終わるまで待って
     から送り、初期化に失敗したら間隔をあけて自動でやり直す */
  async function flushWait(uid,g){
    for(var i=0;i<70 && running;i++){ await new Promise(function(r){ setTimeout(r,500); }); }
    return flush(uid,g);
  }
  var initRetryCount=0, initRetryTimer=null;
  function scheduleInitRetry(uid,g,fn){
    if(initialized || !sameUser(uid,g)) return;
    if(initRetryCount>=6) return;
    initRetryCount++;
    if(initRetryTimer) clearTimeout(initRetryTimer);
    var delays=[8000,20000,40000,60000,90000,120000];
    initRetryTimer=setTimeout(function(){ if(!initialized && sameUser(uid,g)) fn(); }, delays[Math.min(initRetryCount-1,5)]);
  }
  async function pull(uid) {
    var sheetErr=null;
    if(cloudBlocked()){ var be=new Error('クラウド同期は一時停止中です'); be.code='kg-cloud-down'; throw be; }
    if(syncReady()) {
      try {
        var token=await idToken(); if(!token) throw new Error('ログイン情報が確認できませんでした');
        var gk=await googleKeyOf(uid);
        var v=docCacheGet(gk);
        if(v===undefined){ v=await kvGet(gk, token); docCachePut(gk, v); }
        noteCloudOk();
        var f=(v && v.favorites) || {};
        return {event:Array.isArray(f.event)?f.event:[], artist:Array.isArray(f.artist)?f.artist:[]};
      } catch(e) { if(!client) throw e; sheetErr=e; /* 保険から読む */ }
    }
    try { var data=await fsPull(uid); noteCloudOk(); return data; } catch(e2) { throw sheetErr||e2; }
  }
  /* ログアウト時の端末データ全消去（v155）: 推し・お気に入りだけでなく
     行きたい/気になる/リスト/フォロー/プラン/設定/学習など端末内の
     利用者データをすべて消す。消し漏れがあると次の利用者に残り、
     再ログイン時の復元と区別もつかなくなる */
  function wipeLocalUserData(){
    try{
      Object.keys(UD_KEYS).forEach(function(k){ localStorage.removeItem(UD_KEYS[k]); });
      localStorage.removeItem(bridge.keys.event); localStorage.removeItem(bridge.keys.artist);
      localStorage.removeItem('kg_member_session_v2'); localStorage.removeItem('kg_member_selected_v2');
      localStorage.removeItem('kg_member_code_v1'); localStorage.removeItem('kg_member_selected_v1');
      try{ sessionStorage.removeItem('kg_ud_reloaded'); }catch(_){}
    }catch(_){}
  }
  function backendMissing(){ var e=new Error('接続の準備中です'); e.code='kg-no-backend'; return e; }
  async function memberDoc(acct) {
    var ck='m:'+acct, cached=docCacheGet(ck);
    if(cached!==undefined) return cached;
    var sheetErr=null;
    if(syncReady()) { try { var v=await kvGet(ck); docCachePut(ck, v); return v; } catch(e) { if(!client) throw e; sheetErr=e; } }
    if(client) { try { var snap=await fsTimeout(client.getDoc(client.doc(client.db,'memberdata',acct)), 'データの読み込みがタイムアウトしました'); var dv=snap.exists() ? (snap.data()||{}) : null; docCachePut(ck, dv); return dv; } catch(e2) { throw sheetErr||e2; } }
    throw backendMissing();
  }
  async function memberWriteFields(acct, fields) {
    if(syncReady()) {
      await kvMerge('m:'+acct, fields);
      docCacheMerge('m:'+acct, fields);
      if(client) { try { await fsTimeout(client.setDoc(client.doc(client.db,'memberdata',acct), fields, {merge:true}), '同期がタイムアウトしました'); } catch(e) {} }
      return;
    }
    if(client) { await fsTimeout(client.setDoc(client.doc(client.db,'memberdata',acct), fields, {merge:true}), '保存がタイムアウトしました'); return; }
    throw backendMissing();
  }
  async function memberPushFavorites(acct) { var local=bridge.read(); var c=docCacheGet('m:'+acct); if(c && JSON.stringify(c.events||[])===JSON.stringify(local.event) && JSON.stringify(c.artists||[])===JSON.stringify(local.artist)) { markSynced(); return; } await memberWriteFields(acct, {events:local.event, artists:local.artist, updatedAt:Date.now()}); markSynced(); }
  async function memberSetMeta(acct, fields) { await memberWriteFields(acct, fields); }
  function idxCollection(prefix){ return prefix==='c:' ? 'codes' : 'recovery'; }
  async function idxGet(prefix, hash) {
    var sheetErr=null;
    if(syncReady()) { try { var v=await kvGet(prefix+hash); return v ? (v.acct||null) : null; } catch(e) { if(!client) throw e; sheetErr=e; } }
    if(client) { try { var snap=await fsTimeout(client.getDoc(client.doc(client.db, idxCollection(prefix), hash)), '読み込みがタイムアウトしました'); return snap.exists() ? ((snap.data()||{}).acct||null) : null; } catch(e2) { throw sheetErr||e2; } }
    return null;
  }
  async function idxSet(prefix, hash, acct) {
    if(syncReady()) {
      await kvSet(prefix+hash, {acct:acct});
      if(client) { try { await fsTimeout(client.setDoc(client.doc(client.db, idxCollection(prefix), hash), {acct:acct}), '保存がタイムアウトしました'); } catch(e) {} }
      return;
    }
    if(client) { await fsTimeout(client.setDoc(client.doc(client.db, idxCollection(prefix), hash), {acct:acct}), '保存がタイムアウトしました'); return; }
    throw backendMissing();
  }
  async function idxDel(prefix, hash) {
    try { if(syncReady()) await kvDel(prefix+hash); } catch(e) {}
    try { if(client) await fsTimeout(client.deleteDoc(client.doc(client.db, idxCollection(prefix), hash)), '削除がタイムアウトしました'); } catch(e) {}
  }
  /* 紐づけ索引は r: 前置を使う: 入口（Apps Script）はキー前置が許可制で
     新しい前置 b: は bad key で弾かれた（2026-11-25 実測）。質問と回答の
     復旧を廃したため、その索引 r: を紐づけ用に転用する（値の形は同じ {acct}、
     ハッシュの元情報が違うため衝突しない） */
  /* 本人確認専用の Google サインイン（Kota決定 2026-11-25、v158）:
     会員コードの発行・再発行・アカウント切り替えのときだけ使う。
     通常のログイン状態には触れないよう、分離した認証インスタンスで
     ポップアップを開き、uid のハッシュだけを返して即サインアウトする。
     実機でリダイレクト方式は完走しなかったため、ポップアップのみ */
  async function googleVerify(){
    if(inAppBrowser()) throw new Error('アプリ内ブラウザではGoogle本人確認ができません。通常のブラウザ（Safari／Chrome）で開き直してください');
    if(!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) throw new Error('本人確認の準備ができていません');
    var appMod=await fsTimeout(import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'), '読み込みがタイムアウトしました');
    var authMod=await fsTimeout(import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'), '読み込みがタイムアウトしました');
    var vApp; try{ vApp=appMod.initializeApp(cfg, 'kg-verify'); }catch(e){ vApp=appMod.getApp('kg-verify'); }
    var vAuth=authMod.getAuth(vApp);
    var cred=await authMod.signInWithPopup(vAuth, new authMod.GoogleAuthProvider());
    var uid=cred && cred.user && cred.user.uid;
    if(!uid) throw new Error('Googleアカウントを確認できませんでした');
    var gh=(await googleKeyOf(uid)).slice(2);
    try{ await authMod.signOut(vAuth); }catch(_){}
    return gh;
  }
  /* 新しいコードを発行してアカウントに付け替える（旧コードは無効化） */
  async function issueNewCodeFor(acct){
    var d=await memberDoc(acct);
    var code=newCode(); var ch=await codeHashOf(code);
    await idxSet('c:', ch, acct);
    if(d && d.codeHash && d.codeHash!==ch){ await idxDel('c:', d.codeHash); }
    await memberSetMeta(acct, {codeHash:ch});
    return code;
  }
  /* 紐づけ状態に応じて「Googleアカウントと紐づける」案内の表示を切り替える */
  async function refreshBindBlock(){
    var blk=$('kg-bind-block'); if(!blk) return;
    if(!member || !memberReady){ blk.hidden=true; return; }
    try{ var d=await memberDoc(member.acct); blk.hidden=!!(d && d.googleHash); }
    catch(e){
      blk.hidden=true;
      /* ログイン直後は入口が混み合い、読み取りが失敗することがある。
         隠したままにせず、少し置いて1回だけ再評価する */
      var acct=member.acct;
      setTimeout(function(){ if(member && member.acct===acct && memberReady) refreshBindBlock(); }, 6000);
    }
  }
  async function udGoogleGet(uid) {
    var sheetErr=null;
    if(syncReady()) {
      try { var token=await idToken(); if(token) { var gk2=await googleKeyOf(uid); var v=docCacheGet(gk2); if(v===undefined){ v=await kvGet(gk2, token); docCachePut(gk2, v); } return v ? (v.userdata||null) : null; } }
      catch(e) { if(!client) throw e; sheetErr=e; }
    }
    if(client) { try { var snap=await fsTimeout(client.getDoc(client.doc(client.db,'users',uid,'userdata','main')), '読み込みがタイムアウトしました'); return snap.exists() ? ((snap.data()||{}).data||null) : null; } catch(e2) { throw sheetErr||e2; } }
    return null;
  }
  async function udGoogleSet(uid, data) {
    if(syncReady()) {
      var token=await idToken(); if(!token) throw new Error('ログイン情報が確認できませんでした');
      var gk3=await googleKeyOf(uid);
      try {
        await kvMerge(gk3, {userdata:data, udUpdatedAt:Date.now()}, token);
        docCacheMerge(gk3, {userdata:data, udUpdatedAt:Date.now()});
      } catch(e) {
        /* 主軸（シート）が落ちても保険（Firestore）へは書いてから投げる。
           片方でも残れば、次回ログインで引き継げる（v241） */
        if(client) { try { await fsTimeout(client.setDoc(client.doc(client.db,'users',uid,'userdata','main'), {data:data, updatedAt:Date.now()}), '同期がタイムアウトしました'); } catch(e2) {} }
        throw e;
      }
      if(client) { try { await fsTimeout(client.setDoc(client.doc(client.db,'users',uid,'userdata','main'), {data:data, updatedAt:Date.now()}), '同期がタイムアウトしました'); } catch(e) {} }
      return;
    }
    if(client) { await fsTimeout(client.setDoc(client.doc(client.db,'users',uid,'userdata','main'), {data:data, updatedAt:Date.now()}), '同期がタイムアウトしました'); return; }
    throw backendMissing();
  }
  async function setupSession(session) {
    generation++; var g=generation;
    user=session && session.user ? session.user : null; initialized=false;
    initRetryCount=0; if(initRetryTimer){ clearTimeout(initRetryTimer); initRetryTimer=null; }
    if(!user){ parts(false,true,false,false); if(!member) text('ログインしていません。推し・お気に入りは端末内に保存されます。'); renderAdmin(); return; }
    var uid=user.id; $('kg-email-display').textContent='ログイン中：'+(user.email||'アカウント');
    var isAdminAcct=await noteAdminAccount(user);
    if(isAdminAcct){ $('kg-email-display').textContent+='（管理者）'; renderAdmin(); }
    parts(false,false,true,false); renderState();
    if (localStorage.getItem(currentMarker)===uid) {
      text('アカウントのデータを確認しています…');
      var initReturning=async function(){
        if(!await flushWait(uid,g)){ scheduleInitRetry(uid,g,initReturning); return; }
        fsDrain(uid);
        try { var cloud=await pull(uid); if(!sameUser(uid,g)) return; bridge.replace(cloud); initialized=true; initRetryCount=0; text('同期済み。'); udPullMerge(); }
        catch(e) { noteCloudFail(e); text('クラウドの読み込みに失敗しました。端末内データは保持されています。'); scheduleInitRetry(uid,g,initReturning); }
      };
      await initReturning();
    } else {
      /* 初回ログインは自動で統合して同期を始める（v151）。選択待ちのまま
         同期が始まらない状態をなくす。統合は和集合で端末データを消さない。
         失敗した時だけ従来の選択肢を出す */
      await applyChoice(true);
      if(!initialized){ choiceMode='google'; parts(false,false,false,true); text('同期方法を選んでください。'); bootChoicePending=true; renderState(); }
    }
  }
  async function applyChoice(merge) {
    if(!user) return; var uid=user.id,g=generation; text('データを確認しています…');
    try {
      if(!await flushWait(uid,g)){ scheduleInitRetry(uid,g,function(){ if(!initialized) applyChoice(merge); }); return; }
      fsDrain(uid);
      var cloud=await pull(uid); if(!sameUser(uid,g)) return;
      if(merge) {
        var local=bridge.read(), operations=[];
        ['event','artist'].forEach(function(k){ var present=new Set(cloud[k]); local[k].forEach(function(v){if(!present.has(v)){operations.push({op:'add',kind:k,value:v});present.add(v);}}); cloud[k]=Array.from(present); });
        enqueue(uid,operations); fsEnqueue(uid,operations); if(!await flushWait(uid,g)){ scheduleInitRetry(uid,g,function(){ if(!initialized) applyChoice(merge); }); return; } fsDrain(uid);
      }
      if(!sameUser(uid,g)) return;
      bridge.replace(cloud); localStorage.setItem(currentMarker,uid); initialized=true; initRetryCount=0;
      parts(false,false,true,false); text('同期済み。'); udPullMerge();
    } catch(e) { noteCloudFail(e); text('同期に失敗しました。端末内データは保持されています。もう一度お試しください。'); scheduleInitRetry(uid,g,function(){ if(!initialized) applyChoice(merge); }); }
  }
  $('kg-merge').onclick=function(){ bootChoicePending=false; renderState(); if(choiceMode==='member') applyMemberChoice(true); else applyChoice(true); };
  $('kg-use-cloud').onclick=function(){ if(confirm('この端末の推し・お気に入りをアカウントのデータに置き換えます。よろしいですか？')) { bootChoicePending=false; renderState(); if(choiceMode==='member') applyMemberChoice(false); else applyChoice(false); } };
  $('kg-refresh').onclick=async function(){ if(!user)return; var uid=user.id,g=generation; noteCloudOk(); text('同期しています…'); if(!await flushWait(uid,g))return; fsDrain(uid); try{var data=await pull(uid);if(!sameUser(uid,g))return;bridge.replace(data);initialized=true;localStorage.setItem(currentMarker,uid);text('同期済み。');udPullMerge();}catch(e){noteCloudFail(e);text('同期に失敗しました。端末内のデータは保持されています。');} };
  $('kg-sync-now').onclick=async function(){
    var btn=this; btn.disabled=true;
    var f0=cloudFails;
    try{
      if(member && memberReady){
        text('同期しています…');
        await memberPushFavorites(member.acct);
        var okUd=await udPushNow(true);
        await udPullMerge();
        if(!okUd || cloudFails>f0){ text('同期に失敗しました。端末内データは保持されています。時間をおいてもう一度お試しください。'); }
        else { markSynced(); text('同期しました（会員コード）。'); }
      } else if(user && initialized){
        text('同期しています…');
        var uid2=user.id,g2=generation;
        if(!await flush(uid2,g2)){ text('同期に失敗しました。端末内のデータは保持されています。'); return; }
        fsDrain(uid2);
        var okUd2=await udPushNow(true);
        await udPullMerge();
        if(!okUd2 || cloudFails>f0){ text('同期に失敗しました。端末内のデータは保持されています。時間をおいてもう一度お試しください。'); }
        else { markSynced(); text('同期しました。'); }
      } else {
        text('ログインが完了してから同期できます。');
      }
    }catch(e){ noteCloudFail(e); text('同期に失敗しました（'+((e&&e.code)||'エラー')+'）。端末内データは保持されています。時間をおいてもう一度お試しください。'); }
    finally{ btn.disabled=false; syncPanelRender(); }
  };
  $('kg-signout').onclick=function(){ if(!user)return; if(queueRead(user.id).length){text('未同期の変更があります。まず同期してからログアウトしてください。');return;} $('kg-signout-confirm').hidden=false; };
  $('kg-signout-no').onclick=function(){ $('kg-signout-confirm').hidden=true; };
  $('kg-signout-yes').onclick=async function(){ if(!user)return; $('kg-signout-confirm').hidden=true; try { await client.signOut(client.auth); } catch(e) { text('ログアウトできませんでした。'); return; } localStorage.removeItem(currentMarker); wipeLocalUserData(); setTimeout(function(){ location.reload(); }, 400); };
  window.addEventListener('kg:favorites-change',function(e){
    udPushNow();
    if(member && memberReady && !(user && initialized)) { scheduleMemberPush(); return; }
    if(!user || !initialized)return;
    var uid=user.id,g=generation,d=e.detail,kind=d.key===bridge.keys.event?'event':d.key===bridge.keys.artist?'artist':null;
    if(!kind)return; var a=new Set(d.before||[]),b=new Set(d.after||[]),ops=[];
    b.forEach(function(v){if(!a.has(v))ops.push({op:'add',kind:kind,value:String(v)});});
    a.forEach(function(v){if(!b.has(v))ops.push({op:'delete',kind:kind,value:String(v)});});
    if(!ops.length)return;
    try{enqueue(uid,ops); fsEnqueue(uid,ops);}catch(err){text('同期待ちの保存に失敗しました。');showModal();return;}
    text('同期中…'); if(!running) flush(uid,g).then(function(ok){ if(ok && sameUser(uid,g)) { text('同期済み。'); markSynced(); } fsDrain(uid); });
  });
  /* 会員コード方式（Kotaの提案、2026-11-23）：サイト発行のコードが鍵。個人情報なし。
     アカウント本体は m:{アカウントID}（ランダムID、1人1行）。
     コードの索引は c:{SHA-256(コード)}、復旧の索引は r:{SHA-256(質問:回答)}。
     保存先は主軸＝アカウント用シート、保険＝Firestore（memberdata/codes/recovery）。
     コードを失くしても、本人が決めた質問と回答でログインし、コードを再発行できる。 */
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function newCode(){ var a=new Uint8Array(20); crypto.getRandomValues(a); var s=''; for(var i=0;i<20;i++){ s+=CODE_ALPHABET[a[i]%CODE_ALPHABET.length]; if(i%5===4&&i<19)s+='-'; } return s; }
  function newAcct(){ var a=new Uint8Array(32); crypto.getRandomValues(a); return Array.from(a).map(function(b){return b.toString(16).padStart(2,'0');}).join(''); }
  function normCode(s){ return (s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function normQA(s){ return (s||'').trim().toLowerCase().replace(/\s+/g,' '); }
  async function sha256hex(t){ var buf=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join(''); }
  function codeHashOf(code){ return sha256hex('kg-code:'+normCode(code)); }
  function recoveryHashOf(q,a){ return sha256hex('kg-recovery:'+normQA(q)+':'+normQA(a)); }
  function cloudOf(d){ return {event:Array.isArray(d.events)?d.events:[], artist:Array.isArray(d.artists)?d.artists:[]}; }
  function saveMemberSession(){ if(member) localStorage.setItem('kg_member_session_v2', JSON.stringify({acct:member.acct, code:member.code||null})); }
  function renderMember(){ var has=!!member; $('kg-member-off').hidden=has; $('kg-member-on').hidden=!has; if(has) $('kg-code-display').textContent = member.code ? member.code : '（未設定）'; var rd=$('kg-role-display'); if(rd){ if(has && member.role && member.linkName){ rd.hidden=false; rd.textContent=roleLabel(member.role)+' '+member.linkName+' としてログイン中です。'; } else { rd.hidden=true; } } if(has) refreshBindBlock(); }
  function scheduleMemberPush(){ if(!member||!memberReady)return; if(memberPushTimer)clearTimeout(memberPushTimer); memberPushTimer=setTimeout(function(){ if(!member)return; memberPushFavorites(member.acct).then(function(){ text('同期済み（会員コード）。'); }, function(e){ text('同期できませんでした（'+((e&&e.code)||'エラー')+'）。端末内には保存済みです。'); }); },700); }
  /* ---------- その他の端末データの同期（v105で追加） ----------
     推し・お気に入り以外の端末データ（行きたい／気になる／マイリスト／
     フォロー／好み／保存した絞り込み／学習／終了表示）も端末をまたげるよう、
     1つのまとまりとして同期する。保存先: 会員コード=アカウント本体の userdata 欄、
     Google=主軸はシートの g:{uidハッシュ} 行、保険は users/{uid}/userdata/main。
     取り込みは原則「統合」（和集合）で、端末のデータを勝手に消さない。
     反映は localStorage へ書いて1回だけ再読込 */
  var UD_KEYS={want:'kg_trial_want_events_v1',interest:'kg_trial_interest_events_v1',lists:'kg_trial_lists_v1',follows:'kg_trial_follows_v1',prefs:'kg_trial_prefs_v1',profiles:'kg_filter_profiles_v1',learned:'kg_trial_learn_v1',showEnded:'kg_trial_show_ended',plans:'kg_trial_plans_v1',plan:'kg_trial_plan_v1',cals:'kg_trial_calendars_v1',words:'kg_trial_saved_words_v1'};
  function udArr(v){ return Array.isArray(v)? v : []; }
  function udParse(k, fb){ try{ var v=localStorage.getItem(k); return v==null? fb : JSON.parse(v); }catch(e){ return fb; } }
  function udReadLocal(){
    return {
      want:udArr(udParse(UD_KEYS.want,[])),
      interest:udArr(udParse(UD_KEYS.interest,[])),
      lists:udArr(udParse(UD_KEYS.lists,[])),
      follows:udParse(UD_KEYS.follows,{venues:[],organizers:[]}),
      prefs:udParse(UD_KEYS.prefs,null),
      profiles:udArr(udParse(UD_KEYS.profiles,[])),
      learned:udParse(UD_KEYS.learned,null),
      showEnded:localStorage.getItem(UD_KEYS.showEnded)==='1',
      plans:udParse(UD_KEYS.plans,null),
      cals:udArr(udParse(UD_KEYS.cals,[])),
      words:udArr(udParse(UD_KEYS.words,[]))
    };
  }
  function udSig(){ try{ return JSON.stringify(udReadLocal()); }catch(e){ return ''; } }
  function udUnion(a,b){ var s=new Set((a||[]).map(String)); (b||[]).forEach(function(x){ s.add(String(x)); }); return Array.from(s); }
  function udClone(x){ return JSON.parse(JSON.stringify(x)); }
  function udMerge(local, cloud){
    if(!cloud || typeof cloud!=='object') return local;
    var out={};
    out.want=udUnion(local.want, cloud.want);
    out.interest=udUnion(local.interest, cloud.interest);
    var lists=(local.lists||[]).map(udClone);
    (cloud.lists||[]).forEach(function(row){
      if(!row || typeof row.id!=='string') return;
      var i=lists.findIndex(function(x){ return x.id===row.id; });
      if(i>=0){ lists[i].events=udUnion(lists[i].events,row.events); lists[i].artists=udUnion(lists[i].artists,row.artists); lists[i].venues=udUnion(lists[i].venues,row.venues); lists[i].organizers=udUnion(lists[i].organizers,row.organizers); if(row.name) lists[i].name=row.name; }
      else lists.push(udClone(row));
    });
    out.lists=lists;
    out.follows={ venues:udUnion((local.follows||{}).venues,(cloud.follows||{}).venues), organizers:udUnion((local.follows||{}).organizers,(cloud.follows||{}).organizers) };
    var lp=local.prefs||{}, cp=cloud.prefs||{}, prefs=udClone(cp);
    Object.keys(lp).forEach(function(k){ prefs[k]=lp[k]; });
    ['cats','artists','prefs','areas','dismissed'].forEach(function(k){ prefs[k]=udUnion(lp[k],cp[k]); });
    ['onboarded','free','weekend','collab'].forEach(function(k){ prefs[k]=!!(lp[k]||cp[k]); });
    out.prefs=prefs;
    var profs=(local.profiles||[]).map(udClone);
    (cloud.profiles||[]).forEach(function(row){ if(!row||typeof row.name!=='string')return; var i=profs.findIndex(function(x){return x.name===row.name;}); if(i>=0) profs[i]=udClone(row); else profs.push(udClone(row)); });
    out.profiles=profs.slice(0,30);
    var ll=local.learned||{}, cl=cloud.learned||{}, learned={};
    ['cats','artists','areas'].forEach(function(k){ learned[k]={}; var a=ll[k]||{}, b=cl[k]||{}; Object.keys(a).forEach(function(n){ learned[k][n]=a[n]; }); Object.keys(b).forEach(function(n){ learned[k][n]=Math.max(Number(learned[k][n])||0, Number(b[n])||0); }); });
    out.learned=learned;
    out.showEnded=!!(local.showEnded||cloud.showEnded);
    var pats=(local.plans&&Array.isArray(local.plans.patterns)? local.plans.patterns:[]).map(udClone);
    ((cloud.plans&&cloud.plans.patterns)||[]).forEach(function(row){
      if(!row || row.id==null) return;
      var i=pats.findIndex(function(x){ return String(x.id)===String(row.id); });
      if(i>=0){ pats[i].ids=udUnion(pats[i].ids,row.ids); if(!pats[i].name && row.name) pats[i].name=row.name; }
      else pats.push(udClone(row));
    });
    var act=(local.plans&&local.plans.active)||null;
    if(!pats.some(function(p){ return String(p.id)===String(act); })) act=(cloud.plans&&cloud.plans.active)||null;
    if(!pats.some(function(p){ return String(p.id)===String(act); })) act=pats.length? pats[0].id : null;
    out.plans={patterns:pats, active:act};
    var cals=(local.cals||[]).map(udClone);
    (cloud.cals||[]).forEach(function(row){
      if(!row || row.id==null) return;
      var i=cals.findIndex(function(x){ return String(x.id)===String(row.id); });
      if(i>=0){
        cals[i].artists=udUnion(cals[i].artists,row.artists);
        cals[i].venues=udUnion(cals[i].venues,row.venues);
        cals[i].organizers=udUnion(cals[i].organizers,row.organizers);
        ['fav','want','int','plan'].forEach(function(k){ cals[i][k]=!!(cals[i][k]||row[k])? 1:0; });
        if(!cals[i].name && row.name) cals[i].name=row.name;
      }
      else cals.push(udClone(row));
    });
    out.cals=cals.slice(0,20);
    var words=(local.words||[]).map(udClone).filter(function(x){ return x && x.w; });
    (cloud.words||[]).forEach(function(row){
      if(!row || !row.w) return;
      var ex=null; words.forEach(function(x){ if(x.w===row.w) ex=x; });
      if(ex) ex.on=(ex.on!==false || row.on!==false);
      else words.push({w:String(row.w), on:row.on!==false});
    });
    out.words=words.slice(0,50);
    return out;
  }
  function udWriteLocal(d){
    try{
      localStorage.setItem(UD_KEYS.want, JSON.stringify(d.want||[]));
      localStorage.setItem(UD_KEYS.interest, JSON.stringify(d.interest||[]));
      localStorage.setItem(UD_KEYS.lists, JSON.stringify(d.lists||[]));
      localStorage.setItem(UD_KEYS.follows, JSON.stringify(d.follows||{venues:[],organizers:[]}));
      if(d.prefs) localStorage.setItem(UD_KEYS.prefs, JSON.stringify(d.prefs));
      localStorage.setItem(UD_KEYS.profiles, JSON.stringify(d.profiles||[]));
      if(d.learned) localStorage.setItem(UD_KEYS.learned, JSON.stringify(d.learned));
      localStorage.setItem(UD_KEYS.showEnded, d.showEnded? '1':'0');
      if(d.plans && Array.isArray(d.plans.patterns)){
        localStorage.setItem(UD_KEYS.plans, JSON.stringify(d.plans));
        var ap=d.plans.patterns.find(function(p){ return String(p.id)===String(d.plans.active); }) || d.plans.patterns[0];
        localStorage.setItem(UD_KEYS.plan, JSON.stringify(ap? (ap.ids||[]) : []));
      }
      if(Array.isArray(d.cals)) localStorage.setItem(UD_KEYS.cals, JSON.stringify(d.cals));
      if(Array.isArray(d.words)) localStorage.setItem(UD_KEYS.words, JSON.stringify(d.words));
    }catch(e){}
  }
  var udBusy=false, udLastSig='';
  async function udPushNow(force){
    if(udBusy) return true;
    if(cloudBlocked()) return false;
    var sig=udSig(); if(!sig) return false; if(!force && sig===udLastSig) return true;
    var data=udReadLocal();
    try{ if(JSON.stringify(data).length>900000) return false; }catch(e){ return false; }
    if(!(member && memberReady) && !(user && initialized)) return false;
    udBusy=true;
    try{
      if(udPushNow.retryT){ clearTimeout(udPushNow.retryT); udPushNow.retryT=null; }
      if(member && memberReady){ await memberSetMeta(member.acct, {userdata:data, udUpdatedAt:Date.now()}); udLastSig=sig; noteCloudOk(); markSynced(); }
      else if(user && initialized){ await udGoogleSet(user.id, data); udLastSig=sig; noteCloudOk(); markSynced(); }
      return true;
    }catch(e){ noteCloudFail(e); /* 失敗しても端末内データは無事。12秒後に1回自動で再送し、それでも駄目なら次回の定期チェックで再送する */
      if(!udPushNow.retryT){ udPushNow.retryT=setTimeout(function(){ udPushNow.retryT=null; udPushNow(true); }, 12000); }
      return false; }
    finally{ udBusy=false; }
  }
  function udArmWatchers(){
    if(udArmWatchers.done) return; udArmWatchers.done=true;
    setInterval(function(){ udPushNow(); }, 45000);
    document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='hidden') udPushNow(); });
    window.addEventListener('beforeunload', function(){ udPushNow(); });
  }
  async function udPullMerge(){
    /* ログイン確定後に呼ぶ: クラウド側の userdata を端末へ統合し、
       変化があれば1回だけ再読み込みして画面へ反映する */
    udArmWatchers();
    if(cloudBlocked()) return;
    try{
      var cloud=null;
      if(member && memberReady){ var d=await memberDoc(member.acct); cloud=d? d.userdata : null; }
      else if(user && initialized){ cloud=await udGoogleGet(user.id); }
      else return;
      noteCloudOk(); markSynced();
      udArmWatchers();
      if(!cloud){ udLastSig=''; await udPushNow(); return; }
      var before=udSig();
      var merged=udMerge(udReadLocal(), cloud);
      udWriteLocal(merged);
      udLastSig=udSig();
      /* 統合結果がクラウドと同一なら書き戻さない（v156）: 変化なしの
         書き込みは入口のロックを無駄に取り、詰まりを悪化させる */
      if(JSON.stringify(merged)!==JSON.stringify(cloud)){
        try{
          if(member && memberReady) await memberSetMeta(member.acct, {userdata:merged, udUpdatedAt:Date.now()});
          else if(user && initialized) await udGoogleSet(user.id, merged);
        }catch(e){}
      }
      if(before!==udLastSig && !sessionStorage.getItem('kg_ud_reloaded')){
        sessionStorage.setItem('kg_ud_reloaded','1');
        location.reload();
      }
    }catch(e){ noteCloudFail(e); /* 読めなくても端末内データで継続する。詰まりで失敗した場合は少し待って1回だけ自動でやり直す（v154） */ if(!udPullMerge.retried){ udPullMerge.retried=true; setTimeout(function(){ udPullMerge(); }, 30000); } }
  }
  async function activateMember(acct, code, fromRestore){
    var d = await memberDoc(acct);
    if(!d) return false;
    if(d.roleStatus==='revoked'){ if(fromRestore){ try{ localStorage.removeItem('kg_member_session_v2'); }catch(_){} } return false; }
    member = {acct:acct, code:code||null, role:d.role||null, linkName:d.linkName||null};
    if(!fromRestore){ memberSetMeta(acct, {lastLoginAt:Date.now()}).catch(function(){}); }
    saveMemberSession();
    renderMember(); renderState();
    if(localStorage.getItem('kg_member_selected_v2')===acct){ bridge.replace(cloudOf(d)); memberReady=true; text('同期済み（会員コード）。'); udPullMerge(); }
    else {
      /* 会員コードの初回ログインも自動で統合して同期を始める（v151） */
      pendingMemberCloud=cloudOf(d);
      await applyMemberChoice(true);
      if(!memberReady){ choiceMode='member'; parts(false, !user, !!user, true); text('同期方法を選んでください。'); if(!fromRestore){ bootChoicePending=true; renderState(); } }
    }
    return true;
  }
  async function applyMemberChoice(merge){
    if(!member) return;
    try {
      var cloud = pendingMemberCloud || {event:[],artist:[]};
      if(merge){ var local=bridge.read(); ['event','artist'].forEach(function(k){ var s=new Set(cloud[k]); local[k].forEach(function(v){s.add(v);}); cloud[k]=Array.from(s); }); }
      bridge.replace(cloud);
      await memberPushFavorites(member.acct);
      localStorage.setItem('kg_member_selected_v2', member.acct);
      memberReady=true; pendingMemberCloud=null;
      parts(false, !user, !!user, false);
      text('同期済み（会員コード）。'); udPullMerge();
    } catch(e){ text('同期に失敗しました（'+((e&&e.code)||'エラー')+'）。端末内データは保持されています。'); }
  }
  function noBackend(){ return !syncReady() && !client; }
  $('kg-code-issue').onclick=async function(){
    if(noBackend()){ text('接続の準備中です。少し待ってからお試しください。'); return; }
    if(member){ text('すでに会員コードでログイン中です。'); return; }
    var ibtn=this; ibtn.disabled=true;
    try {
      text('Googleアカウントで本人確認をしています…');
      var gh=await googleVerify();
      var bound=await idxGet('r:', gh);
      if(bound){ text('このGoogleアカウントには、すでに会員コードのアカウントがあります。コードでログインしてください。コードを失くした場合は「コードを失くした方」から新しいコードを発行できます。'); return; }
      var acct=newAcct(); var code=newCode(); var ch=await codeHashOf(code);
      var local=bridge.read();
      await memberWriteFields(acct, {events:local.event, artists:local.artist, updatedAt:Date.now(), codeHash:ch, googleHash:gh});
      await idxSet('c:', ch, acct);
      await idxSet('r:', gh, acct);
      member={acct:acct, code:code}; saveMemberSession();
      localStorage.setItem('kg_member_selected_v2', acct);
      memberReady=true; renderMember(); renderState(); udPullMerge();
      text('会員コードを発行しました。コードを控えてください。コードは、このGoogleアカウントに紐づけました。');
    } catch(e){ text('コードを発行できませんでした（'+((e&&e.code)||(e&&e.message)||'エラー')+'）。本人確認が完了していない可能性があります。通信を確認してもう一度お試しください。'); } finally { ibtn.disabled=false; }
  };
  $('kg-code-login').onclick=async function(){
    if(this.disabled) return;
    if(noBackend()){ text('接続の準備中です。少し待ってからお試しください。'); return; }
    var code=$('kg-code-input').value;
    if(normCode(code).length<20){ text('コードの形式が違うようです。'); return; }
    var lbtn=this; lbtn.disabled=true;
    try {
      var ch=await codeHashOf(code);
      var acct=await idxGet('c:', ch);
      if(!acct){ text('そのコードが見つかりませんでした。'); return; }
      if(member && member.acct!==acct){
        /* アカウント切り替え（Kota決定 2026-11-25、v158）: 切り替え先の
           Google再認証が必須で、切り替え時に新しいコードの発行も必須（旧コードは無効化） */
        text('アカウントを切り替えます。切り替え先のGoogleアカウントで本人確認をしています…');
        var gh2=await googleVerify();
        var td=await memberDoc(acct);
        if(td && td.googleHash && td.googleHash!==gh2){ text('別のGoogleアカウントでは切り替えできません。切り替え先に紐づいたGoogleで本人確認してください。'); return; }
        if(td && !td.googleHash){ await memberSetMeta(acct, {googleHash:gh2}); await idxSet('r:', gh2, acct); }
        if(!await activateMember(acct, code)){ text('データが見つかりませんでした。'); return; }
        var ncode=await issueNewCodeFor(acct);
        if(member){ member.code=ncode; saveMemberSession(); renderMember(); }
        text('アカウントを切り替えました。新しいコードを発行しました（今までのコードは使えません）。新しいコード：'+ncode);
        return;
      }
      if(!await activateMember(acct, code)) text('データが見つかりませんでした。');
    } catch(e){ text('ログインできませんでした（'+((e&&e.code)||'エラー')+'）。接続できない可能性があります。通信を確認してもう一度お試しください。'); } finally { lbtn.disabled=false; }
  };
  $('kg-google-recover').onclick=async function(){
    if(this.disabled) return;
    if(noBackend()){ text('接続の準備中です。少し待ってからお試しください。'); return; }
    if(member){ text('すでに会員コードでログイン中です。再発行は「コードを再発行」から行えます。'); return; }
    var rbtn=this; rbtn.disabled=true;
    try {
      text('Googleアカウントで本人確認をしています…');
      var gh=await googleVerify();
      var acct=await idxGet('r:', gh);
      if(!acct){ text('このGoogleアカウントに紐づいたアカウントが見つかりませんでした。'); return; }
      if(!await activateMember(acct, null)){ text('データが見つかりませんでした。'); return; }
      var ncode=await issueNewCodeFor(acct);
      if(member){ member.code=ncode; saveMemberSession(); renderMember(); }
      text('本人確認できました。新しいコードを発行してログインしました（今までのコードは使えません）。新しいコード：'+ncode);
    } catch(e){ text('ログインできませんでした（'+((e&&e.code)||(e&&e.message)||'エラー')+'）。通信を確認してもう一度お試しください。'); } finally { rbtn.disabled=false; }
  };
  $('kg-code-copy').onclick=function(){ if(!member||!member.code)return; if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(member.code).then(function(){ text('コードをコピーしました。'); }, function(){ text('コピーできませんでした。コードをメモしてください。'); }); } };
  $('kg-code-reissue').onclick=function(){ if(!member||noBackend()) return; $('kg-code-reissue-confirm').hidden=false; };
  $('kg-code-reissue-no').onclick=function(){ $('kg-code-reissue-confirm').hidden=true; };
  $('kg-code-reissue-yes').onclick=async function(){
    $('kg-code-reissue-confirm').hidden=true;
    if(!member||noBackend()||this.disabled) return;
    var ribtn=this; ribtn.disabled=true;
    try {
      text('Googleアカウントで本人確認をしています…');
      var gh=await googleVerify();
      var d=await memberDoc(member.acct);
      if(d && d.googleHash && d.googleHash!==gh){ text('別のGoogleアカウントでは再発行できません。このアカウントに紐づいたGoogleで本人確認してください。'); return; }
      if(d && !d.googleHash){ await memberSetMeta(member.acct, {googleHash:gh}); await idxSet('r:', gh, member.acct); }
      var code=await issueNewCodeFor(member.acct);
      member.code=code; saveMemberSession(); renderMember();
      text('新しいコードを発行しました。控えてください。');
    } catch(e){ text('再発行できませんでした（'+((e&&e.code)||(e&&e.message)||'エラー')+'）。'); } finally { ribtn.disabled=false; }
  };
  $('kg-bind-google').onclick=async function(){
    if(!member||noBackend()||this.disabled) return;
    var bbtn=this; bbtn.disabled=true;
    try {
      text('Googleアカウントで本人確認をしています…');
      var gh=await googleVerify();
      var bound=await idxGet('r:', gh);
      if(bound && bound!==member.acct){ text('このGoogleアカウントは、別のアカウントに紐づいています。'); return; }
      await memberSetMeta(member.acct, {googleHash:gh});
      await idxSet('r:', gh, member.acct);
      refreshBindBlock();
      text('Googleアカウントと紐づけました。今後、コードの再発行にはこのGoogleでの本人確認が必要です。');
    } catch(e){ text('紐づけできませんでした（'+((e&&e.code)||(e&&e.message)||'エラー')+'）。'); } finally { bbtn.disabled=false; }
  };
  $('kg-code-logout').onclick=function(){ if(!member)return; $('kg-code-logout-confirm').hidden=false; };
  $('kg-code-logout-no').onclick=function(){ $('kg-code-logout-confirm').hidden=true; };
  $('kg-code-logout-yes').onclick=function(){
    $('kg-code-logout-confirm').hidden=true;
    if(!member)return;
    localStorage.removeItem('kg_member_session_v2'); localStorage.removeItem('kg_member_selected_v2'); localStorage.removeItem('kg_member_code_v1'); localStorage.removeItem('kg_member_selected_v1');
    try{ sessionStorage.removeItem('kg_ud_reloaded'); }catch(_){}
    member=null; memberReady=false; pendingMemberCloud=null; renderMember(); renderState();
    wipeLocalUserData();
    text('ログアウトしました。');
    setTimeout(function(){ location.reload(); }, 400);
  };
  /* 状態表記（Kota、2026-11-23）：ログイン中かどうかをヘッダーのボタン自体に表示する。
     ゲスト利用は一時的な端末向け（端末内だけに保存し、終了時に消せる）。 */
  var GUEST_FLAG='kg_guest_mode_v1';
  function guestOn(){ try{ return localStorage.getItem(GUEST_FLAG)==='1'; }catch(_){ return false; } }
  var bootChoicePending=false;
  function stateLabel(){
    if(adminOn()){
      if(user||member) return bootChoicePending? '管理者モード（同期は選択待ち）' : '管理者モード（同期ON）';
      if(bootRestoring) return '管理者モード（復旧中）';
      return '管理者モード（未同期）';
    }
    if(bootRestoring && !user && !member) return 'ログイン復旧中…';
    if(user) return bootChoicePending? 'ログイン中（同期は選択待ち）' : 'ログイン中（同期ON）';
    if(member) return bootChoicePending? 'ログイン中（会員コード・同期は選択待ち）' : 'ログイン中（会員コード）';
    if(guestOn()) return 'ゲスト利用中';
    return '未ログイン / 同期';
  }
  function renderState(){
    var b=$('kg-account-open'); if(b) b.textContent=stateLabel();
    syncPanelRender();
    var go=$('kg-guest-off'), gn=$('kg-guest-on'); var g=guestOn(); if(go) go.hidden=g; if(gn) gn.hidden=!g;
  }
  $('kg-guest-start').onclick=function(){
    try{ localStorage.setItem(GUEST_FLAG,'1'); }catch(_){}
    renderState();
    text('ゲスト利用中です。推し・お気に入りはこの端末にだけ保存されます。');
  };
  $('kg-guest-end').onclick=function(){ var c=$('kg-guest-end-confirm'); if(c) c.hidden=false; };
  $('kg-guest-end-no').onclick=function(){ var c=$('kg-guest-end-confirm'); if(c) c.hidden=true; };
  $('kg-guest-end-yes').onclick=function(){
    var c=$('kg-guest-end-confirm'); if(c) c.hidden=true;
    try{ localStorage.removeItem(GUEST_FLAG); }catch(_){}
    wipeLocalUserData();
    renderState();
    text('ゲスト利用を終了し、この端末のデータを消去しました。');
    setTimeout(function(){ location.reload(); }, 400);
  };

  /* ================= アーティスト・主催者コード（管理者発行） =================
     Kota指示 2026-11-26、仕様 docs/specs/artist-organizer-code-issuance-spec-20261126.md。
     自己登録は作らず、管理者がコードを発行してプロフィールと紐づけて管理する。
     台帳はアカウント用シートの r: 台帳行（入口のキー規則 ^[mcrg]:[a-f0-9]{64}$ に
     合う固定ハッシュ）に置き、管理者発行分だけを載せる（閲覧者の通常コードは対象外）。
     アカウント本体（m:行）には role / linkName / issuedAt / roleStatus を保持する。
     紐づけ（Google本人確認）は相手の初回ログイン時に、既存の紐づけ案内
     （kg-bind-block）でそのまま行われる。無効化は索引 c: を消し、
     activateMember でも roleStatus==='revoked' を弾く（端末に残った
     セッションでもログイン状態にならない） */
  var ROLE_REGISTRY_HASH=null, roleAdminLoaded=false;
  async function roleRegistryKey(){ if(!ROLE_REGISTRY_HASH) ROLE_REGISTRY_HASH=await sha256hex('kg-role-registry:v1'); return 'r:'+ROLE_REGISTRY_HASH; }
  async function roleRegistryRead(){ if(!syncReady()) throw backendMissing(); var v=await kvGet(await roleRegistryKey()); return (v && Array.isArray(v.accounts)) ? v.accounts : []; }
  async function roleRegistryWrite(accounts){ await kvSet(await roleRegistryKey(), {accounts:accounts, updatedAt:Date.now()}); }
  function roleLabel(role){ return role==='artist'? 'アーティスト' : role==='venue'? '会場' : '主催者'; }
  async function issueRoleCode(role, linkName, email){
    var accounts=await roleRegistryRead();
    var dup=accounts.find(function(a){ return a.status==='active' && a.role===role && a.linkName===linkName; });
    if(dup) throw new Error('同じ紐づけ先の有効なコードがすでにあります。再発行か無効化をしてから発行してください。');
    var acct=newAcct(); var code=newCode(); var ch=await codeHashOf(code); var now=Date.now();
    await memberWriteFields(acct, {events:[], artists:[], updatedAt:now, codeHash:ch, role:role, linkName:linkName, contactEmail:email||'', issuedAt:now, issuedBy:'admin', roleStatus:'active'});
    await idxSet('c:', ch, acct);
    accounts.push({acct:acct, role:role, linkName:linkName, contactEmail:email||'', issuedAt:now, status:'active'});
    await roleRegistryWrite(accounts);
    return code;
  }
  async function changeRoleLink(entry, newName){
    await memberSetMeta(entry.acct, {linkName:newName});
    docCacheDrop('m:'+entry.acct);
    var accounts=await roleRegistryRead();
    accounts.forEach(function(a){ if(a.acct===entry.acct) a.linkName=newName; });
    await roleRegistryWrite(accounts);
  }
  async function revokeRoleCode(entry){
    var d=await memberDoc(entry.acct);
    if(d && d.codeHash) await idxDel('c:', d.codeHash);
    await memberSetMeta(entry.acct, {roleStatus:'revoked'});
    docCacheDrop('m:'+entry.acct);
    var accounts=await roleRegistryRead();
    accounts.forEach(function(a){ if(a.acct===entry.acct) a.status='revoked'; });
    await roleRegistryWrite(accounts);
  }
  async function reissueRoleCode(entry){
    await memberSetMeta(entry.acct, {roleStatus:'active'});
    var code=await issueNewCodeFor(entry.acct);
    var accounts=await roleRegistryRead(); var now=Date.now();
    accounts.forEach(function(a){ if(a.acct===entry.acct){ a.status='active'; a.issuedAt=now; } });
    await roleRegistryWrite(accounts);
    return code;
  }
  function fmtDay(t){ if(!t) return '—'; var d=new Date(t); return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate(); }
  function fillRoleLinkList(){
    var dl=$('kg-role-link-list'); if(!dl) return;
    var names={artists:[], organizers:[], venues:[]};
    try{ if(bridge && bridge.profileNames) names=bridge.profileNames(); }catch(_){}
    var kind=($('kg-role-kind')||{}).value||'artist';
    var src=(kind==='artist'? names.artists : kind==='venue'? names.venues : names.organizers)||[];
    dl.innerHTML='';
    src.slice(0, 500).forEach(function(n){ var o=document.createElement('option'); o.value=n; dl.appendChild(o); });
  }
  async function renderRoleAdmin(){
    var listEl=$('kg-role-list'); if(!listEl) return;
    fillRoleLinkList();
    if(!syncReady()){ $('kg-role-list-status').textContent='同期の接続先が未設定のため、管理できません。'; return; }
    $('kg-role-list-status').textContent='一覧を読み込んでいます…';
    try{
      var accounts=await roleRegistryRead();
      roleAdminLoaded=true;
      if(!accounts.length){ listEl.innerHTML=''; $('kg-role-list-status').textContent='発行済みのアーティスト・主催者コードはまだありません。'; return; }
      $('kg-role-list-status').textContent='';
      listEl.innerHTML='';
      var rows=accounts.slice().reverse();
      for(var ri=0; ri<rows.length; ri++){
        var entry=rows[ri];
        var d=null; try{ d=await memberDoc(entry.acct); }catch(_){}
        var row=document.createElement('div');
        row.style.cssText='border-top:1px solid #ccc;padding:8px 0';
        var head=document.createElement('div');
        head.textContent=roleLabel(entry.role)+'：'+entry.linkName;
        head.style.fontWeight='700';
        var meta=document.createElement('div');
        meta.style.cssText='font-size:13px';
        meta.textContent='発行日：'+fmtDay(entry.issuedAt)+'／状態：'+(entry.status==='active'?'有効':'無効')+'／最終ログイン：'+((d&&d.lastLoginAt)? fmtDay(d.lastLoginAt) : '—')+(entry.contactEmail? '／申し込み：'+entry.contactEmail : '');
        var acts=document.createElement('div');
        var rb=document.createElement('button'); rb.type='button'; rb.textContent='再発行';
        rb.onclick=(function(en, btn){ return async function(){
          if(!confirm('新しいコードを発行します。今までのコードは使えなくなります。よろしいですか？')) return;
          btn.disabled=true;
          try{ var code=await reissueRoleCode(en); $('kg-role-issued').hidden=false; $('kg-role-issued-code').textContent=code; lastRoleIssued={role:en.role, linkName:en.linkName, email:en.contactEmail||''}; text('新しいコードを発行しました。控えて相手に渡してください。'); renderRoleAdmin(); }
          catch(e){ text('再発行できませんでした（'+((e&&e.message)||'エラー')+'）。'); }
          finally{ btn.disabled=false; }
        }; })(entry, rb);
        var vb=document.createElement('button'); vb.type='button'; vb.textContent='無効化'; vb.style.marginLeft='8px';
        if(entry.status!=='active') vb.disabled=true;
        vb.onclick=(function(en, btn){ return async function(){
          if(!confirm('このコードを無効化します。相手はログインできなくなります。よろしいですか？')) return;
          btn.disabled=true;
          try{ await revokeRoleCode(en); text('無効化しました。'); renderRoleAdmin(); }
          catch(e){ text('無効化できませんでした（'+((e&&e.message)||'エラー')+'）。'); }
          finally{ btn.disabled=false; }
        }; })(entry, vb);
        var eb=document.createElement('button'); eb.type='button'; eb.textContent='紐づけ変更'; eb.style.marginLeft='8px';
        var editDiv=document.createElement('div'); editDiv.hidden=true; editDiv.style.marginTop='6px';
        var ein=document.createElement('input'); ein.type='text'; ein.value=entry.linkName; ein.style.cssText='min-width:240px;padding:6px';
        var esb=document.createElement('button'); esb.type='button'; esb.textContent='保存'; esb.style.marginLeft='8px';
        eb.onclick=function(){ editDiv.hidden=!editDiv.hidden; };
        esb.onclick=(function(en, input, btn){ return async function(){
          var nn=(input.value||'').trim(); if(!nn){ text('紐づけ先を入力してください。'); return; }
          btn.disabled=true;
          try{ await changeRoleLink(en, nn); text('紐づけ先を変更しました。'); renderRoleAdmin(); }
          catch(e){ text('変更できませんでした（'+((e&&e.message)||'エラー')+'）。'); }
          finally{ btn.disabled=false; }
        }; })(entry, ein, esb);
        editDiv.appendChild(ein); editDiv.appendChild(esb);
        acts.appendChild(rb); acts.appendChild(vb); acts.appendChild(eb);
        row.appendChild(head); row.appendChild(meta); row.appendChild(acts); row.appendChild(editDiv);
        listEl.appendChild(row);
      }
    }catch(e){ $('kg-role-list-status').textContent='一覧を読み込めませんでした。通信を確認して「一覧を読み直す」を押してください。'; }
  }

  $('kg-role-issue').onclick=async function(){
    if(this.disabled) return;
    if(!adminOn()){ text('管理者モードが必要です。'); return; }
    if(noBackend()){ text('接続の準備中です。少し待ってからお試しください。'); return; }
    var role=$('kg-role-kind').value, linkName=($('kg-role-link').value||'').trim(), email=($('kg-role-email').value||'').trim();
    if(!linkName){ text('紐づけ先を入力してください。'); return; }
    var btn=this; btn.disabled=true;
    try{
      var code=await issueRoleCode(role, linkName, email);
      $('kg-role-issued').hidden=false; $('kg-role-issued-code').textContent=code;
      lastRoleIssued={role:role, linkName:linkName, email:email};
      $('kg-role-link').value=''; $('kg-role-email').value='';
      text('コードを発行しました。コードを控えて、相手に渡してください。');
      renderRoleAdmin();
    }catch(e){ text('発行できませんでした（'+((e&&e.message)||'エラー')+'）。'); }
    finally{ btn.disabled=false; }
  };
  var lastRoleIssued=null;
  function roleReplyText(code){
    var r=lastRoleIssued||{};
    var lines=[];
    lines.push('[KGコード発行] 関西イベントガイドのアカウント登録のご案内です。');
    lines.push('');
    if(r.linkName) lines.push(r.linkName+' 様');
    lines.push('関西イベントガイドの'+roleLabel(r.role||'artist')+'向け会員コードを発行しました。');
    lines.push('');
    lines.push('会員コード：'+code);
    lines.push('');
    lines.push('ログイン先：https://n2007osakadensi-art.github.io/Kansai-event-guide/');
    lines.push('画面右上の「未ログイン / 同期」ボタンから、上記の会員コードを入力してログインしてください。');
    lines.push('初回のみ、本人確認としてGoogleアカウントでの確認を行い、コードはそのGoogleアカウントに紐づきます。');
    lines.push('このコードは他人に教えないでください。');
    lines.push('なお、このコードに特別な編集権限は付いていません。イベントの登録・修正は、これまでどおりサイトのフォームからお送りください。');
    return lines.join('\n');
  }
  $('kg-role-issued-mail').onclick=function(){ var c=$('kg-role-issued-code').textContent; if(!c){ text('先にコードを発行してください。'); return; } var t=roleReplyText(c); if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(function(){ text('返信文をコピーしました。申し込みメールへの返信に貼って送ってください。'); }, function(){ text('コピーできませんでした。'); }); } };
  $('kg-role-issued-copy').onclick=function(){ var c=$('kg-role-issued-code').textContent; if(c && navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(c).then(function(){ text('コードをコピーしました。'); }, function(){ text('コピーできませんでした。コードをメモしてください。'); }); } };
  $('kg-role-reload').onclick=function(){ renderRoleAdmin(); };
  $('kg-role-kind').addEventListener('change', fillRoleLinkList);
  $('kg-notice-send').onclick=async function(){
    var st=$('kg-notice-status');
    if(!adminOn()){ st.textContent='\u7ba1\u7406\u8005\u30e2\u30fc\u30c9\u304c\u5fc5\u8981\u3067\u3059\u3002'; return; }
    var cfgN=window.KG_EDITOR_CONFIG||{};
    var titleN=($('kg-notice-title').value||'').trim();
    if(!titleN && !($('kg-notice-embed').value||'').trim()){ st.textContent='\u30bf\u30a4\u30c8\u30eb\u304b\u3001SNS\u6295\u7a3f\u306eURL\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002'; return; }
    if(!cfgN.formAction){ st.textContent='\u9001\u4fe1\u5148\u304c\u672a\u8a2d\u5b9a\u3067\u3059\u3002'; return; }
    var payloadN={ kind:'notice', title:titleN, body:($('kg-notice-body').value||'').trim(), embed:($('kg-notice-embed').value||'').trim(), url:($('kg-notice-url').value||'').trim(), urlLabel:($('kg-notice-urllabel').value||'').trim(), submitter:'admin', _subject:'\u3010\u304a\u77e5\u3089\u305b\u6295\u7a3f\u3011'+titleN };
    var btnN=this; btnN.disabled=true; st.textContent='\u9001\u4fe1\u3057\u3066\u3044\u307e\u3059\u2026';
    try{
      var bodyN=new URLSearchParams();
      bodyN.set(cfgN.formSubjectEntry, payloadN._subject);
      bodyN.set(cfgN.formPayloadEntry, JSON.stringify(payloadN));
      var ctlN=('AbortController' in window)? new AbortController():null;
      var timerN=ctlN? setTimeout(function(){ ctlN.abort(); },25000):null;
      await fetch(cfgN.formAction,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:bodyN.toString(),signal:ctlN?ctlN.signal:undefined});
      if(timerN) clearTimeout(timerN);
      st.textContent='\u9001\u4fe1\u3057\u307e\u3057\u305f\u3002\u78ba\u8a8d\u5f8c\u306b\u300c\u304a\u77e5\u3089\u305b\u300d\u3078\u53cd\u6620\u3055\u308c\u307e\u3059\u3002';
      $('kg-notice-title').value=''; $('kg-notice-body').value=''; $('kg-notice-embed').value=''; $('kg-notice-url').value=''; $('kg-notice-urllabel').value='';
    }catch(e){ st.textContent='\u9001\u4fe1\u306e\u78ba\u8a8d\u304c\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u5c4a\u3044\u3066\u3044\u308b\u5834\u5408\u304c\u3042\u308b\u306e\u3067\u3001\u5c11\u3057\u6642\u9593\u3092\u304a\u3044\u3066\u304b\u3089\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002'; }
    finally{ btnN.disabled=false; }
  };
  /* 管理者モード（Kota、2026-11-23）：管理者の端末ではログイン操作を不要にする。
     端末内にだけ保存される印で、サーバ側の権限ではない（公開側に守る管理データはない）。
     有効化は管理者本人のGoogleログインによる自動判定だけ（パスフレーズ方式は 2026-11-27 に廃止）。 */
  var ADMIN_FLAG='kg_admin_mode_v1';
  function adminOn(){ try{ return localStorage.getItem(ADMIN_FLAG)==='1'; }catch(_){ return false; } }
  /* 管理者本人のGoogleアカウント（ハッシュで照合し、アドレス自体は埋め込まない）で
     ログインしたら、その端末を自動で管理者として扱う（Kota指示 2026-11-24:
     管理者は端末ごとにログイン・設定する中途半端な形にしない。スマホでもPCでも同じ） */
  var ADMIN_EMAIL_HASH='57214438aece9c683a3ab3120651fe8828ae6230cf855af1acbca324d37b26a3';
  async function noteAdminAccount(u){
    if(!u || !u.email) return false;
    try{
      var h=await sha256hex(String(u.email).trim().toLowerCase());
      if(h===ADMIN_EMAIL_HASH){ localStorage.setItem(ADMIN_FLAG,'1'); return true; }
    }catch(_){}
    return false;
  }
  function renderAdmin(){ var on=adminOn(); var offEl=$('kg-admin-off'), onEl=$('kg-admin-on'); if(offEl) offEl.hidden=on; if(onEl) onEl.hidden=!on; if(on && !user && !member) text('管理者モード（この端末）です。管理者モードだけでは情報は同期されません。他の端末と共有するには、会員コードでログインしてください（管理者モードと両立できます）。'); if(on && !roleAdminLoaded) renderRoleAdmin(); renderState(); }
  /* パスフレーズ方式は廃止（Kota指示 2026-11-27）。管理者の有効化は
     管理者本人のGoogleログインによる自動判定（noteAdminAccount）だけ。
     解除はこの端末の印を消すだけ（パスフレーズ照合なし）。 */
  $('kg-admin-disable').onclick=function(){
    try{ localStorage.removeItem(ADMIN_FLAG); }catch(_){}
    renderAdmin();
    text('管理者モードを解除しました。');
  };
  $('kg-google-login').onclick=async function(){
    if(!client){ text('ログイン機能を読み込めませんでした。通信を確認して、画面を再読み込みしてください。'); return; }
    var button=$('kg-google-login');button.disabled=true;
    var provider=new client.GoogleAuthProvider();
    /* 方式の経緯（2026-11-23）：当初ポップアップのみ→スマホではリダイレクトを先にしたが、
       Kota実機でリダイレクトは「最後まで進んでもログインにならない」（復帰時の結果が端末側で受け取れない）。
       一度成功したのはポップアップ側のため、全端末ポップアップ優先に戻し、
       ポップアップがエラーになった場合だけリダイレクトへ自動で切り替える。 */
    text('Googleログインを開いています…');
    try { await client.signInWithPopup(client.auth,provider); }
    catch(err){
      text('別の方式でログイン画面へ移動します…');
      try { await client.signInWithRedirect(client.auth,provider); return; }
      catch(err2){ text('ログインできませんでした（'+((err2&&err2.code)||(err&&err.code)||'不明なエラー')+'）。'); }
    }
    finally{button.disabled=false;}
  };
  /* 会員コードの起動処理: 主軸（シート）が設定されていれば Firebase を待たずに
     セッション復元する。保険（Firestore）だけの設定でも、Firebase 初期化後に再試行する */
  function bootMember(){
    if(bootMember.done) return; bootMember.done=true;
    $('kg-member').hidden=false;
    try{ localStorage.removeItem('kg_member_code_v1'); localStorage.removeItem('kg_member_selected_v1'); }catch(_){}
    var savedSession=null; try{ savedSession=JSON.parse(localStorage.getItem('kg_member_session_v2')||'null'); }catch(_){}
    if(savedSession && savedSession.acct){
      bootRestoring=true; renderState();
      var attempt=bootMember.attempts||0;
      var settleFail=function(){
        bootRestoring=false; renderState(); bootMember.done=false;
        var still=false; try{ still=!!localStorage.getItem('kg_member_session_v2'); }catch(_){}
        if(still && attempt<2){ bootMember.attempts=attempt+1; setTimeout(bootMember, attempt? 20000: 6000); }
      };
      activateMember(savedSession.acct, savedSession.code||null, true).then(function(ok){
        if(ok){ bootRestoring=false; renderState(); }
        else settleFail();
      }, settleFail);
    }
  }
  retryMemberBoot=bootMember;
  if(syncReady()) bootMember();
  if(!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) {
    if(!syncReady()) { parts(true,false,false,false); text('ログイン機能は準備中です。'); }
    else { text('会員コードでのログインが使えます。'); renderAdmin(); }
    return;
  }
  parts(false,false,false,false); text('ログイン機能を読み込んでいます…');
  (async function(){
    try {
      var app=await fsTimeout(import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'), '読み込みがタイムアウトしました');
      var auth=await fsTimeout(import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'), '読み込みがタイムアウトしました');
      var db=await fsTimeout(import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'), '読み込みがタイムアウトしました');
      var instance=app.initializeApp(cfg);
      client=Object.assign({},db,auth,{auth:auth.getAuth(instance),db:db.getFirestore(instance)});
      auth.onAuthStateChanged(client.auth,function(u){ fbUser=u||null; setupSession(u ? {user:{id:u.uid,email:u.email}} : null); });
      if(auth.getRedirectResult){ auth.getRedirectResult(client.auth).catch(function(err){ text('ログインできませんでした（'+((err&&err.code)||'不明なエラー')+'）。もう一度お試しください。'); }); }
      bootMember();
      renderAdmin();
    } catch(e){ if(!syncReady()){ parts(true,false,false,false); text('ログイン機能を読み込めませんでした（'+((e&&e.message)||'エラー')+'）。通信と設定をご確認ください。'); } }
  })();
})();
