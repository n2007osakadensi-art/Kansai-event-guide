/*
 * 関西イベントガイド：ブラウザをまたぐ手動データ移行
 *
 * お気に入り等は同一サイトURL・同一ブラウザにlocalStorageで自動保存。
 * ブラウザを変える場合だけJSONファイルへ書き出し、移行先で読み込む方式です。
 * アカウント情報・パスワード・Cookie・同期セッションは書き出しません。
 */
(function(){
  'use strict';

  var KEYS={
    favorites:'kg_trial_fav_events_v1',
    want:'kg_trial_want_events_v1',
    interest:'kg_trial_interest_events_v1',
    lists:'kg_trial_lists_v1',
    performers:'kg_trial_fav_performers_v1',
    profiles:'kg_filter_profiles_v1',
    preferences:'kg_trial_prefs_v1',
    learned:'kg_trial_learn_v1',
    showEnded:'kg_trial_show_ended'
  };
  var FORMAT='kansai-event-guide-local-backup';
  var VERSION=1;
  var MAX_FILE_BYTES=2*1024*1024;
  var DEFAULT_PREFS={onboarded:false,cats:[],artists:[],prefs:[],areas:[],free:false,weekend:false,collab:false,dismissed:[]};
  var DEFAULT_LEARNED={cats:{},artists:{},areas:{}};

  // 通常のlocalStorage保存は常時使用。対応ブラウザでは、容量逼迫時の
  // 自動消去を避ける永続化もユーザー操作なしでベストエフォート要求する。
  try{
    var storage=navigator.storage;
    if(storage&&typeof storage.persist==='function'){
      Promise.resolve(typeof storage.persisted==='function'?storage.persisted():false)
        .then(function(persisted){if(!persisted)return storage.persist();})
        .catch(function(){});
    }
  }catch(ignore){}

  function deepClone(value){ return JSON.parse(JSON.stringify(value)); }
  function parseStored(key,fallback){
    var raw=localStorage.getItem(key);
    return raw===null ? deepClone(fallback) : JSON.parse(raw);
  }
  function stringArray(value,label,maxCount){
    if(value==null) return [];
    if(!Array.isArray(value)) throw new Error(label+'の形式が正しくありません。');
    if(value.length>maxCount) throw new Error(label+'の件数が上限を超えています。');
    var out=[],seen=new Set();
    value.forEach(function(v){
      if(typeof v!=='string' || v.length>300) throw new Error(label+'に読み取れない項目があります。');
      if(!seen.has(v)){ seen.add(v); out.push(v); }
    });
    return out;
  }
  function safePrefs(value){
    value=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    var out={};
    ['cats','artists','prefs','areas','dismissed'].forEach(function(k){out[k]=stringArray(value[k]||[], '好みの'+k, 5000);});
    ['onboarded','free','weekend','collab'].forEach(function(k){out[k]=!!value[k];});
    return out;
  }
  function safeMap(value,label){
    if(value==null) return {};
    if(typeof value!=='object'||Array.isArray(value)) throw new Error(label+'の形式が正しくありません。');
    var out=Object.create(null),keys=Object.keys(value);
    if(keys.length>5000) throw new Error(label+'の件数が上限を超えています。');
    keys.forEach(function(k){
      var n=Number(value[k]);
      if(k==='__proto__'||k==='constructor'||k==='prototype'||k.length>300||!Number.isFinite(n)||n<0) return;
      out[k]=Math.min(30,n);
    });
    return out;
  }
  function safeLearned(value){
    value=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    return {cats:safeMap(value.cats,'学習データ'),artists:safeMap(value.artists,'学習データ'),areas:safeMap(value.areas,'学習データ')};
  }
  function safeProfiles(value){
    if(value==null) return [];
    if(!Array.isArray(value)||value.length>30) throw new Error('保存した絞り込み条件の形式または件数が上限を超えています。');
    var out=[],seen=new Set();
    value.forEach(function(row){
      if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.name!=='string'||!row.name.trim()||row.name.length>60||!row.state||typeof row.state!=='object'||Array.isArray(row.state)){
        throw new Error('保存した絞り込み条件に読み取れない項目があります。');
      }
      var name=row.name.trim();
      if(seen.has(name)) throw new Error('同じ名前の絞り込み条件が重複しています。');
      seen.add(name);
      out.push({name:name,version:Number.isFinite(Number(row.version))?Number(row.version):1,state:deepClone(row.state)});
    });
    return out;
  }
  function safeLists(value){
    if(value==null) return [];
    if(!Array.isArray(value)||value.length>200) throw new Error('マイリストの形式または件数が上限を超えています。');
    var out=[],seen=new Set();
    value.forEach(function(row){
      if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id||row.id.length>100||typeof row.name!=='string'||!row.name.trim()||row.name.length>60){
        throw new Error('マイリストに読み取れない項目があります。');
      }
      if(seen.has(row.id)) throw new Error('マイリストのIDが重複しています。');
      seen.add(row.id);
      out.push({id:row.id,name:row.name.trim(),events:stringArray(row.events||[],'マイリストのイベント',50000),artists:stringArray(row.artists||[],'マイリストの推し',5000),createdAt:Number.isFinite(Number(row.createdAt))?Number(row.createdAt):0});
    });
    return out;
  }
  function readCurrent(){
    var eventIds=parseStored(KEYS.favorites,[]),performers=parseStored(KEYS.performers,[]);
    var profiles=parseStored(KEYS.profiles,[]),preferences=parseStored(KEYS.preferences,DEFAULT_PREFS);
    var learned=parseStored(KEYS.learned,DEFAULT_LEARNED);
    return {
      favorites:stringArray(eventIds,'お気に入り',50000),
      want:stringArray(parseStored(KEYS.want,[]),'行きたい',50000),
      interest:stringArray(parseStored(KEYS.interest,[]),'気になる',50000),
      lists:safeLists(parseStored(KEYS.lists,[])),
      performers:stringArray(performers,'推し',50000),
      filterProfiles:safeProfiles(profiles),
      preferences:safePrefs(preferences),
      learned:safeLearned(learned),
      showEnded:localStorage.getItem(KEYS.showEnded)==='1'
    };
  }
  function normalizeBackup(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.format!==FORMAT||value.version!==VERSION||!value.data||typeof value.data!=='object'||Array.isArray(value.data)){
      throw new Error('このアプリのバックアップファイルではないか、対応していない形式です。');
    }
    var d=value.data;
    ['favorites','performers','filterProfiles','preferences','learned','showEnded'].forEach(function(k){
      if(!Object.prototype.hasOwnProperty.call(d,k)) throw new Error('バックアップに必要な項目がありません（'+k+'）。');
    });
    if(typeof d.showEnded!=='boolean') throw new Error('終了イベント表示の設定が正しくありません。');
    return {
      favorites:stringArray(d.favorites,'お気に入り',50000),
      want:Array.isArray(d.want)?stringArray(d.want,'行きたい',50000):[],
      interest:Array.isArray(d.interest)?stringArray(d.interest,'気になる',50000):[],
      lists:Array.isArray(d.lists)?safeLists(d.lists):[],
      performers:stringArray(d.performers,'推し',50000),
      filterProfiles:safeProfiles(d.filterProfiles),
      preferences:safePrefs(d.preferences),
      learned:safeLearned(d.learned),
      showEnded:d.showEnded
    };
  }
  function union(a,b){
    var seen=new Set(a),out=a.slice();
    b.forEach(function(v){if(!seen.has(v)){seen.add(v);out.push(v);}});
    return out;
  }
  function mergeProfiles(a,b){
    var out=a.map(function(x){return deepClone(x);});
    b.forEach(function(row){
      var i=out.findIndex(function(x){return x.name===row.name;});
      if(i>=0) out[i]=deepClone(row); else out.push(deepClone(row));
    });
    if(out.length>30) throw new Error('統合後の保存条件が30件を超えます。不要な条件を削除するか、「置き換える」を選んでください。');
    return out;
  }
  function mergePrefs(a,b){
    var out={};
    ['cats','artists','prefs','areas','dismissed'].forEach(function(k){out[k]=union(a[k]||[],b[k]||[]);});
    ['onboarded','free','weekend','collab'].forEach(function(k){out[k]=!!(a[k]||b[k]);});
    return out;
  }
  function mergeLearned(a,b){
    var out={};
    ['cats','artists','areas'].forEach(function(k){
      out[k]=Object.create(null);
      Object.keys(a[k]||{}).forEach(function(name){if(name!=='__proto__'&&name!=='constructor'&&name!=='prototype')out[k][name]=Number(a[k][name])||0;});
      Object.keys(b[k]||{}).forEach(function(name){if(name!=='__proto__'&&name!=='constructor'&&name!=='prototype')out[k][name]=Math.max(Number(out[k][name])||0,Number(b[k][name])||0);});
    });
    return out;
  }
  function mergeLists(a,b){
    var out=(a||[]).map(function(x){return deepClone(x);});
    (b||[]).forEach(function(row){
      var i=out.findIndex(function(x){return x.id===row.id;});
      if(i>=0){ out[i].events=union(out[i].events,row.events); out[i].artists=union(out[i].artists,row.artists); out[i].name=row.name; }
      else out.push(deepClone(row));
    });
    if(out.length>200) throw new Error('統合後のマイリストが200件を超えます。不要なリストを削除するか、「置き換える」を選んでください。');
    return out;
  }
  function mergeData(a,b){
    return {
      favorites:union(a.favorites,b.favorites),
      want:union(a.want||[],b.want||[]),
      interest:union(a.interest||[],b.interest||[]),
      lists:mergeLists(a.lists,b.lists),
      performers:union(a.performers,b.performers),
      filterProfiles:mergeProfiles(a.filterProfiles,b.filterProfiles),
      preferences:mergePrefs(a.preferences,b.preferences),
      learned:mergeLearned(a.learned,b.learned),
      showEnded:a.showEnded||b.showEnded
    };
  }
  function summary(d){
    return 'お気に入り '+d.favorites.length+'件・推し '+d.performers.length+'件・保存条件 '+d.filterProfiles.length+'件';
  }
  function countSummary(d){
    return 'お気に入り '+d.favorites.length+'件、行きたい '+(d.want||[]).length+'件、気になる '+(d.interest||[]).length+'件、マイリスト '+(d.lists||[]).length+'件、推し '+d.performers.length+'件、保存した絞り込み '+d.filterProfiles.length+'件、好み設定 '+(d.preferences.onboarded?'あり':'なし');
  }
  function writeData(d){
    var values={};
    values[KEYS.favorites]=JSON.stringify(d.favorites);
    values[KEYS.want]=JSON.stringify(d.want||[]);
    values[KEYS.interest]=JSON.stringify(d.interest||[]);
    values[KEYS.lists]=JSON.stringify(d.lists||[]);
    values[KEYS.performers]=JSON.stringify(d.performers);
    values[KEYS.profiles]=JSON.stringify(d.filterProfiles);
    values[KEYS.preferences]=JSON.stringify(d.preferences);
    values[KEYS.learned]=JSON.stringify(d.learned);
    values[KEYS.showEnded]=d.showEnded?'1':'0';
    var before={};
    Object.keys(values).forEach(function(k){before[k]=localStorage.getItem(k);});
    try{
      Object.keys(values).forEach(function(k){localStorage.setItem(k,values[k]);});
    }catch(e){
      Object.keys(before).forEach(function(k){
        try{if(before[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,before[k]);}catch(ignore){}
      });
      throw new Error('ブラウザの保存容量が足りず、データを変更できませんでした。元のデータは可能な範囲で戻しました。');
    }
    // ログイン中の同期試作が開いている場合は、変更差分を同期キューへ渡す。
    var bridge=window.KGAccountBridge;
    if(bridge&&bridge.keys&&typeof bridge.read==='function'){
      var previous=bridge.read();
      window.dispatchEvent(new CustomEvent('kg:favorites-change',{detail:{key:bridge.keys.event,before:previous.event||[],after:d.favorites}}));
      window.dispatchEvent(new CustomEvent('kg:favorites-change',{detail:{key:bridge.keys.artist,before:previous.artist||[],after:d.performers}}));
      window.dispatchEvent(new CustomEvent('kg:profiles-change',{detail:d.filterProfiles}));
      window.dispatchEvent(new Event('kg:profiles-refresh'));
    }
  }
  function dateStamp(){return new Date().toISOString().slice(0,10);}
  function makeBackup(){
    return {format:FORMAT,version:VERSION,createdAt:new Date().toISOString(),data:readCurrent()};
  }
  function downloadBackup(backup){
    var json=JSON.stringify(backup,null,2);
    if(new Blob([json]).size>MAX_FILE_BYTES) throw new Error('バックアップが2MBを超えるため保存できません。不要な保存条件を減らしてください。');
    var file=new File([json],'kansai-event-guide-backup-'+dateStamp()+'.json',{type:'application/json'});
    if(navigator.share&&navigator.canShare){
      try{
        if(navigator.canShare({files:[file]})){
          navigator.share({files:[file],title:'関西イベントガイドのバックアップ',text:'端末データの引っ越し用ファイルです。'}).then(function(){setStatus('共有メニューから「ファイルに保存」などを選んでください。');}).catch(function(e){if(e&&e.name!=='AbortError')downloadFile(file);});
          return;
        }
      }catch(e){}
    }
    downloadFile(file);
  }
  function downloadFile(file){
    var url=URL.createObjectURL(file),a=document.createElement('a');
    a.href=url;a.download=file.name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},30000);
    setStatus('バックアップを保存しました。移行先のブラウザで同じファイルを読み込んでください。');
  }
  function readFile(file){
    return new Promise(function(resolve,reject){
      if(file.size>MAX_FILE_BYTES){reject(new Error('バックアップファイルが大きすぎます（上限2MB）。'));return;}
      if(typeof file.text==='function'){file.text().then(resolve,reject);return;}
      var r=new FileReader();r.onload=function(){resolve(String(r.result||''));};r.onerror=function(){reject(new Error('ファイルを読み込めませんでした。'));};r.readAsText(file);
    });
  }

  var trigger=document.createElement('button');
  trigger.type='button';trigger.id='kg-device-transfer-open';trigger.textContent='データ引っ越し';
  trigger.setAttribute('aria-label','お気に入りなどの端末データをバックアップ・移行');
  trigger.style.cssText='border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:4px 12px;min-height:40px;cursor:pointer';
  var anchor=document.getElementById('kg-account-open');
  if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(trigger,anchor.nextSibling);
  else{var meta=document.querySelector('.meta-line');if(meta)meta.appendChild(trigger);else document.body.prepend(trigger);}

  var dialog=document.createElement('dialog');
  dialog.id='kg-device-transfer-dialog';
  dialog.style.cssText='width:min(92vw,520px);max-height:90vh;overflow:auto;border:1px solid #aaa;border-radius:16px;padding:20px;background:Canvas;color:CanvasText;box-shadow:0 8px 30px #0005';
  dialog.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2 style="margin:0;font-size:20px">データ引っ越し</h2><button id="kg-device-transfer-close" type="button" aria-label="閉じる" style="min-width:44px">✕</button></div>'+
    '<p style="line-height:1.65">お気に入り・推し・好み・保存条件は同じサイトURL・同じブラウザに自動保存されます。通常はタブ切替、ページ再読込、アプリ終了、スマホ再起動後も残ります。対応ブラウザでは保存領域の保護も自動で要求します（許可されない場合もあります）。サイトデータ消去やプライベートモードは例外です。</p>'+
    '<p style="padding:10px 12px;border-radius:10px;background:rgba(180,30,40,.10);line-height:1.6"><strong>別のブラウザへ移すときだけ、以下のバックアップを使ってください。</strong>ブラウザ間で保存領域は共有されないため、旧ブラウザで保存し、新ブラウザで読み込みます。</p>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button id="kg-device-export" type="button" style="min-height:44px;padding:8px 14px;border:0;border-radius:9px;background:#b92b37;color:#fff;font-weight:700">バックアップを保存</button><button id="kg-device-import" type="button" style="min-height:44px;padding:8px 14px;border:1px solid #888;border-radius:9px;background:transparent;color:inherit;font-weight:700">バックアップを読み込む</button><button id="kg-device-itinerary" type="button" style="min-height:44px;padding:8px 14px;border:1px solid #888;border-radius:9px;background:transparent;color:inherit;font-weight:700">行程表テキストを書き出す</button></div>'+
    '<p style="margin:10px 0 0;font-size:12.5px;line-height:1.6;opacity:.85">行程表テキストは、お気に入りのイベントを日付順に文章化したものです。GPTやGeminiなどのAIに渡すと、旅のしおりの下書き作りなどに使えます。</p>'+
    '<input id="kg-device-file" type="file" accept=".json,application/json" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none">'+
    '<div id="kg-device-preview" hidden style="margin-top:14px;padding:12px;border:1px solid #aaa;border-radius:10px"><p id="kg-device-file-summary" style="margin:0 0 10px"></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button id="kg-device-merge" type="button" style="min-height:42px;padding:7px 12px;border:1px solid #888;border-radius:8px;background:transparent;color:inherit">追加・統合</button><button id="kg-device-replace" type="button" style="min-height:42px;padding:7px 12px;border:1px solid #b92b37;border-radius:8px;background:#b92b37;color:#fff">置き換える</button><button id="kg-device-cancel" type="button" style="min-height:42px;padding:7px 12px;border:0;border-radius:8px;background:transparent;color:inherit">キャンセル</button></div><p style="margin:8px 0 0;font-size:12.5px;opacity:.8">「追加・統合」はお気に入りを追加し、同名の保存条件はファイル側で上書きします。</p></div>'+
    '<p id="kg-device-status" role="status" aria-live="polite" style="min-height:1.5em;margin:12px 0 6px;font-weight:600"></p>'+
    '<hr style="border:0;border-top:1px solid #aaa;opacity:.45;margin:12px 0">'+
    '<p style="margin:0;font-size:12.5px;line-height:1.6;opacity:.85">ファイルにはアカウントID・パスワード・ログイン状態は入りません。JSON形式で内容を読めるため、保存先や共有先にご注意ください。回しプランはお気に入りから再生成します。端末内データはブラウザやサイトURLごとに分かれます。</p>';
  document.body.appendChild(dialog);
  var statusEl=dialog.querySelector('#kg-device-status'),fileEl=dialog.querySelector('#kg-device-file');
  var pending=null;
  function setStatus(text){statusEl.textContent=text;}
  function resetPreview(){pending=null;dialog.querySelector('#kg-device-preview').hidden=true;dialog.querySelector('#kg-device-file-summary').textContent='';}
  function open(){if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}setStatus('');resetPreview();}
  function close(){if(dialog.close)dialog.close();else dialog.removeAttribute('open');}
  trigger.addEventListener('click',open);
  dialog.querySelector('#kg-device-transfer-close').addEventListener('click',close);
  dialog.addEventListener('click',function(e){if(e.target===dialog)close();});
  dialog.querySelector('#kg-device-export').addEventListener('click',function(){
    try{
      var backup=makeBackup();
      downloadBackup(backup);
      setStatus('バックアップの保存を開始しました。内容：'+summary(backup.data));
    }catch(e){setStatus(e.message||'現在のデータを読み取れませんでした。');}
  });
  function buildItinerary(){
    var ids=parseStored(KEYS.favorites,[]);
    var byId={};(window.allEvents||[]).forEach(function(ev){byId[String(ev.id)]=ev;});
    var list=ids.map(function(id){return byId[String(id)];}).filter(Boolean);
    list.sort(function(a,b){var d=String(a.date).localeCompare(String(b.date));if(d)return d;return (a.startMin||9999)-(b.startMin||9999);});
    var wdays=['日','月','火','水','木','金','土'];
    var out=['# 関西イベントガイド お気に入り行程表',''];
    var cur='';
    list.forEach(function(ev){
      if(ev.date!==cur){cur=ev.date;var dt=new Date(cur+'T00:00:00');out.push('## '+cur+'（'+wdays[dt.getDay()]+'）','');}
      var line='- ';
      if(ev.timeLabel)line+=ev.timeLabel+' ';
      line+='**'+(ev.title||'')+'**';
      var bits=[];
      if(ev.venue)bits.push('会場：'+ev.venue);
      if(ev._perfList&&ev._perfList.length)bits.push('出演：'+ev._perfList.join('、'));
      if(ev.price)bits.push('料金：'+ev.price);
      if(bits.length)line+='（'+bits.join('／')+'）';
      out.push(line);
      var links=[];
      if(ev.linkOfficial)links.push('公式：'+ev.linkOfficial);
      if(ev.linkTicket)links.push('チケット：'+ev.linkTicket);
      if(links.length)out.push('  '+links.join(' '));
    });
    if(!list.length)out.push('（お気に入りのイベントがありません）');
    out.push('','※関西イベントガイドのお気に入りから作成');
    return {text:out.join('\n'),count:list.length,total:ids.length};
  }
  dialog.querySelector('#kg-device-itinerary').addEventListener('click',function(){
    var r=buildItinerary();
    if(!r.count){setStatus(r.total?'イベント情報の読み込みが終わっていないため、行程表を作れませんでした。読み込み完了後にお試しください。':'お気に入りのイベントがありません。');return;}
    var file=new File([r.text],'kansai-event-guide-itinerary-'+dateStamp()+'.md',{type:'text/markdown'});
    downloadFile(file);
    setStatus('行程表テキストを保存しました（'+r.count+'件）。GPTやGeminiに渡すと、旅のしおりの下書きなどに使えます。');
  });
  dialog.querySelector('#kg-device-import').addEventListener('click',function(){fileEl.click();});
  fileEl.addEventListener('change',function(){
    var file=fileEl.files&&fileEl.files[0];fileEl.value='';if(!file)return;
    readFile(file).then(function(text){
      var parsed=normalizeBackup(JSON.parse(text));
      pending=parsed;
      dialog.querySelector('#kg-device-file-summary').textContent='読み込み内容：'+countSummary(parsed)+(parsed.createdAt?'（作成：'+String(parsed.createdAt).slice(0,10)+'）':'');
      dialog.querySelector('#kg-device-preview').hidden=false;
      setStatus('「追加・統合」か「置き換える」を選んでください。');
    }).catch(function(e){resetPreview();setStatus(e.message||'バックアップを読み込めませんでした。');});
  });
  dialog.querySelector('#kg-device-merge').addEventListener('click',function(){
    if(!pending)return;
    try{var next=mergeData(readCurrent(),pending);writeData(next);resetPreview();setStatus('取り込み完了：'+summary(next)+'。画面を更新します。');setTimeout(function(){location.reload();},700);}
    catch(e){setStatus(e.message||'統合できませんでした。');}
  });
  dialog.querySelector('#kg-device-replace').addEventListener('click',function(){
    if(!pending)return;
    if(!confirm('このブラウザの現在の端末データを、バックアップの内容に置き換えます。よろしいですか？'))return;
    try{var next=deepClone(pending);writeData(next);resetPreview();setStatus('置き換え完了：'+summary(next)+'。画面を更新します。');setTimeout(function(){location.reload();},700);}
    catch(e){setStatus(e.message||'取り込めませんでした。');}
  });
  dialog.querySelector('#kg-device-cancel').addEventListener('click',function(){resetPreview();setStatus('取り込みをキャンセルしました。');});
})();
