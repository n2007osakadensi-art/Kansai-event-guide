# 統合版サイト仕様（2026-11-23、Kota指示：スペース版を正本に食い違い・検索不具合を修正、PWA対応）

## 目的
3系統に分かれた静的サイトを1本に統合し、スペース版ガイドの検索挙動・閲覧機能に合わせる。
成果物: `~/workspace/guide-unified/`（編集可能な静的サイト一式）＋ `~/workspace/guide-unified-import.zip`
＋ 結果ファイル `~/workspace/guide-unified/RESULTS.md`（項目ごとに 済／未検証 を証跡付きで記録。最終報告は短く）。

## 素材（すべて取得・検証済み）
- ベース: `~/workspace/csb-4sypf8-editable/`（4sypf8ライブ版。最新 2026-11-23 08:10表示・8,023件。
  firebase系統＝account.js付き、PWA最小版。index.html は注入除去済み、raw/ に原文）
- vxライブ版: `~/workspace/vx9d37-live/`（= site_muse と実質同一を確認済み。ログイン・PWAなし）
- 基本版/Firebase版: `~/workspace/csb-packages-20261123/handoff-upload/site_muse/` `site_firebase_prepared/`
- PWA統合更新パッケージ（未公開）: `~/workspace/csb-packages-20261123/vx9d37-update/`
  （device-transfer.js、pwa-ui.js 5,364B、pwa-worker.js 4,116B＝シェルキャッシュ、icons/、app.webmanifest 705B、
   絞り込み条件の保存、バックアップ/復元）
- assets 4件は全系統で SHA256 完全一致。どれか1系統のものをそのまま使う。
- データ読込: 全系統共通でシート gviz（id 1oUuy1PvoQgNa5f1HoXqMHgLUfdPW_ctVNxyHih0cNbw、sheet=events、
  開くたび取得）。この接続先は変更しない。

## 手順1: 食い違い棚卸し（RESULTS.md に表で記録）
3つの index（4sypf8 / site_muse / vx更新版）について、閲覧者向け機能の有無を比較する:
タブ構成（イベント／クリスマス特集／カレンダー／アーティスト／会場DB／お気に入り／推し／回しプラン／好み）、
検索、絞り込み項目、詳細表示、サイネージ、おすすめ、好みオンボーディング、ログイン、PWA、データ引っ越し。
ベース（4sypf8）に無い閲覧機能が他系統にあれば統合版へ取り込む。管理者向け機能は対象外（下記）。

## 手順2: 統合版の構築（ベース=4sypf8ライブ版）
- account.js / account-config.js は維持（Firebase設定は空のまま。実接続はしない）。
- PWA: vx更新版の app.webmanifest・icons/・pwa-worker.js・pwa-ui.js を取り込む。
  ただし manifest の theme_color・name 等はベース側の現在値（theme-color #b92b37 系）に合わせ、
  worker のキャッシュ対象には統合版の全ファイル（account.js、device-transfer.js を含む）を入れる。
  ベース側の最小 pwa-ui.js / pwa-worker.js（359B）は置き換える。
- device-transfer.js（お気に入り等のバックアップ/復元・データ引っ越し）も取り込む。
  account.js の端末内保存と競合しないよう、保存キー（localStorage）を突き合わせてから接続する。
- 絞り込み条件の保存・呼び出し（vx更新版）を取り込む。
- 見た目・レイアウトはベースを大きく変えない。既存機能を壊さない。

## 手順3: 検索の食い違い修正（スペース版ガイドの確定ルールに合わせる）
次はすべてガイド側で確定済みの挙動。csb側コードを点検し、違えば直す。直した箇所は RESULTS.md に証跡（関数名・行）を残す:
1. 検索は入力した文字どおり。入力の自動変換・自動置換・自動分割・自動条件付けをしない。
2. サジェストでイベントを選んだら、そのイベントだけが返る。
3. 簡易検索（検索側の寛容さ）: タイトル中の年号・副題を落としても一致する照合は検索機能として持つ。
   ただし登録タイトル自体は公式名そのまま（データ側は触らない）。
4. 話数・回数検索（vol.○ 等）で公式番号が無い場合は「ガイド集計」と分かる扱いにする。
5. 日付がずれる候補には日付違いの示唆を出す（ガイドの date-mismatch suggestions 相当）。
6. 読み検索: KOBerrieS♪＝「コウベリーズ」等の読み辞書（assets/readings.json）を使う検索が効くこと。
7. チケットURL貼り付け検索（ベースにある既存機能）を壊さない。
※ スペース版ガイド本体は artifact slug `guan-xi-ibentopuratutohuomu-que-ren-yong`（関西イベントガイド）と
  試作Space `guan-xi-ibentogaido-sito-notionshi-zuo`。挙動の裏取りが必要な項目は artifact の
  inspect/アクションで確認してよいが、ガイド本体のデータは変更しない。

## 対象外
- ガイドの管理者向け機能（データ分析、空き状況ボード、ブッキング候補、出演条件、回せる現場、
  会話検索の管理側など）は公開版へ移植しない。
- シート・ガイド本体・Notion のデータ変更は一切しない。公開先への反映もしない（成果物はファイルまで）。

## 検証（RESULTS.md に記録）
- 全ファイルのローカル配信テスト（python http.server）で 200、タイトル一致。
- JS 全ファイル構文チェック（node --check）、JSON 全件パース。
- PWA: manifest のアイコン参照先が実在、worker 登録パスが一致、キャッシュ対象リストと実ファイルの一致。
- 検索チェック項目 1〜7 のコード上の裏取り（該当関数・行）。
- 実機・PWAインストール・オフライン動作は 未検証 と明記する（ここでは断定しない）。

## 完了報告
短く: 統合した機能数、検索修正件数、zip パス、未検証項目。詳細は RESULTS.md。
