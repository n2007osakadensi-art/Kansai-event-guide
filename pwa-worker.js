/*
 * PWA shell cache for the Kansai Event Guide.
 * It caches the application shell and same-origin assets only. Google Sheets,
 * external images, notifications, and cloud/account sync are not cached here.
 */
'use strict';

var CACHE_PREFIX='kg-event-guide-shell-';
var CACHE_NAME=CACHE_PREFIX+'v7';
var SHELL_FILES=[
  './index.html',
  './app.webmanifest',
  './pwa-ui.js',
  './device-transfer.js',
  './account-config.js',
  './account.js',
  './pwa-worker.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './assets/artists.json',
  './assets/dict.json',
  './assets/readings.json',
  './assets/venue-supp.json',
  './assets/venues.json'
];
var SCOPE_URL=new URL(self.registration.scope);
function absolute(path){return new URL(path,SCOPE_URL).href;}
function isAppApi(url){return url.origin===self.location.origin&&url.pathname.indexOf('/api/')===0;}
function isShellRequest(request,url){
  return request.mode==='navigate'||
    ['script','style','image','font','manifest'].indexOf(request.destination)>=0||
    url.pathname.indexOf('/assets/')>=0||
    url.pathname.endsWith('.webmanifest');
}
function cached(request,cache,isNavigation){
  return cache.match(request,{ignoreSearch:true}).then(function(found){
    if(found)return found;
    if(isNavigation){
      return cache.match(absolute('./index.html')).then(function(index){
        return index||cache.match(absolute('./'));
      });
    }
    return undefined;
  });
}

self.addEventListener('install',function(event){
  event.waitUntil((async function(){
    var cache=await caches.open(CACHE_NAME);
    await Promise.all(SHELL_FILES.map(async function(path){
      var url=absolute(path);
      try{
        var response=await fetch(new Request(url,{cache:'reload',credentials:'same-origin'}));
        if(response&&response.ok&&response.type==='basic')await cache.put(url,response.clone());
      }catch(ignore){
        /* Store every resource that is available; a single optional miss must not break install. */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',function(event){
  event.waitUntil((async function(){
    var names=await caches.keys();
    await Promise.all(names.map(function(name){
      return name.indexOf(CACHE_PREFIX)===0&&name!==CACHE_NAME?caches.delete(name):Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',function(event){
  var request=event.request;
  if(request.method!=='GET')return;
  var url=new URL(request.url);
  if(url.origin!==self.location.origin||isAppApi(url)||!isShellRequest(request,url))return;
  var isNavigation=request.mode==='navigate';
  event.respondWith((async function(){
    var cache=await caches.open(CACHE_NAME);
    try{
      /* 画面（ナビゲーション）はHTTPキャッシュを経由せず取り直す。
         GitHub Pagesの max-age=600 の間は古い画面が返り、更新が届かないため */
      var response=await fetch(isNavigation?new Request(request,{cache:'reload'}):request);
      if(response&&response.ok&&response.type==='basic'){
        try{
          await cache.put(request,response.clone());
          if(isNavigation)await cache.put(absolute('./index.html'),response.clone());
        }catch(ignore){}
        return response;
      }
      var fallback=await cached(request,cache,isNavigation);
      return fallback||response;
    }catch(error){
      var offline=await cached(request,cache,isNavigation);
      if(offline)return offline;
      if(isNavigation){
        return new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>オフライン</title><body style="font-family:system-ui,sans-serif;max-width:36em;margin:12vh auto;padding:1.2em;line-height:1.7"><h1>オフラインです</h1><p>このブラウザには、まだ表示用の画面が保存されていません。通信できる状態で関西イベントガイドを一度開いてから、もう一度お試しください。</p><p>最新のイベント情報、外部リンク、画像の取得には通信が必要です。</p></body></html>',{
          status:503,
          headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}
        });
      }
      return new Response('',{status:503,statusText:'Offline'});
    }
  })());
});
