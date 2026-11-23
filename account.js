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
    '<div id="kg-account-user" hidden><p id="kg-email-display"></p><p>推しとお気に入りをこのアカウントに同期します。回しプランはこの情報から作られます。</p><button id="kg-refresh" type="button">クラウドから再読み込み</button> <button id="kg-signout" type="button">ログアウト</button></div>' +
    '<div id="kg-account-choice" hidden><p><strong>この端末のデータをどうしますか？</strong></p><p>統合すると、この端末の推しとお気に入りがアカウントに追加されます。共有端末や別の方のデータなら「アカウントのデータを使う」を選んでください。</p><button id="kg-merge" type="button">この端末のデータを統合</button> <button id="kg-use-cloud" type="button">アカウントのデータを使う</button></div>' +
    '<div id="kg-member" hidden><hr><p><strong>会員コード</strong>（Googleアカウント不要）</p>' +
    '<div id="kg-member-off"><p>サイトが発行するコードがログインの鍵です。端末やブラウザを変えても、コードを入れれば推し・お気に入りが維持できます。メールアドレスなどの個人情報は登録しません。</p><button id="kg-code-issue" type="button">会員コードを発行する</button><p><input id="kg-code-input" type="text" placeholder="持っているコードを入力" autocomplete="off" autocapitalize="characters" style="min-width:200px;padding:6px"> <button id="kg-code-login" type="button">コードでログイン</button></p><p style="font-size:13px">コードを失くした方は、設定しておいた質問と回答でログインできます（ログイン後、コードを再発行できます）。</p><p><input id="kg-rec-q" type="text" placeholder="あなたの質問" autocomplete="off" style="min-width:200px;padding:6px"><br><input id="kg-rec-a" type="text" placeholder="その回答" autocomplete="off" style="min-width:200px;padding:6px"> <button id="kg-recovery-login" type="button">質問と回答でログイン</button></p></div>' +
    '<div id="kg-member-on" hidden><p>会員コードでログイン中です。</p><p>あなたのコード：<strong id="kg-code-display"></strong> <button id="kg-code-copy" type="button">コピー</button> <button id="kg-code-reissue" type="button">コードを再発行</button></p><p style="font-size:13px">このコードの控えがバックアップになります。別の端末ではこのコードを入力してください。</p><p style="font-size:13px">コードを失くしたとき用に、質問と回答を設定できます（自分で決めた質問と、その回答）。</p><p><input id="kg-qa-q" type="text" placeholder="質問（例：初めて行ったライブは？）" autocomplete="off" style="min-width:220px;padding:6px"><br><input id="kg-qa-a" type="text" placeholder="回答" autocomplete="off" style="min-width:220px;padding:6px"> <button id="kg-qa-save" type="button">質問と回答を保存</button></p><button id="kg-code-logout" type="button">この端末からログアウト</button></div></div>' +
    '<div id="kg-guest"><hr><p><strong>ゲスト利用</strong>（一時的な端末向け）</p>' +
    '<div id="kg-guest-off"><p style="font-size:13px">ログインせず、この端末にだけ保存して使います。共有端末や一時的な利用向けです。</p><button id="kg-guest-start" type="button">ゲストとして使う</button></div>' +
    '<div id="kg-guest-on" hidden><p>ゲスト利用中です。推し・お気に入りはこの端末にだけ保存されます。</p><button id="kg-guest-end" type="button">ゲスト利用を終了してデータを消す</button></div></div>' +
    '<div id="kg-admin"><hr><p><strong>管理者モード</strong>（この端末だけ）</p>' +
    '<div id="kg-admin-off"><p style="font-size:13px">管理者の端末では、ログイン操作なしで管理者として扱います。有効化には管理者パスフレーズの設定が必要です（この端末内にだけ保存されます）。</p><button id="kg-admin-enable" type="button">管理者モードを有効にする</button></div>' +
    '<div id="kg-admin-on" hidden><p>管理者モードが有効です（この端末）。ログイン操作は不要です。</p><button id="kg-admin-disable" type="button">管理者モードを解除する</button></div></div>' +
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
    if(!user){ parts(false,true,false,false); text('ログインしていません。推し・お気に入りは端末内に保存されます。'); renderAdmin(); return; }
    var uid=user.id; $('kg-email-display').textContent='ログイン中：'+(user.email||'アカウント');
    parts(false,false,true,false); renderState();
    if (localStorage.getItem(currentMarker)===uid) {
      text('アカウントのデータを確認しています…');
      if(!await flush(uid,g)) return;
      try { var cloud=await pull(uid); if(!sameUser(uid,g)) return; bridge.replace(cloud); initialized=true; text('同期済み。'); }
      catch(e) { text('クラウドの読み込みに失敗しました。端末内データは保持されています。'); }
    } else { choiceMode='google'; parts(false,false,false,true); text('同期方法を選んでください。'); showModal(); }
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
  $('kg-merge').onclick=function(){ if(choiceMode==='member') applyMemberChoice(true); else applyChoice(true); };
  $('kg-use-cloud').onclick=function(){ if(confirm('この端末の推し・お気に入りをアカウントのデータに置き換えます。よろしいですか？')) { if(choiceMode==='member') applyMemberChoice(false); else applyChoice(false); } };
  $('kg-refresh').onclick=async function(){ if(!user)return; var uid=user.id,g=generation; text('同期しています…'); if(!await flush(uid,g))return; try{var data=await pull(uid);if(!sameUser(uid,g))return;bridge.replace(data);initialized=true;localStorage.setItem(currentMarker,uid);text('同期済み。');}catch(e){text('同期に失敗しました。端末内のデータは保持されています。');} };
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
  async function memberDoc(acct){ var snap=await client.getDoc(memberRef(acct)); return snap.exists() ? (snap.data()||{}) : null; }
  function cloudOf(d){ return {event:Array.isArray(d.events)?d.events:[], artist:Array.isArray(d.artists)?d.artists:[]}; }
  async function memberPushFavorites(acct){ var local=bridge.read(); await client.setDoc(memberRef(acct), {events:local.event, artists:local.artist, updatedAt:Date.now()}, {merge:true}); }
  async function memberSetMeta(acct, fields){ await client.setDoc(memberRef(acct), fields, {merge:true}); }
  function saveMemberSession(){ if(member) localStorage.setItem('kg_member_session_v2', JSON.stringify({acct:member.acct, code:member.code||null})); }
  function renderMember(){ var has=!!member; $('kg-member-off').hidden=has; $('kg-member-on').hidden=!has; if(has) $('kg-code-display').textContent = member.code ? member.code : '（未設定）'; }
  function scheduleMemberPush(){ if(!member||!memberReady)return; if(memberPushTimer)clearTimeout(memberPushTimer); memberPushTimer=setTimeout(function(){ if(!member)return; memberPushFavorites(member.acct).then(function(){ text('同期済み（会員コード）。'); }, function(e){ text('同期できませんでした（'+((e&&e.code)||'エラー')+'）。端末内には保存済みです。'); }); },700); }
  async function activateMember(acct, code, fromRestore){
    var d = await memberDoc(acct);
    if(!d) return false;
    member = {acct:acct, code:code||null};
    saveMemberSession();
    renderMember(); renderState();
    if(localStorage.getItem('kg_member_selected_v2')===acct){ bridge.replace(cloudOf(d)); memberReady=true; text('同期済み（会員コード）。'); }
    else { pendingMemberCloud=cloudOf(d); choiceMode='member'; parts(false, !user, !!user, true); text('同期方法を選んでください。'); if(!fromRestore) showModal(); }
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
      text('同期済み（会員コード）。');
    } catch(e){ text('同期に失敗しました（'+((e&&e.code)||'エラー')+'）。端末内データは保持されています。'); }
  }
  $('kg-code-issue').onclick=async function(){
    if(!client){ text('接続の準備中です。少し待ってからお試しください。'); return; }
    if(member){ text('すでに会員コードでログイン中です。'); return; }
    try {
      var acct=newAcct(); var code=newCode(); var ch=await codeHashOf(code);
      var local=bridge.read();
      await client.setDoc(memberRef(acct), {events:local.event, artists:local.artist, updatedAt:Date.now(), codeHash:ch});
      await client.setDoc(client.doc(client.db,'codes',ch), {acct:acct});
      member={acct:acct, code:code}; saveMemberSession();
      localStorage.setItem('kg_member_selected_v2', acct);
      memberReady=true; renderMember();
      text('会員コードを発行しました。コードを控えてください。質問と回答を設定すると、コードを失くしても戻れます。');
    } catch(e){ member=null; text('コードを発行できませんでした（'+((e&&e.code)||'エラー')+'）。データベースの準備ができていない可能性があります。'); }
  };
  $('kg-code-login').onclick=async function(){
    if(!client){ text('接続の準備中です。少し待ってからお試しください。'); return; }
    var code=$('kg-code-input').value;
    if(normCode(code).length<20){ text('コードの形式が違うようです。'); return; }
    try {
      var ch=await codeHashOf(code);
      var snap=await client.getDoc(client.doc(client.db,'codes',ch));
      if(!snap.exists()){ text('そのコードが見つかりませんでした。'); return; }
      if(!await activateMember(snap.data().acct, code)) text('データが見つかりませんでした。');
    } catch(e){ text('ログインできませんでした（'+((e&&e.code)||'エラー')+'）。'); }
  };
  $('kg-recovery-login').onclick=async function(){
    if(!client){ text('接続の準備中です。少し待ってからお試しください。'); return; }
    var q=$('kg-rec-q').value, a=$('kg-rec-a').value;
    if(!normQA(q)||!normQA(a)){ text('質問と回答の両方を入力してください。'); return; }
    try {
      var rh=await recoveryHashOf(q,a);
      var snap=await client.getDoc(client.doc(client.db,'recovery',rh));
      if(!snap.exists()){ text('質問と回答が一致するアカウントが見つかりませんでした。'); return; }
      var ok=await activateMember(snap.data().acct, null);
      if(!ok){ text('データが見つかりませんでした。'); return; }
      if(memberReady) text('質問と回答でログインしました。コードは未設定です。「コードを再発行」で新しいコードを作ってください。');
    } catch(e){ text('ログインできませんでした（'+((e&&e.code)||'エラー')+'）。'); }
  };
  $('kg-code-copy').onclick=function(){ if(!member||!member.code)return; if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(member.code).then(function(){ text('コードをコピーしました。'); }, function(){ text('コピーできませんでした。コードをメモしてください。'); }); } };
  $('kg-code-reissue').onclick=async function(){
    if(!member||!client) return;
    if(!confirm('新しいコードを発行します。今までのコードは使えなくなります。よろしいですか？')) return;
    try {
      var d=await memberDoc(member.acct);
      var code=newCode(); var ch=await codeHashOf(code);
      await client.setDoc(client.doc(client.db,'codes',ch), {acct:member.acct});
      if(d && d.codeHash && d.codeHash!==ch){ try{ await client.deleteDoc(client.doc(client.db,'codes',d.codeHash)); }catch(_){} }
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
      var existing=await client.getDoc(client.doc(client.db,'recovery',rh));
      if(existing.exists() && existing.data().acct!==member.acct){ text('その質問と回答の組み合わせは、すでに使われています。質問か回答を少し変えてください。'); return; }
      if(d && d.recoveryHash && d.recoveryHash!==rh){ try{ await client.deleteDoc(client.doc(client.db,'recovery',d.recoveryHash)); }catch(_){} }
      await client.setDoc(client.doc(client.db,'recovery',rh), {acct:member.acct});
      await memberSetMeta(member.acct, {recoveryHash:rh});
      $('kg-qa-a').value='';
      text('質問と回答を保存しました。コードを失くしても、この質問と回答でログインできます。');
    } catch(e){ text('保存できませんでした（'+((e&&e.code)||'エラー')+'）。'); }
  };
  $('kg-code-logout').onclick=function(){
    if(!member)return;
    if(!confirm('ログアウトすると、この端末内の推し・お気に入りを消去します。コード、または質問と回答を控えていない場合、データに戻れなくなります。よろしいですか？'))return;
    localStorage.removeItem('kg_member_session_v2'); localStorage.removeItem('kg_member_selected_v2'); localStorage.removeItem('kg_member_code_v1'); localStorage.removeItem('kg_member_selected_v1');
    member=null; memberReady=false; pendingMemberCloud=null; renderMember(); renderState();
    bridge.replace({event:[],artist:[]});
    text('ログアウトしました。');
  };
  /* 状態表記（Kota、2026-11-23）：ログイン中かどうかをヘッダーのボタン自体に表示する。
     ゲスト利用は一時的な端末向け（端末内だけに保存し、終了時に消せる）。 */
  var GUEST_FLAG='kg_guest_mode_v1';
  function guestOn(){ try{ return localStorage.getItem(GUEST_FLAG)==='1'; }catch(_){ return false; } }
  function stateLabel(){
    if(adminOn()) return '管理者モード';
    if(user) return 'ログイン中（同期ON）';
    if(member) return 'ログイン中（会員コード）';
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
  $('kg-guest-end').onclick=function(){
    if(!confirm('ゲスト利用を終了します。この端末内の推し・お気に入りと好みの設定を消去します。よろしいですか？')) return;
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
  function renderAdmin(){ var on=adminOn(); var offEl=$('kg-admin-off'), onEl=$('kg-admin-on'); if(offEl) offEl.hidden=on; if(onEl) onEl.hidden=!on; if(on && !user && !member) text('管理者モード（この端末）。ログインは不要です。'); renderState(); }
  $('kg-admin-enable').onclick=async function(){
    var existing=null; try{ existing=localStorage.getItem(ADMIN_HASH); }catch(_){}
    var p1=prompt(existing ? '管理者パスフレーズを入力してください。' : '管理者パスフレーズを決めて入力してください（この端末の管理者モード用）。');
    if(!p1) return;
    var h=await sha256hex('kg-admin:'+p1);
    if(existing){ if(h!==existing){ text('パスフレーズが違います。'); return; } }
    else {
      var p2=prompt('確認のため、もう一度入力してください。');
      if(p2!==p1){ text('パスフレーズが一致しませんでした。'); return; }
      try{ localStorage.setItem(ADMIN_HASH, h); }catch(_){}
    }
    try{ localStorage.setItem(ADMIN_FLAG, '1'); }catch(_){}
    renderAdmin();
    text('管理者モードを有効にしました。この端末ではログイン不要です。');
  };
  $('kg-admin-disable').onclick=async function(){
    var p=prompt('管理者パスフレーズを入力してください。');
    if(p===null) return;
    var h=await sha256hex('kg-admin:'+p);
    var existing=null; try{ existing=localStorage.getItem(ADMIN_HASH); }catch(_){}
    if(h!==existing){ text('パスフレーズが違います。'); return; }
    try{ localStorage.removeItem(ADMIN_FLAG); }catch(_){}
    renderAdmin();
    text('管理者モードを解除しました。');
  };
  $('kg-google-login').onclick=async function(){
    if(!client)return;
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
      var app=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
      var auth=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js');
      var db=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
      var instance=app.initializeApp(cfg);
      client=Object.assign({},db,auth,{auth:auth.getAuth(instance),db:db.getFirestore(instance)});
      auth.onAuthStateChanged(client.auth,function(u){setupSession(u ? {user:{id:u.uid,email:u.email}} : null);});
      if(auth.getRedirectResult){ auth.getRedirectResult(client.auth).catch(function(err){ text('ログインできませんでした（'+((err&&err.code)||'不明なエラー')+'）。もう一度お試しください。'); }); }
      $('kg-member').hidden=false;
      try{ localStorage.removeItem('kg_member_code_v1'); localStorage.removeItem('kg_member_selected_v1'); }catch(_){}
      var savedSession=null; try{ savedSession=JSON.parse(localStorage.getItem('kg_member_session_v2')||'null'); }catch(_){}
      if(savedSession && savedSession.acct){ activateMember(savedSession.acct, savedSession.code||null, true).catch(function(){ /* 復元できない場合は未ログインのまま */ }); }
      renderAdmin();
    } catch(e){parts(true,false,false,false);text('ログイン機能を読み込めません。通信と設定をご確認ください。');}
  })();
})();
