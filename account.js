/* アカウントと推し／イベントの同期。認証・DBはユーザー管理のFirebase。
   未設定時は従来の端末内保存を維持します。 */
(function () {
  'use strict';
  var cfg = window.KG_ACCOUNT_CONFIG || {}, bridge = window.KGAccountBridge;
  var client = null, user = null, initialized = false, running = false, generation = 0;
  var currentMarker = 'kg_account_selected_user_v1';
  var member = null, memberReady = false, choiceMode = 'google', pendingMemberCloud = null, memberPushTimer = null;
  var $ = function (id) { return document.getElementById(id); };
  var overlay = document.createElement('div');
  overlay.innerHTML = '<dialog id="kg-account-dialog" aria-labelledby="kg-account-title" style="width:min(94vw,480px);max-height:90vh;overflow:auto;border:1px solid #ccc;border-radius:16px;padding:22px;color:CanvasText;background:Canvas;box-shadow:0 8px 30px #0005">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><h2 id="kg-account-title" style="font-size:19px;margin:0">ログイン・同期</h2><button id="kg-account-close" type="button" aria-label="閉じる" style="min-width:44px">✕</button></div>' +
    '<p id="kg-account-status" role="status" aria-live="polite"></p>' +
    '<div id="kg-account-off" hidden><p>ログインの接続設定はまだ完了していません。現在の推し・お気に入りはこの端末だけに保存されます。</p></div>' +
    '<div id="kg-login-form" hidden><p>Googleアカウントでログインします。</p><button id="kg-google-login" type="button">Googleでログイン</button></div>' +
    '<div id="kg-account-user" hidden><p id="kg-email-display"></p><p>推し・お気に入り・マイリスト・行きたい／気になる・フォロー・好みなどをこのアカウントに同期します。回しプランはこの情報から作られます。</p><button id="kg-refresh" type="button">クラウドから再読み込み</button> <button id="kg-signout" type="button">ログアウト</button></div>' +
    '<div id="kg-account-choice" hidden><p><strong>この端末のデータをどうしますか？</strong></p><p>統合すると、この端末の推しとお気に入りがアカウントに追加されます。共有端末や別の方のデータなら「アカウントのデータを使う」を選んでください。</p><button id="kg-merge" type="button">この端末のデータを統合</button> <button id="kg-use-cloud" type="button">アカウントのデータを使う</button></div>' +
    '<div id="kg-member" hidden><hr><p><strong>会員コード</strong>（Googleアカウント不要）</p>' +
    '<div id="kg-member-off"><p>サイトが発行するコードがログインの鍵です。端末やブラウザを変えても、コードを入れれば推し・お気に入りが維持できます。メールアドレスなどの個人情報は登録しません。</p><button id="kg-code-issue" type="button">会員コードを発行する</button><p><input id="kg-code-input" type="text" placeholder="持っているコードを入力" autocomplete="off" autocapitalize="characters" style="min-width:200px;padding:6px"> <button id="kg-code-login" type="button">コードでログイン</button></p><p style="font-size:13px">コードを失くした方は、設定しておいた質問と回答でログインできます（ログイン後、コードを再発行できます）。</p><p><input id="kg-rec-q" type="text" placeholder="あなたの質問" autocomplete="off" style="min-width:200px;padding:6px"><br><input id="kg-rec-a" type="text" placeholder="その回答" autocomplete="off" style="min-width:200px;padding:6px"> <button id="kg-recovery-login" type="button">質問と回答でログイン</button></p></div>' +
    '<div id="kg-member-on" hidden><p>会員コードでログイン中です。</p><p>あなたのコード：<strong id="kg-code-display"></strong> <button id="kg-code-copy" type="button">コピー</button> <button id="kg-code-reissue" type="button">コードを再発行</button></p><p style="font-size:13px">このコードの控えがバックアップになります。別の端末ではこのコードを入力してください。</p><p style="font-size:13px">コードを失くしたとき用に、質問と回答を設定できます（自分で決めた質問と、その回答）。</p><p><input id="kg-qa-q" type="text" placeholder="質問（例：初めて行ったライブは？）" autocomplete="off" style="min-width:220px;padding:6px"><br><input id="kg-qa-a" type="text" placeholder="回答" autocomplete="off" style="min-width:220px;padding:6px"> <button id="kg-qa-save" type="button">質問と回答を保存</button></p><button id="kg-code-logout" type="button">この端末からログアウト</button></div></div>' +
    '<div id="kg-guest"><hr><p><strong>ゲスト利用</strong>（一時的な端末向け）</p>' +
    '<div id="kg-guest-off"><p style="font-size:13px">ログインせず、この端末にだけ保存して使います。共有端末や一時的な利用向けです。</p><button id="kg-guest-start" type="button">ゲストとして使う</button></div>' +
    '<div id="kg-guest-on" hidden><p>ゲスト利用中です。推し・お気に入りはこの端末にだけ保存されます。引き継ぎはヘッダーの「データ引っ越し」からバックアップできます。</p><button id="kg-guest-end" type="button">ゲスト利用を終了してデータを消す</button><span id="kg-guest-end-confirm" hidden> <span style="font-size:13px">この端末のデータを消去しますか？</span> <button id="kg-guest-end-yes" type="button">消去する</button> <button id="kg-guest-end-no" type="button">やめる</button></span></div></div>' +
    '<div id="kg-admin"><hr><p><strong>管理者モード</strong></p>' +
    '<div id="kg-admin-off"><p style="font-size:13px">管理者のGoogleアカウントでログインすると、スマホでもPCでも自動で管理者として扱われます（端末ごとに設定は要りません）。パスフレーズで、この端末だけを管理者にすることもできます（端末内にだけ保存されます）。</p><p><input id="kg-admin-p1" type="password" placeholder="パスフレーズ" autocomplete="off" style="min-width:220px;padding:6px"><br><input id="kg-admin-p2" type="password" placeholder="確認のためもう一度（新規設定のとき）" autocomplete="off" style="min-width:220px;padding:6px"></p><button id="kg-admin-enable" type="button">管理者モードを有効にする</button></div>' +
    '<div id="kg-admin-on" hidden><p>管理者モードが有効です（この端末）。ログイン操作は不要です。</p><p><input id="kg-admin-off-p" type="password" placeholder="パスフレーズ" autocomplete="off" style="min-width:220px;padding:6px"></p><button id="kg-admin-disable" type="button">管理者モードを解除する</button></div></div>' +
    '<p style="font-size:13px">メールアドレス・推し・お気に入りを認証・保存サービスで扱います。サービス提供者のプライバシーポリシーをご確認ください。</p></dialog>';
  document.body.appendChild(overlay);
  var dialog = $('kg-account-dialog');
  function text(s) { $('kg-account-status').textContent = s; }
  function showModal() { if (!dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open',''); } }
  $('kg-account-open').onclick = showModal;
  $('kg-account-close').onclick = function () { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); };
  function parts(off, login, logged, choice) { $('kg-account-off').hidden=!off; $('kg-login-form').hidden=!login; $('kg-account-user').hidden=!logged; $('kg-account-choice').hidden=!choice; }
  function queueKey(uid) { return 'kg_account_pending_v1_' + uid; }
  function queueRead(uid) { try { var x=JSON.parse(localStorage.getItem(queueKey(uid))||'[]'); return Array.isArray(x)?x:[]; } catch(e) { return []; } }
  function queueWrite(uid,q) { localStorage.setItem(queueKey(uid),JSON.stringify(q)); }
  function enqueue(uid, ops) { var q=queueRead(uid); queueWrite(uid,q.concat(ops)); }
  function sameUser(uid,g) { return !!user && user.id===uid && generation===g; }
  async function flush(uid,g) {
    if (running) return false;
    running=true;
    try {
      var q=queueRead(uid);
      while(q.length && sameUser(uid,g)) {
        var x=q[0], result;
        var ref=client.doc(client.db,'users',uid,'favorites',favoriteId(x.kind,x.value));
        if(x.op==='add') await fsTimeout(client.setDoc(ref,{kind:x.kind,item_id:x.value}), '同期がタイムアウトしました');
        else await fsTimeout(client.deleteDoc(ref), '同期がタイムアウトしました');
        // 読み出し中に追加された操作を失わない
        var now=queueRead(uid); now.shift(); queueWrite(uid,now); q=now;
      }
      return sameUser(uid,g) && !queueRead(uid).length;
    } catch(e) { noteCloudFail(); text('同期できていません。端末内には保存済みです。通信を確認して「クラウドから再読み込み」を押してください。'); return false; }
    finally { running=false; }
  }
  function favoriteId(kind,value) {
    var bytes=new TextEncoder().encode(kind+':'+value), binary='';
    bytes.forEach(function(b){binary+=String.fromCharCode(b);});
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  /* Firestore 呼び出しのタイムアウト（v53）: オフライン等で Promise が
     永遠に戻らないと同期全体が無言で止まるため、15秒で失敗として扱う */
  function fsTimeout(p, label) {
    return Promise.race([p, new Promise(function (_, rej) {
      setTimeout(function () { var e = new Error(label || '通信がタイムアウトしました'); e.code = 'kg-timeout'; rej(e); }, 15000);
    })]);
  }
  /* クラウド同期の自動停止（v110）: 接続できない状態（DB未作成・圏外など）で
     自動リトライを繰り返すと端末に負荷がかかり続けるため、2回連続で失敗したら
     そのセッションでは30分間、自動のクラウド通信を止める。手動の操作
     （ログイン・発行・再読み込みボタン）は止めない。成功したら即解除する */
  var cloudFails=0, cloudDownUntil=0;
  try{ cloudDownUntil=+sessionStorage.getItem('kg_cloud_down_until')||0; }catch(e){}
  function cloudBlocked(){ return Date.now()<cloudDownUntil; }
  function noteCloudFail(){ cloudFails++; if(cloudFails>=2){ cloudDownUntil=Date.now()+30*60*1000; try{ sessionStorage.setItem('kg_cloud_down_until', String(cloudDownUntil)); }catch(e){} } }
  function noteCloudOk(){ cloudFails=0; if(cloudDownUntil){ cloudDownUntil=0; try{ sessionStorage.removeItem('kg_cloud_down_until'); }catch(e){} } }
  async function pull(uid) {
    if(cloudBlocked()){ var be=new Error('クラウド同期は一時停止中です'); be.code='kg-cloud-down'; throw be; }
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
    noteCloudOk();
    return data;
  }
  async function setupSession(session) {
    generation++; var g=generation;
    user=session && session.user ? session.user : null; initialized=false;
    if(!user){ parts(false,true,false,false); text('ログインしていません。推し・お気に入りは端末内に保存されます。'); renderAdmin(); return; }
    var uid=user.id; $('kg-email-display').textContent='ログイン中：'+(user.email||'アカウント');
    var isAdminAcct=await noteAdminAccount(user);
    if(isAdminAcct){ $('kg-email-display').textContent+='（管理者）'; renderAdmin(); }
    parts(false,false,true,false); renderState();
    if (localStorage.getItem(currentMarker)===uid) {
      text('アカウントのデータを確認しています…');
      if(!await flush(uid,g)) return;
      try { var cloud=await pull(uid); if(!sameUser(uid,g)) return; bridge.replace(cloud); initialized=true; text('同期済み。'); udPullMerge(); }
      catch(e) { noteCloudFail(); text('クラウドの読み込みに失敗しました。端末内データは保持されています。'); }
    } else { choiceMode='google'; parts(false,false,false,true); text('同期方法を選んでください。'); bootChoicePending=true; renderState(); }
  }
  async function applyChoice(merge) {
    if(!user) return; var uid=user.id,g=generation; text('データを確認しています…');
    try {
      if(!await flush(uid,g)) return;
      var cloud=await pull(uid); if(!sameUser(uid,g)) return;
      if(merge) {
        var local=bridge.read(), operations=[];
        ['event','artist'].forEach(function(k){ var present=new Set(cloud[k]); local[k].forEach(function(v){if(!present.has(v)){operations.push({op:'add',kind:k,value:v});present.add(v);}}); cloud[k]=Array.from(present); });
        enqueue(uid,operations); if(!await flush(uid,g)) return;
      }
      if(!sameUser(uid,g)) return;
      bridge.replace(cloud); localStorage.setItem(currentMarker,uid); initialized=true;
      parts(false,false,true,false); text('同期済み。'); udPullMerge();
    } catch(e) { noteCloudFail(); text('同期に失敗しました。端末内データは保持されています。もう一度お試しください。'); }
  }
  $('kg-merge').onclick=function(){ bootChoicePending=false; renderState(); if(choiceMode==='member') applyMemberChoice(true); else applyChoice(true); };
  $('kg-use-cloud').onclick=function(){ if(confirm('この端末の推し・お気に入りをアカウントのデータに置き換えます。よろしいですか？')) { bootChoicePending=false; renderState(); if(choiceMode==='member') applyMemberChoice(false); else applyChoice(false); } };
  $('kg-refresh').onclick=async function(){ if(!user)return; var uid=user.id,g=generation; text('同期しています…'); if(!await flush(uid,g))return; try{var data=await pull(uid);if(!sameUser(uid,g))return;bridge.replace(data);initialized=true;localStorage.setItem(currentMarker,uid);text('同期済み。');udPullMerge();}catch(e){noteCloudFail();text('同期に失敗しました。端末内のデータは保持されています。');} };
  $('kg-signout').onclick=async function(){ if(!user)return; if(queueRead(user.id).length){text('未同期の変更があります。まず同期してからログアウトしてください。');return;} if(!confirm('ログアウトすると、この端末内の推し・お気に入りを消去します。アカウントのデータは残ります。'))return; try { await client.signOut(client.auth); } catch(e) { text('ログアウトできませんでした。'); return; } localStorage.removeItem(currentMarker); bridge.replace({event:[],artist:[]}); };
  window.addEventListener('kg:favorites-change',function(e){
    if(member && memberReady && !(user && initialized)) { scheduleMemberPush(); return; }
    if(!user || !initialized)return;
    var uid=user.id,g=generation,d=e.detail,kind=d.key===bridge.keys.event?'event':d.key===bridge.keys.artist?'artist':null;
    if(!kind)return; var a=new Set(d.before||[]),b=new Set(d.after||[]),ops=[];
    b.forEach(function(v){if(!a.has(v))ops.push({op:'add',kind:kind,value:String(v)});});
    a.forEach(function(v){if(!b.has(v))ops.push({op:'delete',kind:kind,value:String(v)});});
    if(!ops.length)return;
    try{enqueue(uid,ops);}catch(err){text('同期待ちの保存に失敗しました。');showModal();return;}
    text('同期中…'); if(!running) flush(uid,g).then(function(ok){if(ok && sameUser(uid,g))text('同期済み。');});
  });
  /* 会員コード方式（Kotaの提案、2026-11-23）：サイト発行のコードが鍵。個人情報なし。
     アカウント本体は memberdata/{acct}（ランダムID、1人1文書）。
     コードの索引は codes/{SHA-256(コード)}、復旧の索引は recovery/{SHA-256(質問:回答)}。
     コードを失くしても、本人が決めた質問と回答でログインし、コードを再発行できる。 */
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function newCode(){ var a=new Uint8Array(20); crypto.getRandomValues(a); var s=''; for(var i=0;i<20;i++){ s+=CODE_ALPHABET[a[i]%CODE_ALPHABET.length]; if(i%5===4&&i<19)s+='-'; } return s; }
  function newAcct(){ var a=new Uint8Array(32); crypto.getRandomValues(a); return Array.from(a).map(function(b){return b.toString(16).padStart(2,'0');}).join(''); }
  function normCode(s){ return (s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function normQA(s){ return (s||'').trim().toLowerCase().replace(/\s+/g,' '); }
  async function sha256hex(t){ var buf=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join(''); }
  function codeHashOf(code){ return sha256hex('kg-code:'+normCode(code)); }
  function recoveryHashOf(q,a){ return sha256hex('kg-recovery:'+normQA(q)+':'+normQA(a)); }
  function memberRef(acct){ return client.doc(client.db,'memberdata',acct); }
  async function memberDoc(acct){ var snap=await fsTimeout(client.getDoc(memberRef(acct)), 'データの読み込みがタイムアウトしました'); return snap.exists() ? (snap.data()||{}) : null; }
  function cloudOf(d){ return {event:Array.isArray(d.events)?d.events:[], artist:Array.isArray(d.artists)?d.artists:[]}; }
  async function memberPushFavorites(acct){ var local=bridge.read(); await fsTimeout(client.setDoc(memberRef(acct), {events:local.event, artists:local.artist, updatedAt:Date.now()}, {merge:true}), '同期がタイムアウトしました'); }
  async function memberSetMeta(acct, fields){ await fsTimeout(client.setDoc(memberRef(acct), fields, {merge:true}), '保存がタイムアウトしました'); }
  function saveMemberSession(){ if(member) localStorage.setItem('kg_member_session_v2', JSON.stringify({acct:member.acct, code:member.code||null})); }
  function renderMember(){ var has=!!member; $('kg-member-off').hidden=has; $('kg-member-on').hidden=!has; if(has) $('kg-code-display').textContent = member.code ? member.code : '（未設定）'; }
  function scheduleMemberPush(){ if(!member||!memberReady)return; if(memberPushTimer)clearTimeout(memberPushTimer); memberPushTimer=setTimeout(function(){ if(!member)return; memberPushFavorites(member.acct).then(function(){ text('同期済み（会員コード）。'); }, function(e){ text('同期できませんでした（'+((e&&e.code)||'エラー')+'）。端末内には保存済みです。'); }); },700); }
  /* ---------- その他の端末データの同期（v105で追加） ----------
     推し・お気に入り以外の端末データ（行きたい／気になる／マイリスト／
     フォロー／好み／保存した絞り込み／学習／終了表示）も端末をまたげるよう、
     1つのまとまりとして同期する。保存先: 会員コード=memberdata の userdata 欄、
     Google=users/{uid}/userdata/main。取り込みは原則「統合」（和集合）で、
     端末のデータを勝手に消さない。反映は localStorage へ書いて1回だけ再読込 */
  var UD_KEYS={want:'kg_trial_want_events_v1',interest:'kg_trial_interest_events_v1',lists:'kg_trial_lists_v1',follows:'kg_trial_follows_v1',prefs:'kg_trial_prefs_v1',profiles:'kg_filter_profiles_v1',learned:'kg_trial_learn_v1',showEnded:'kg_trial_show_ended'};
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
      showEnded:localStorage.getItem(UD_KEYS.showEnded)==='1'
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
    var lp=local.prefs||{}, cp=cloud.prefs||{}, prefs={};
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
    }catch(e){}
  }
  var udBusy=false, udLastSig='';
  async function udPushNow(){
    if(udBusy) return;
    if(cloudBlocked()) return;
    var sig=udSig(); if(!sig || sig===udLastSig) return;
    var data=udReadLocal();
    try{ if(JSON.stringify(data).length>900000) return; }catch(e){ return; }
    udBusy=true;
    try{
      if(member && memberReady){ await memberSetMeta(member.acct, {userdata:data, udUpdatedAt:Date.now()}); udLastSig=sig; noteCloudOk(); }
      else if(user && initialized){ await fsTimeout(client.setDoc(client.doc(client.db,'users',user.id,'userdata','main'), {data:data, updatedAt:Date.now()}), '同期がタイムアウトしました'); udLastSig=sig; noteCloudOk(); }
    }catch(e){ noteCloudFail(); /* 失敗しても端末内データは無事。次回の定期チェックで再送する */ }
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
    if(cloudBlocked()) return;
    try{
      var cloud=null;
      if(member && memberReady){ var d=await memberDoc(member.acct); cloud=d? d.userdata : null; }
      else if(user && initialized){ var snap=await fsTimeout(client.getDoc(client.doc(client.db,'users',user.id,'userdata','main')), '読み込みがタイムアウトしました'); cloud=snap.exists()? (snap.data()||{}).data : null; }
      else return;
      noteCloudOk();
      udArmWatchers();
      if(!cloud){ udLastSig=''; await udPushNow(); return; }
      var before=udSig();
      var merged=udMerge(udReadLocal(), cloud);
      udWriteLocal(merged);
      udLastSig=udSig();
      try{
        if(member && memberReady) await memberSetMeta(member.acct, {userdata:merged, udUpdatedAt:Date.now()});
        else if(user && initialized) await fsTimeout(client.setDoc(client.doc(client.db,'users',user.id,'userdata','main'), {data:merged, updatedAt:Date.now()}), '同期がタイムアウトしました');
      }catch(e){}
      if(before!==udLastSig && !sessionStorage.getItem('kg_ud_reloaded')){
        sessionStorage.setItem('kg_ud_reloaded','1');
        location.reload();
      }
    }catch(e){ noteCloudFail(); /* 読めなくても端末内データで継続する */ }
  }
  async function activateMember(acct, code, fromRestore){
    var d = await memberDoc(acct);
    if(!d) return false;
    member = {acct:acct, code:code||null};
    saveMemberSession();
    renderMember(); renderState();
    if(localStorage.getItem('kg_member_selected_v2')===acct){ bridge.replace(cloudOf(d)); memberReady=true; text('同期済み（会員コード）。'); udPullMerge(); }
    else { pendingMemberCloud=cloudOf(d); choiceMode='member'; parts(false, !user, !!user, true); text('同期方法を選んでください。'); if(!fromRestore){ bootChoicePending=true; renderState(); } }
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
  $('kg-code-issue').onclick=async function(){
    if(!client){ text('接続の準備中です。少し待ってからお試しください。'); return; }
    if(member){ text('すでに会員コードでログイン中です。'); return; }
    try {
      var acct=newAcct(); var code=newCode(); var ch=await codeHashOf(code);
      var local=bridge.read();
      await fsTimeout(client.setDoc(memberRef(acct), {events:local.event, artists:local.artist, updatedAt:Date.now(), codeHash:ch}), '発行がタイムアウトしました。データベースの準備ができていない可能性があります');
      await fsTimeout(client.setDoc(client.doc(client.db,'codes',ch), {acct:acct}), '発行がタイムアウトしました。データベースの準備ができていない可能性があります');
      member={acct:acct, code:code}; saveMemberSession();
      localStorage.setItem('kg_member_selected_v2', acct);
      memberReady=true; renderMember();
      text('会員コードを発行しました。コードを控えてください。質問と回答を設定すると、コードを失くしても戻れます。');
    } catch(e){ member=null; text('コードを発行できませんでした（'+((e&&e.code)||'エラー')+'）。接続できないか、データベースの準備ができていない可能性があります。通信を確認してもう一度お試しください。'); }
  };
  $('kg-code-login').onclick=async function(){
    if(!client){ text('接続の準備中です。少し待ってからお試しください。'); return; }
    var code=$('kg-code-input').value;
    if(normCode(code).length<20){ text('コードの形式が違うようです。'); return; }
    try {
      var ch=await codeHashOf(code);
      var snap=await fsTimeout(client.getDoc(client.doc(client.db,'codes',ch)), 'ログインがタイムアウトしました');
      if(!snap.exists()){ text('そのコードが見つかりませんでした。'); return; }
      if(!await activateMember(snap.data().acct, code)) text('データが見つかりませんでした。');
    } catch(e){ text('ログインできませんでした（'+((e&&e.code)||'エラー')+'）。接続できない可能性があります。通信を確認してもう一度お試しください。'); }
  };
  $('kg-recovery-login').onclick=async function(){
    if(!client){ text('接続の準備中です。少し待ってからお試しください。'); return; }
    var q=$('kg-rec-q').value, a=$('kg-rec-a').value;
    if(!normQA(q)||!normQA(a)){ text('質問と回答の両方を入力してください。'); return; }
    try {
      var rh=await recoveryHashOf(q,a);
      var snap=await fsTimeout(client.getDoc(client.doc(client.db,'recovery',rh)), 'ログインがタイムアウトしました');
      if(!snap.exists()){ text('質問と回答が一致するアカウントが見つかりませんでした。'); return; }
      var ok=await activateMember(snap.data().acct, null);
      if(!ok){ text('データが見つかりませんでした。'); return; }
      if(memberReady) text('質問と回答でログインしました。コードは未設定です。「コードを再発行」で新しいコードを作ってください。');
    } catch(e){ text('ログインできませんでした（'+((e&&e.code)||'エラー')+'）。接続できない可能性があります。通信を確認してもう一度お試しください。'); }
  };
  $('kg-code-copy').onclick=function(){ if(!member||!member.code)return; if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(member.code).then(function(){ text('コードをコピーしました。'); }, function(){ text('コピーできませんでした。コードをメモしてください。'); }); } };
  $('kg-code-reissue').onclick=async function(){
    if(!member||!client) return;
    if(!confirm('新しいコードを発行します。今までのコードは使えなくなります。よろしいですか？')) return;
    try {
      var d=await memberDoc(member.acct);
      var code=newCode(); var ch=await codeHashOf(code);
      await fsTimeout(client.setDoc(client.doc(client.db,'codes',ch), {acct:member.acct}), '再発行がタイムアウトしました');
      if(d && d.codeHash && d.codeHash!==ch){ try{ await fsTimeout(client.deleteDoc(client.doc(client.db,'codes',d.codeHash))); }catch(_){} }
      await memberSetMeta(member.acct, {codeHash:ch});
      member.code=code; saveMemberSession(); renderMember();
      text('新しいコードを発行しました。控えてください。');
    } catch(e){ text('再発行できませんでした（'+((e&&e.code)||'エラー')+'）。'); }
  };
  $('kg-qa-save').onclick=async function(){
    if(!member||!client) return;
    var q=$('kg-qa-q').value, a=$('kg-qa-a').value;
    if(!normQA(q)||!normQA(a)){ text('質問と回答の両方を入力してください。'); return; }
    try {
      var d=await memberDoc(member.acct);
      var rh=await recoveryHashOf(q,a);
      var existing=await fsTimeout(client.getDoc(client.doc(client.db,'recovery',rh)), '保存がタイムアウトしました');
      if(existing.exists() && existing.data().acct!==member.acct){ text('その質問と回答の組み合わせは、すでに使われています。質問か回答を少し変えてください。'); return; }
      if(d && d.recoveryHash && d.recoveryHash!==rh){ try{ await fsTimeout(client.deleteDoc(client.doc(client.db,'recovery',d.recoveryHash))); }catch(_){} }
      await fsTimeout(client.setDoc(client.doc(client.db,'recovery',rh), {acct:member.acct}), '保存がタイムアウトしました');
      await memberSetMeta(member.acct, {recoveryHash:rh});
      $('kg-qa-a').value='';
      text('質問と回答を保存しました。コードを失くしても、この質問と回答でログインできます。');
    } catch(e){ text('保存できませんでした（'+((e&&e.code)||'エラー')+'）。'); }
  };
  $('kg-code-logout').onclick=function(){
    if(!member)return;
    if(!confirm('ログアウトすると、この端末内の推し・お気に入りを消去します。コード、または質問と回答を控えていない場合、データに戻れなくなります。よろしいですか？'))return;
    localStorage.removeItem('kg_member_session_v2'); localStorage.removeItem('kg_member_selected_v2'); localStorage.removeItem('kg_member_code_v1'); localStorage.removeItem('kg_member_selected_v1');
    try{ sessionStorage.removeItem('kg_ud_reloaded'); }catch(_){}
    member=null; memberReady=false; pendingMemberCloud=null; renderMember(); renderState();
    bridge.replace({event:[],artist:[]});
    text('ログアウトしました。');
  };
  /* 状態表記（Kota、2026-11-23）：ログイン中かどうかをヘッダーのボタン自体に表示する。
     ゲスト利用は一時的な端末向け（端末内だけに保存し、終了時に消せる）。 */
  var GUEST_FLAG='kg_guest_mode_v1';
  function guestOn(){ try{ return localStorage.getItem(GUEST_FLAG)==='1'; }catch(_){ return false; } }
  var bootChoicePending=false;
  function stateLabel(){
    if(adminOn()) return '管理者モード';
    if(user) return 'ログイン中（同期ON）'+(bootChoicePending?'・要選択':'');
    if(member) return 'ログイン中（会員コード）'+(bootChoicePending?'・要選択':'');
    if(guestOn()) return 'ゲスト利用中';
    return '未ログイン / 同期';
  }
  function renderState(){
    var b=$('kg-account-open'); if(b) b.textContent=stateLabel();
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
    try{ localStorage.removeItem(GUEST_FLAG); localStorage.removeItem('kg_trial_prefs_v1'); localStorage.removeItem('kg_trial_learn_v1'); }catch(_){}
    bridge.replace({event:[],artist:[]});
    renderState();
    text('ゲスト利用を終了し、この端末のデータを消去しました。');
  };
  /* 管理者モード（Kota、2026-11-23）：管理者の端末ではログイン操作を不要にする。
     端末内にだけ保存される印で、サーバ側の権限ではない（公開側に守る管理データはない）。
     有効化・解除には本人が決めたパスフレーズが要る（ハッシュだけを端末に保存）。 */
  var ADMIN_FLAG='kg_admin_mode_v1', ADMIN_HASH='kg_admin_hash_v1';
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
  function renderAdmin(){ var on=adminOn(); var offEl=$('kg-admin-off'), onEl=$('kg-admin-on'); if(offEl) offEl.hidden=on; if(onEl) onEl.hidden=!on; if(on && !user && !member) text('管理者モード（この端末）。ログインは不要です。'); renderState(); }
  /* パスフレーズはダイアログ内の通常 input で扱う（v53）。prompt() は
     ダイアログ抑制環境で無言で null を返し、管理者フロー全体が死ぬため使わない。
     ハッシュ保存形式（kg-admin: 前置＋ kg_admin_hash_v1 / kg_admin_mode_v1）は従来互換 */
  $('kg-admin-enable').onclick=async function(){
    var existing=null; try{ existing=localStorage.getItem(ADMIN_HASH); }catch(_){}
    var p1=($('kg-admin-p1')||{}).value||'';
    if(!p1){ text('パスフレーズを入力してください。'); return; }
    var h=await sha256hex('kg-admin:'+p1);
    if(existing){ if(h!==existing){ text('パスフレーズが違います。'); return; } }
    else {
      var p2=($('kg-admin-p2')||{}).value||'';
      if(p2!==p1){ text('パスフレーズが一致しませんでした。確認欄にも同じものを入力してください。'); return; }
      try{ localStorage.setItem(ADMIN_HASH, h); }catch(_){}
    }
    try{ localStorage.setItem(ADMIN_FLAG, '1'); }catch(_){}
    var i1=$('kg-admin-p1'), i2=$('kg-admin-p2'); if(i1)i1.value=''; if(i2)i2.value='';
    renderAdmin();
    text('管理者モードを有効にしました。この端末ではログイン不要です。');
  };
  $('kg-admin-disable').onclick=async function(){
    var p=($('kg-admin-off-p')||{}).value||'';
    if(!p){ text('パスフレーズを入力してください。'); return; }
    var h=await sha256hex('kg-admin:'+p);
    var existing=null; try{ existing=localStorage.getItem(ADMIN_HASH); }catch(_){}
    if(h!==existing){ text('パスフレーズが違います。'); return; }
    try{ localStorage.removeItem(ADMIN_FLAG); }catch(_){}
    var io=$('kg-admin-off-p'); if(io)io.value='';
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
  if(!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) { parts(true,false,false,false); text('ログイン機能は準備中です。'); return; }
  parts(false,false,false,false); text('ログイン機能を読み込んでいます…');
  (async function(){
    try {
      var app=await fsTimeout(import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'), '読み込みがタイムアウトしました');
      var auth=await fsTimeout(import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'), '読み込みがタイムアウトしました');
      var db=await fsTimeout(import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'), '読み込みがタイムアウトしました');
      var instance=app.initializeApp(cfg);
      client=Object.assign({},db,auth,{auth:auth.getAuth(instance),db:db.getFirestore(instance)});
      auth.onAuthStateChanged(client.auth,function(u){setupSession(u ? {user:{id:u.uid,email:u.email}} : null);});
      if(auth.getRedirectResult){ auth.getRedirectResult(client.auth).catch(function(err){ text('ログインできませんでした（'+((err&&err.code)||'不明なエラー')+'）。もう一度お試しください。'); }); }
      $('kg-member').hidden=false;
      try{ localStorage.removeItem('kg_member_code_v1'); localStorage.removeItem('kg_member_selected_v1'); }catch(_){}
      var savedSession=null; try{ savedSession=JSON.parse(localStorage.getItem('kg_member_session_v2')||'null'); }catch(_){}
      if(savedSession && savedSession.acct){ activateMember(savedSession.acct, savedSession.code||null, true).catch(function(){ /* 復元できない場合は未ログインのまま */ }); }
      renderAdmin();
    } catch(e){parts(true,false,false,false);text('ログイン機能を読み込めませんでした（'+((e&&e.message)||'エラー')+'）。通信と設定をご確認ください。');}
  })();
})();
