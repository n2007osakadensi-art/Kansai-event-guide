/* アカウントと推し／イベントの同期。認証・DBはユーザー管理のFirebase。
   未設定時は従来の端末内保存を維持します。 */
(function () {
  'use strict';
  var cfg = window.KG_ACCOUNT_CONFIG || {}, bridge = window.KGAccountBridge;
  var client = null, user = null, initialized = false, running = false, generation = 0;
  var currentMarker = 'kg_account_selected_user_v1';
  var $ = function (id) { return document.getElementById(id); };
  var overlay = document.createElement('div');
  overlay.innerHTML = '<dialog id="kg-account-dialog" aria-labelledby="kg-account-title" style="width:min(94vw,480px);max-height:90vh;overflow:auto;border:1px solid #ccc;border-radius:16px;padding:22px;color:CanvasText;background:Canvas;box-shadow:0 8px 30px #0005">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><h2 id="kg-account-title" style="font-size:19px;margin:0">ログイン・同期</h2><button id="kg-account-close" type="button" aria-label="閉じる" style="min-width:44px">✕</button></div>' +
    '<p id="kg-account-status" role="status" aria-live="polite"></p>' +
    '<div id="kg-account-off" hidden><p>ログインの接続設定はまだ完了していません。現在の推し・お気に入りはこの端末だけに保存されます。</p></div>' +
    '<div id="kg-login-form" hidden><p>Googleアカウントでログインします。</p><button id="kg-google-login" type="button">Googleでログイン</button></div>' +
    '<div id="kg-account-user" hidden><p id="kg-email-display"></p><p>推しとお気に入りをこのアカウントに同期します。回しプランはこの情報から作られます。</p><button id="kg-refresh" type="button">クラウドから再読み込み</button> <button id="kg-signout" type="button">ログアウト</button></div>' +
    '<div id="kg-account-choice" hidden><p><strong>この端末のデータをどうしますか？</strong></p><p>統合すると、この端末の推しとお気に入りがアカウントに追加されます。共有端末や別の方のデータなら「アカウントのデータを使う」を選んでください。</p><button id="kg-merge" type="button">この端末のデータを統合</button> <button id="kg-use-cloud" type="button">アカウントのデータを使う</button></div>' +
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
        if(x.op==='add') await client.setDoc(ref,{kind:x.kind,item_id:x.value});
        else await client.deleteDoc(ref);
        // 読み出し中に追加された操作を失わない
        var now=queueRead(uid); now.shift(); queueWrite(uid,now); q=now;
      }
      return sameUser(uid,g) && !queueRead(uid).length;
    } catch(e) { text('同期できていません。端末内には保存済みです。通信を確認して「クラウドから再読み込み」を押してください。'); return false; }
    finally { running=false; }
  }
  function favoriteId(kind,value) {
    var bytes=new TextEncoder().encode(kind+':'+value), binary='';
    bytes.forEach(function(b){binary+=String.fromCharCode(b);});
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  async function pull(uid) {
    var data={event:[],artist:[]}, last=null, pageSize=500;
    while(true) {
      var col=client.collection(client.db,'users',uid,'favorites');
      var q=last ? client.query(col,client.orderBy(client.documentId()),client.startAfter(last),client.limit(pageSize)) : client.query(col,client.orderBy(client.documentId()),client.limit(pageSize));
      var snapshot=await client.getDocs(q);
      snapshot.docs.forEach(function(doc){var x=doc.data();if(data[x.kind] && typeof x.item_id==='string')data[x.kind].push(x.item_id);});
      if(snapshot.docs.length<pageSize)break;
      last=snapshot.docs[snapshot.docs.length-1];
    }
    return data;
  }
  async function setupSession(session) {
    generation++; var g=generation;
    user=session && session.user ? session.user : null; initialized=false;
    if(!user){ parts(false,true,false,false); text('ログインしていません。推し・お気に入りは端末内に保存されます。'); return; }
    var uid=user.id; $('kg-email-display').textContent='ログイン中：'+(user.email||'アカウント');
    parts(false,false,true,false);
    if (localStorage.getItem(currentMarker)===uid) {
      text('アカウントのデータを確認しています…');
      if(!await flush(uid,g)) return;
      try { var cloud=await pull(uid); if(!sameUser(uid,g)) return; bridge.replace(cloud); initialized=true; text('同期済み。'); }
      catch(e) { text('クラウドの読み込みに失敗しました。端末内データは保持されています。'); }
    } else { parts(false,false,false,true); text('同期方法を選んでください。'); showModal(); }
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
      parts(false,false,true,false); text('同期済み。');
    } catch(e) { text('同期に失敗しました。端末内データは保持されています。もう一度お試しください。'); }
  }
  $('kg-merge').onclick=function(){applyChoice(true);};
  $('kg-use-cloud').onclick=function(){ if(confirm('この端末の推し・お気に入りをアカウントのデータに置き換えます。よろしいですか？')) applyChoice(false); };
  $('kg-refresh').onclick=async function(){ if(!user)return; var uid=user.id,g=generation; text('同期しています…'); if(!await flush(uid,g))return; try{var data=await pull(uid);if(!sameUser(uid,g))return;bridge.replace(data);initialized=true;localStorage.setItem(currentMarker,uid);text('同期済み。');}catch(e){text('同期に失敗しました。端末内のデータは保持されています。');} };
  $('kg-signout').onclick=async function(){ if(!user)return; if(queueRead(user.id).length){text('未同期の変更があります。まず同期してからログアウトしてください。');return;} if(!confirm('ログアウトすると、この端末内の推し・お気に入りを消去します。アカウントのデータは残ります。'))return; try { await client.signOut(client.auth); } catch(e) { text('ログアウトできませんでした。'); return; } localStorage.removeItem(currentMarker); bridge.replace({event:[],artist:[]}); };
  window.addEventListener('kg:favorites-change',function(e){
    if(!user || !initialized)return;
    var uid=user.id,g=generation,d=e.detail,kind=d.key===bridge.keys.event?'event':d.key===bridge.keys.artist?'artist':null;
    if(!kind)return; var a=new Set(d.before||[]),b=new Set(d.after||[]),ops=[];
    b.forEach(function(v){if(!a.has(v))ops.push({op:'add',kind:kind,value:String(v)});});
    a.forEach(function(v){if(!b.has(v))ops.push({op:'delete',kind:kind,value:String(v)});});
    if(!ops.length)return;
    try{enqueue(uid,ops);}catch(err){text('同期待ちの保存に失敗しました。');showModal();return;}
    text('同期中…'); if(!running) flush(uid,g).then(function(ok){if(ok && sameUser(uid,g))text('同期済み。');});
  });
  $('kg-google-login').onclick=async function(){
    if(!client)return;
    var button=$('kg-google-login');button.disabled=true;
    var provider=new client.GoogleAuthProvider();
    var standalone=window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches;
    var mobile=/iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent||'');
    /* スマホとインストール済みPWAではポップアップ方式が弾かれやすいため、
       Googleのログイン画面へ遷移して戻るリダイレクト方式を使う（Kota実機で両OSとも弾かれたため、2026-11-23）。 */
    if(standalone||mobile){
      text('Googleのログイン画面へ移動します…');
      try { await client.signInWithRedirect(client.auth,provider); return; }
      catch(err){ text('ログイン画面へ移動できませんでした（'+((err&&err.code)||'不明なエラー')+'）。'); button.disabled=false; return; }
    }
    text('Googleログインを開いています…');
    try { await client.signInWithPopup(client.auth,provider); }
    catch(err){ text('ログインできませんでした（'+((err&&err.code)||'不明なエラー')+'）。ポップアップの設定と公開ドメインの認証設定をご確認ください。'); }
    finally{button.disabled=false;}
  };
  if(!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) { parts(true,false,false,false); text('ログイン機能は準備中です。'); return; }
  parts(false,false,false,false); text('ログイン機能を読み込んでいます…');
  (async function(){
    try {
      var app=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
      var auth=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js');
      var db=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
      var instance=app.initializeApp(cfg);
      client=Object.assign({},db,auth,{auth:auth.getAuth(instance),db:db.getFirestore(instance)});
      auth.onAuthStateChanged(client.auth,function(u){setupSession(u ? {user:{id:u.uid,email:u.email}} : null);});
      if(auth.getRedirectResult){ auth.getRedirectResult(client.auth).catch(function(err){ text('ログインできませんでした（'+((err&&err.code)||'不明なエラー')+'）。もう一度お試しください。'); }); }
    } catch(e){parts(true,false,false,false);text('ログイン機能を読み込めません。通信と設定をご確認ください。');}
  })();
})();
