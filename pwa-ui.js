/* PWA install help and service-worker registration for the Kansai Event Guide. */
(function(){
  'use strict';

  var swStatus='このブラウザではオフライン用キャッシュを利用できません。';
  var secureContext=location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1';
  if('serviceWorker' in navigator&&secureContext){
    /* 更新を「開いている画面」にも届ける（2026-11-24）:
       新しい版が有効になったら一度だけ自動で読み直す。これが無いと、
       タブを開いたままの利用者には修正がいつまでも届かない。
       初回登録（まだ管理者がいない）では読み直さない。 */
    var hadController=!!navigator.serviceWorker.controller;
    var swReloadAt=0;
    try{ swReloadAt=parseInt(localStorage.getItem('kg_sw_reload_at')||'0',10)||0; }catch(e){}
    navigator.serviceWorker.addEventListener('controllerchange',function(){
      if(!hadController) return;
      if(Date.now()-swReloadAt<60000) return;
      try{ localStorage.setItem('kg_sw_reload_at',String(Date.now())); }catch(e){}
      location.reload();
    });
    navigator.serviceWorker.register('./pwa-worker.js',{scope:'./',updateViaCache:'none'})
      .then(function(reg){
        swStatus='オフライン用の画面キャッシュを準備しました。';
        if(reg&&reg.update) reg.update().catch(function(){});
        /* 開きっぱなしのタブでも新版を取りに行く: 30分ごと＋画面に戻ったとき */
        setInterval(function(){ if(reg&&reg.update) reg.update().catch(function(){}); }, 30*60*1000);
        document.addEventListener('visibilitychange',function(){ if(!document.hidden&&reg&&reg.update) reg.update().catch(function(){}); });
        setStatus();
      })
      .catch(function(err){
        console.warn('PWAの登録に失敗しました:',err);
        swStatus='オフライン用キャッシュを登録できませんでした。HTTPSの公開URLで開いてください。';
        setStatus();
      });
  }

  var meta=document.querySelector('.meta-line');
  var trigger=document.createElement('button');
  trigger.type='button';
  trigger.id='kg-pwa-open';
  trigger.textContent='アプリ・オフライン';
  trigger.setAttribute('aria-label','ホーム画面への追加とオフライン利用について');
  trigger.style.cssText='border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:4px 12px;min-height:40px;cursor:pointer';
  if(meta) meta.appendChild(trigger);
  else document.body.prepend(trigger);

  var dialog=document.createElement('dialog');
  dialog.id='kg-pwa-dialog';
  dialog.setAttribute('aria-labelledby','kg-pwa-title');
  dialog.style.cssText='width:min(92vw,500px);max-height:88vh;overflow:auto;border:1px solid var(--line);border-radius:16px;padding:20px;background:var(--surface);color:var(--ink);box-shadow:0 8px 30px #0005';
  dialog.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px">'+
      '<h2 id="kg-pwa-title" style="font-size:20px;margin:0">アプリ・オフライン</h2>'+
      '<button type="button" id="kg-pwa-close" aria-label="閉じる" style="min-width:44px">✕</button>'+ 
    '</div>'+
    '<p style="line-height:1.7">ホーム画面に追加すると、関西イベントガイドをアプリのように起動できます。</p>'+
    '<p style="line-height:1.7"><strong>iPhone：</strong>Safariの共有メニューから「ホーム画面に追加」<br><strong>Android：</strong>ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」</p>'+
    '<button type="button" id="kg-pwa-install" hidden style="min-height:44px;padding:8px 14px;border:0;border-radius:9px;background:#c62828;color:#fff;font-weight:700">アプリをインストール</button>'+
    '<p id="kg-pwa-status" role="status" aria-live="polite" style="font-size:13px;line-height:1.6"></p>'+
    '<p style="font-size:13px;line-height:1.65">初回にオンラインで開いた後は、画面の基本部分をこのブラウザに保存し、通信が不安定なときにも開ける場合があります。保存済みイベントが表示できる場合もありますが、最新情報や外部リンク・画像の取得には通信が必要です。</p>'+
    '<p style="font-size:13px;line-height:1.65"><strong>プッシュ通知は未接続です。</strong>別のブラウザ・端末へ移すときは、会員コードでログインするとクラウド同期で引き継げます。手元のファイルで移す場合は「データ引っ越し」からバックアップしてください。</p>'+
    '<p style="font-size:12px;line-height:1.6;color:var(--muted)">PWAはこの端末でのオフライン利用を助ける機能です。公開サービスやURL自体の継続を保証するものではありません。</p>';
  document.body.appendChild(dialog);

  var status=dialog.querySelector('#kg-pwa-status');
  var installButton=dialog.querySelector('#kg-pwa-install');
  var deferredInstall=null;
  function setStatus(extra){status.textContent=extra?swStatus+' '+extra:swStatus;}
  setStatus();

  window.addEventListener('beforeinstallprompt',function(event){
    event.preventDefault();
    deferredInstall=event;
    installButton.hidden=false;
  });
  installButton.addEventListener('click',function(){
    if(!deferredInstall)return;
    deferredInstall.prompt();
    deferredInstall.userChoice.then(function(choice){
      if(choice&&choice.outcome==='accepted')setStatus('ホーム画面への追加を受け付けました。');
      else setStatus('ホーム画面への追加はキャンセルされました。');
      deferredInstall=null;
      installButton.hidden=true;
    }).catch(function(){deferredInstall=null;installButton.hidden=true;});
  });
  window.addEventListener('appinstalled',function(){
    deferredInstall=null;
    installButton.hidden=true;
    setStatus('ホーム画面への追加が完了しました。');
  });

  trigger.addEventListener('click',function(){
    if(dialog.showModal)dialog.showModal();
    else dialog.setAttribute('open','');
    setStatus();
  });
  dialog.querySelector('#kg-pwa-close').addEventListener('click',function(){
    if(dialog.close)dialog.close();
    else dialog.removeAttribute('open');
  });
  dialog.addEventListener('click',function(event){
    if(event.target===dialog){if(dialog.close)dialog.close();else dialog.removeAttribute('open');}
  });
})();
