# 関西イベントガイド（シート＋Notion試作）— サイト本体と運用の正本

このリポジトリは、関西イベントガイドの公開サイト本体（静的HTML一式）の正本です。
チャットやAI（Muse／Arenaなど）が変わっても、ここを起点に更新を引き継げます。

**引き継ぎの入口は `HANDOVER.md`**（全体像・イベント調査のルール・サイト更新の作法・現在の状態と残作業）。設計スペックは `docs/` に集約しています。担当するAI・人は、まず HANDOVER.md と OPERATIONS.md を読んでください。

- 所有者: n2007osakadensi-art（Kota本人）
- 公開URL（GitHub Pages）: https://n2007osakadensi-art.github.io/Kansai-event-guide/
  ※ リポジトリ名の大文字 K を含むこの表記が有効なURLです（小文字版は404）。
- 暫定URL（CodeSandbox、旧版）: https://vx9d37.csb.app/ ／ https://4sypf8.csb.app/
  ※ CodeSandbox版は匿名の暫定公開で、こことは自動同期しません。

## ファイル構成
- `index.html` — 本体全部入り（CSS＋HTML＋JS）。検索・絞り込み・詳細・カレンダー・
  アーティスト／会場DB・お気に入り・推し・回しプラン・好み・サイネージ等はほぼ全部ここ。
- `assets/venues.json` `assets/artists.json` `assets/readings.json` `assets/venue-supp.json`
  — 会場DB・アーティスト・読み・会場補足の静的スナップショット（ガイド側DBから生成）。
- `account-config.js` / `account.js` — ログイン／同期（Firebase準備版。設定は空＝未接続）。
- `pwa-ui.js` / `pwa-worker.js` / `app.webmanifest` / `icons/` — PWA一式。
- `device-transfer.js` — お気に入り等のバックアップ／復元（データ引っ越し）。
- `OPERATIONS.md` — 設計方針・イベント調査ルール・更新経路・変更履歴（引き継ぎ記録）。
- `RESULTS.md` — 統合版（2026-11-23）の構築・検証記録。

## データの流れ（イベントが公開表示されるまで）
1. イベント情報は Muse スペース版ガイドに登録するのが正本。
2. ガイドから公開シートへ同期され、`events` / `events_lite` / `events_details` タブが更新される。
   スプレッドシート: https://docs.google.com/spreadsheets/d/1oUuy1PvoQgNa5f1HoXqMHgLUfdPW_ctVNxyHih0cNbw/
3. このサイトは開くたびにシートの `events` を gviz で取得して表示する（コード変更なしで掲載が増える）。
4. 新規候補の入力先はシートの「外部AI入力」タブ。ここへの追記だけでは公開されません。
   一次情報で確認 → ガイド登録 → シート同期 → サイト表示確認、までが1セットです。
   「外部AI入力」から events への自動合流はありません。

## サイト本体を更新するとき
1. 作業前にこのリポジトリの最新版と `OPERATIONS.md` の変更履歴を確認する（別チャットの変更と衝突させない）。
2. `index.html` 等を編集する。データ接続先（シートID）と `assets/` の形式は変えない。
3. ローカルで表示確認してから commit する。GitHub Pages は commit 後に同じURLへ自動反映される。
4. 変更内容・日時・変更者・検証結果・公開反映の有無を `OPERATIONS.md` の変更履歴に追記する。

## CodeSandboxで復元したいとき
1. CodeSandbox で「Import from GitHub」から このリポジトリを取り込む（新しいURLになります）。
   または zip（guide-unified-import.zip 相当）を新規Sandboxへ読み込む。
2. 取り込んだら、イベント一覧・検索・絞り込み・シート読込を確認する。
3. URLが変わると、旧URLで保存された端末内のお気に入り等は引き継がれません。
   サイト内の「データ引っ越し」で書き出し／復元ができます。

## 注意
- パスワード・秘密鍵・API管理者キーは置かないでください（Firebaseの公開設定値は秘密鍵ではありませんが、現在は未設定です）。
- Firebaseログインは未接続・未検証です。完成扱いにしないでください。
