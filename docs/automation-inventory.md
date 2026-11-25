# 自動化とデータ所在の一覧

関西イベントガイドを回している自動化（定期ジョブ・クローラー・スクリプト）と、データ・状態ファイルの所在の一覧です。
これらは Muse 側の環境（ワークスペースとスペース）で動いています。後任が別の Muse の場合はこのまま引き継がれ、外部AIの場合は `HANDOVER.md` の「引き継ぎの範囲」の分担になります。

## 定期ジョブ（ガイド関連、2026-11-25 時点で有効なもの）

| ジョブ | 頻度 | 役割 |
|---|---|---|
| kansai-upcoming-events-daily | 毎日06:00 | 朝チェック（当日分の徹底確認） |
| kansai-upcoming-events-nightly | 毎日23:00 | 夜チェック（翌日・週末祝日・先の予定）。外部AI入力タブの処理のバックストップを含む |
| image-url-health-daily | 毎日06:40頃 | 画像URLの死活チェックと自動修復 |
| crawler-queued-listing-by-5am | 毎日04:00 | 掲載待ち候補を朝05:00までに掲載処理 |
| crawler-auto-cycle-6h | 6時間ごと | クローラーの自動サイクル |
| crawler-console-diff-check | 6時間ごと | クローラー管理コンソールの差分チェック |
| crawler-queue-processor-5m | 5分ごと | クローラー実行キューの処理 |
| kansai-instagram-saved-intake | 6時間ごと | Instagram保存済み投稿の取り込み |
| kansai-events-friday-weekend | 金曜21:17 | 週末分の徹底確認 |
| kansai-events-month-end | 月末21:17 | 翌月スケジュールの徹底調査 |
| kansai-weekly-quota-burndown | 日曜13:00 | 週次: 残り枠で調査・詳細の底上げ・仕組み改善 |
| kansai-public-mirror-sync | 1分ごと（要求時のみ実働） | 公開ミラーの同期（再生成・再ビルド） |

## チケットサイトのクローラー

- 所在: Muse 側ワークスペース `~/workspace/goals/kansai-live-event-research-and-listing/hidden_files/ticket-crawler/`（本体 crawler.py、状態は state/、候補は out/candidates.json。再開可能なカーソル方式）
- 確立済みの経路: TIGET は一覧ページがサーバ描画（1ページ24件、府県つき）で、詳細ページに公演の構造化データ（開始日時・会場・住所・画像・説明）が埋め込まれている。その構造化データには制御文字が混ざるため、厳密モードなしで読むこと。LivePocket はサイトマップ全体が公開されており、詳細ページはサーバ描画。TicketDive はサイトマップに公演が無く、検索経由のみで完全性は保証されない
- 作法: 礼儀正しい間隔（約1.2秒）で回し、403／429 が出たら止める。列挙はコードで行い、AIの判断は候補の裏取りと登録だけに使う

## スクリプトと状態ファイル

- シート同期: `write_sheets.py`（所在は統合フォルダ `~/workspace/goals/kansai-live-event-research-and-listing/hidden_files/integration-2026-11-17/`）。注意点: シートのグリッド行数上限を超えると書き込みが失敗する（各タブ7,500行へ拡張済み。近づいたら先に拡張）。件数が減った回は末尾に古い行が残るため、行数を確認して余剰を消す
- 画像の公開URL化の記録: `image_migration_state.json`（同統合フォルダ）。公開URLの正本はこちらで、シート同期が各面へ運ぶ
- 画像移行のドリップ実行: `migrate_past_drip.py`（所在 `~/workspace/goals/goal/hidden_files/image-github-route/`）。逐次・15秒間隔、制限時は600秒休んで自動続行、休止は最大6回まで。AIトークンを使わない
- 画像の保険表の生成: `build_fallbacks.py`（同フォルダ）。最新の本体スナップショットから再生成する
- 画像URLの死活チェック: `check_image_urls.py`（同フォルダ）。結果は日次ログに残る
- 本体のスナップショット: bootstrap-YYYY-MM-DD-HHMM.json（統合フォルダ）。登録・更新・保険表生成の土台

## サイト側の作業コピーと公開手順

- ローカルの作業コピーは2つ: `~/workspace/guide-repo/`（push の元）と `~/workspace/guide-unified/`（控え）。公開する変更は両方へ同じ内容を置く
- 公開は GitHub への push（main ブランチ）。push の制約: 1回あたり合計4MBまで、UTF-8テキストのみ、対象ファイルの一覧を区切り文字つきで渡す方式。タイムアウトした push は「実行されなかった」ものとして扱い、勝手に再試行しない
- 公開後の確認: GitHub Pages のキャッシュで最大10分ほど旧版が見える。フッターの版数表示で新しい版を確認してから動作を見る

## スペース（Muse 側の面）

- スペース版ガイド（本体）: イベントデータの正本。登録・修正はここの操作で行う（手順は `docs/registration-procedure.md`）
- 公開ミラー: 本体の公開版スナップショット。再共有しないと公開リンクへ反映されない
- 調査クローラー管理コンソール: チェック対象（アカウント・サイト）の登録と実行管理をする専用スペース。対象の追加・編集はここで行う
