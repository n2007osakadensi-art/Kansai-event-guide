# 統合版サイト構築結果（2026-11-23）

仕様: `~/workspace/goals/goal/hidden_files/unified-site-spec-20261123.md`
成果物: `~/workspace/guide-unified/` 一式 ＋ `~/workspace/guide-unified-import.zip`（15ファイル、583,224 bytes）
ベース: `~/workspace/csb-4sypf8-editable/`（4sypf8ライブ版）。シート／ガイド本体／Notion のデータ変更なし。公開先への反映なし。

## 手順1: 食い違い棚卸し（3つの index の閲覧者向け機能）

タブ構成は3系統とも同一（data-view: all/artists/calendar/christmas/fav/oshi/plan/prefs/venues
＝イベント／アーティスト／カレンダー／クリスマス特集／お気に入り／推し／回しプラン／好み／会場DB）。

| 機能 | 4sypf8（ベース） | site_muse | vx更新版 | 統合版 |
|---|---|---|---|---|
| クリスマス特集・カレンダー・アーティスト/会場DB・お気に入り・推し・回しプラン・好み（オンボーディング）・おすすめ棚・サイネージ | ○ | ○ | ○ | ○（ベース維持） |
| 検索・絞り込み・詳細表示・サジェスト・チケットURL検索・読み検索 | ○ | ○ | ○ | ○（ベース維持＋下記修正） |
| ログイン（account bridge） | ○ | × | × | ○（ベース維持） |
| PWA（manifest/UI） | ○（最小版） | × | ○（フル版） | ○（フル版に置換） |
| データ引っ越し（device-transfer） | × | × | ○ | ○（取り込み） |
| 絞り込み条件の保存・呼び出し | × | × | ○ | ○（取り込み） |
| 簡易検索（年号・副題落とし照合） | × | × | × | ○（新規実装） |
| 話数・回数検索のガイド集計 | × | × | × | ○（新規実装） |
| 日付違いの示唆 | × | × | × | ○（新規実装） |

## 手順2: 統合内容

- account.js / account-config.js: ベースのまま維持（Firebase設定は空、実接続なし）。証跡: そのままコピー、構文OK。
- PWA: vx更新版の `pwa-ui.js`（5,364B）でベース最小版（2,367B）を置換、`pwa-worker.js`（4,116B→統合版4,159B）で最小版（359B）を置換、`icons/`（icon-192.png/icon-512.png/icon.svg）を追加。
  - manifest は vx 構造＋ベース値に統一: name「関西イベントガイド」、short_name「関西イベント」、description はベース文言、theme_color `#b92b37`（index の meta theme-color と一致を検証済み）。アイコンは data URI でなく icons/ ファイル参照。
  - worker: CACHE_NAME を v1→v2 に更新、SHELL_FILES に `./account-config.js`・`./account.js` を追加（全14件が実ファイルと一致を検証済み）。
- device-transfer.js: vx 版をそのまま取り込み、index 末尾に `<script src="./device-transfer.js"></script>` を追加（index.html L4145）。
  - 保存キー突き合わせ済み（競合なし）: device-transfer の KEYS（kg_trial_fav_events_v1 / kg_trial_fav_performers_v1 / kg_trial_prefs_v1 / kg_trial_learn_v1 / kg_trial_show_ended / kg_filter_profiles_v1）はベース index の LS_FAV（L914相当）等と完全一致。account.js の専用キーは kg_account_selected_user_v1 / kg_account_pending_v1_<uid> で別系統。復元時は KGAccountBridge 経由で kg:favorites-change も発火する設計（vx コード L186-189）。
  - ボタン配置: device-transfer は #kg-account-open の直後に「データ引っ越し」を挿入（ベースに同 ID が存在するためその経路が使われる）。
- 絞り込み条件の保存・呼び出し: vx index のブロックをそのまま移植。
  - `setupFilterProfiles`（統合版 index.html L4061、保存キー kg_filter_profiles_v1 は L4062）＋別タブ同期の storage リスナー（L4115）を、ベースの KGAccountBridge 定義の直前に挿入。
  - capture/apply が参照する状態変数（exactTarget・selTimeBands・selDurations・selOrganizers・selVenueGenres・hideLong・maxPrice・ongoingOnly 等）はベース側に全て存在することを移植前に確認済み。依存関数 loadPrefs（L2856）・loadLearn（L2870）・syncEndedUI（L1859）も存在。
- 見た目・レイアウト: ベースから変更なし（PWAボタンの文言が「アプリ・通知」→「アプリ・オフライン」に変わるのは vx pwa-ui の仕様）。

## 手順3: 検索ルール点検・修正（証跡は統合版 index.html の行番号）

| # | ルール | 結果 | 証跡 |
|---|---|---|---|
| 1 | 入力した文字どおり。自動変換・置換・分割・自動条件付けをしない | 済（ベース適合・無修正） | contentPass（L1594）のキーワード照合は入力文字列を1語として部分一致のみ（分割しない旨のコメント付き）。normSearch（L1459）は照合の両側に同じ正規化をかけるだけで入力を書き換えない。検索語から期間・料金・曜日を読み取る処理なし（明示フィルタのみ） |
| 2 | サジェストで選んだらそのイベントだけが返る | 済（ベース適合・無修正） | renderSuggest（L3282）の候補クリックで exactTarget を設定し、contentPass は exactMatch（L1569）のみで判定。kind=event はタイトル完全一致（ev.title===t.value）。同名複数件の候補は eventTitle として「タイトルに含む全件」になる既存仕様（ガイド本体と同仕様のコメント付き）は維持 |
| 3 | 簡易検索（年号・副題を落としても一致） | 修正（新規実装） | simpleTitleKey（L1468）: 年号（20XX年?）・括弧内副題・〜以降を落とした照合キーを生成。simpleHay（L1476）: タイトル側キー。contentPass（L1653付近の簡易検索分岐）: 通常照合で外れた場合のみ簡易キーで追加照合。登録タイトル・データは無変更。単体テスト3件パス |
| 4 | 話数・回数検索（公式番号なしはガイド集計と分かる扱い） | 修正（新規実装） | episodeQueryOf（L1486）: vol.○／第○回／#○ を検出。officialEpisodeNum（L1494）: タイトル内の公式番号。guideEpisodeNum（L1500）: 同じ題名（番号・年号・副題を除いたキー episodeBaseKey）の開催日順で数えたガイド集計番号。episodeMatch（L1513）: 公式番号優先、無ければガイド集計で照合し、contentPass（L1653）で通常照合より先に適用。表示: guideBadgeFor（L1520-1522）がカードに「ガイド集計 第N回」バッジ、render（L2514）が結果行に「話数・回数はガイド集計（公式番号がない公演は開催順）」を追記。単体テスト7件パス |
| 5 | 日付がずれる候補には日付違いの示唆 | 修正（新規実装） | dateMismatchCandidates（L1525）: contentPass に ignorePeriod/ignoreEnded を渡し、日付条件だけを外した候補を日付別に集計。render の空状態（L2536付近）: 0件かつ日付条件が効いている場合に「日付が違う候補があります」＋日付チップ（最大5件）を #dateSuggest（emptyState 内に追加）に表示。チップのクリックハンドラ（L3364）: periodPreset="all"・dateFrom=dateTo=その日にして再描画 |
| 6 | 読み検索（KOBerrieS♪＝コウベリーズ等、readings.json） | 修正（データ1件追加）＋仕組みは適合 | 仕組み: loadProfiles（L2023、反転登録は L2034）が assets/readings.json を readingByName に読み、searchHay（L1542）・renderSuggest（L3282）・一覧検索（L2997）が読みで照合。欠落発見: 同梱 readings.json（514件）に KOBerrieS♪ の読みが無く「コウベリーズ」で検索しても当たらなかった。シート「検索辞書」（585行）に正式登録あり（KOBerrieS♪／カタカナ読み: コウベリーズ、出典2行）を確認し、統合版 assets/readings.json に `"こうべりーず":"KOBerrieS♪"` を1件追加（515件）。単体テスト2件パス |
| 7 | チケットURL貼り付け検索を壊さない | 済（ベース適合・無修正） | eventMatchesTicketUrl（L1345）、contentPass の URL 検索分岐（1トークン・分割なし・チケットリンクのみ照合）。今回の修正はその分岐より後の通常キーワード分岐のみで、URL 分岐には未変更 |

単体テスト: `~/workspace/goals/goal/hidden_files/unified-search-test.cjs`（＋ `-body.js`）で統合版の実関数を抽出して実行、13件全パス。

## 検証結果

- ローカル配信（python http.server）: 全16パス 200、タイトル「関西イベントガイド（シート＋Notion試作）」一致。
- JS 構文: 外部5ファイル（account.js / account-config.js / pwa-ui.js / pwa-worker.js / device-transfer.js）＋ index 内インラインスクリプト1ブロック、全て node --check OK。
- JSON: app.webmanifest / sandbox.config.json / assets 4件、全てパース OK。
- PWA 整合: manifest のアイコン3件が実在し PNG 実寸（192x192 / 512x512）が sizes と一致。pwa-ui.js の登録パス `./pwa-worker.js` が実ファイルと一致。worker の SHELL_FILES 14件すべて実在。index の manifest リンクあり、theme-color は index・manifest とも #b92b37。
- assets: venues/artists/venue-supp はベースと SHA256 一致。readings のみ上記1件追加で差分あり。

## 未検証

- 実機（スマホ）での表示・操作、PWA インストール、オフライン動作、Service Worker の実キャッシュ挙動。
- ブラウザ実行時の全体動作（絞り込み条件の保存・呼び出しの往復、データ引っ越しの書き出し/復元、ログインUI表示）。この作業環境では構文・配信・関数単体テストまでで、実ブラウザ確認はしていない。
- 統合版の公開反映（CodeSandbox 等への投入）は未実施（仕様どおり成果物はファイルまで）。

## 要確認（勝手に決めなかった事項）

1. 読み辞書の鮮度: 同梱 readings.json は514件で、ガイドの検索辞書（シート「検索辞書」585行、読み以外の略称・別表記・会場ワードも含む）より古い。今回は仕様で名指しの KOBerrieS♪ の読み1件だけを出典確認のうえ追加した。辞書全体の同期（形式変換を含む）を行うかは別途判断が要る。
2. ルール4の集計方法: ガイド集計番号は「同じ題名の全開催を開催日順に数えた通し番号」とし、公式番号がある開催も数に含めた（バッジ表示とガイド集計照合は公式番号のない開催のみ）。ガイド本体の正確な集計方法（公式番号ありを数に含めるか）は、ガイド側アクション一覧に読み取り専用の検索仕様アクションが無く未確認。違えば guideEpisodeNum（L1500）の数え方だけ直せばよい。
3. ルール5のチップ操作: 日付チップは periodPreset 変数を "all" に戻し dateFrom/dateTo をその日に設定する。期間プリセットのチップ見た目の同期は render 内の renderChips に依存（実ブラウザ未検証）。
4. vx pwa-ui のインストールボタンの色は #c62828 のまま（ベースのテーマ #b92b37 と微妙に違う）。vx パッケージ原文どおりで残した。揃えるかは判断待ち。
5. 4sypf8ライブ版との差分: 統合版はライブ版より PWA/引っ越し/条件保存/検索3項目ぶん進んでいる。ライブURLへの反映方法（上書きインポート等）は従来どおり未確保で、この成果物では扱っていない。
