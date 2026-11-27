# プロフィール画像の設定（ヘッダー／アイコン）仕様（2026-11-27、Kota指示）

## 指示
「ヘッダーとアイコンみたいなの設置するなら画像設定できるように。こちらからも添付かURL、XとInstagramのアイコンを引用出来るように」
= スマホ対応版のプロフィール編集フォームから、プロフィール画像を設定できるようにする。入力経路は4つ: ファイル添付／URL／Xのアイコン引用／Instagramのアイコン引用。

## 対象の画像（表示側の現状）
- アーティストのアイコン（av）: アーティストページ・一覧・プロフィールシートに表示。現状は同梱データ（assets/artists.json）の値のみで、シートには載らない「試作側の解決値」（write_profiles.py の設計メモどおり）。
- 会場のヘッダー画像（hi）: 会場ページのカバー。ガイドの会場プロフィール headerImageUrl が正本で、シート経由で表示される。
- メンバーのアイコン（ic）: メンバー行に表示。av と同じく試作側の解決値。

## 設定の反映先
- アーティストのアイコン: ガイドへは setartistavatarimage で反映（URL経路は imageUrl+sourceType、添付は imageData+sourceType=upload）。スマホ表示用には、取り込み側がシートの新タブ「プロフィール画像」へ公開URLを記録し、サイトは読み込み時にマージする（タグ／タグNG と同じ方式、前面復帰時にも再取得）。
- 会場ヘッダー: ガイドの updatevenueprofile で headerImageUrl を更新（既存項目はスナップショットから全保持）。添付の場合は取り込み側が GitHub 画像経路で公開URLを作ってからそのURLを設定する。表示は従来どおりシート経由。
- メンバーのアイコン: スマホ表示用に「プロフィール画像」タブへ記録（kind=member）。ガイド側のメンバー icon 欄にも同じ公開URLを渡す（updateartistprofile の members[].icon）。

## 「プロフィール画像」タブ（データシート）
列: A=種別（artist / venue / member）/ B=プロフィール名 / C=メンバー名（member のみ）/ D=画像URL / E=更新日時（YYYY/MM/DD HH:MM）。
write_sheets.py の同期対象外（タグタブと同じ）。書き手は編集入力取り込みジョブのみ。サイトは gviz で読み、種別ごとに av（artist）／hi（venue）／ic（member）としてプロフィールへ上書きマージする（空でない値だけ）。

## 編集フォーム（profile-editor.js）
- アーティスト: 「アイコン画像」欄。現在のアイコンをプレビュー表示し、[URLを入力] [Xのアイコンを使う] [Instagramのアイコンを使う] [画像を添付] の4経路。X／Instagram引用はフォーム内の X／Instagram 欄のリンクを使う（未入力なら押せない）。添付は端末内で最大1024pxへ縮小してから送る（データURL、2MB上限）。
- メンバー行: 「アイコン」欄（同4経路の小型版）。
- 会場: 「ヘッダー画像」欄。[URLを入力] [画像を添付] の2経路＋現在のヘッダーをプレビュー。
- 既定は「変更しない」。「外す」を選ぶと解除として送る。
- 送信ペイロード: artistProfile.avatarImage / members[].iconImage / venueProfile.headerImage に {mode: keep|clear|url|x|instagram|upload, url?, dataUrl?} を入れる。

## 取り込み（kansai-editor-intake のプロフィール処理への追加）
- mode=url: そのURLを公開URLとして使う。アーティストは setartistavatarimage（sourceType=official, sourceUrl=そのURL）も実行。
- mode=x: プロフィールの X リンクからアイコン画像URLを解決（fetch_x.py）→ setartistavatarimage（sourceType=x）＋タブ記録。
- mode=instagram: Instagram のプロフィール画像URLを解決（instagram CLI）→ setartistavatarimage（sourceType=instagram）＋タブ記録。解決できなければ保留（理由を台帳へ）。
- mode=upload: アーティストは setartistavatarimage（imageData, sourceType=upload）。タブ／会場ヘッダー用には GitHub 画像経路で公開URLを作る（images/prof/ 配下、無劣化SVGラップ）。
- mode=clear: アーティストは setartistavatarimage でクリア、タブ行は削除。会場は headerImageUrl を空で更新。
- 管理者（admin）の送信は従来どおり再検証なし。それ以外は画像の出所（公式リンクとの一致）を一次情報で確認し、合わなければ保留。

## 注意
- スペース版が正本、スマホは同期・タブ経由で表示、という反映統一ルール（2026-11-26）は維持する。av/ic が試作側の解決値である点は既存設計どおりで、タブはその置き場。
- 画像の画質は落とさない（添付の縮小は寸法のみ、再エンコードは高品質設定）。
