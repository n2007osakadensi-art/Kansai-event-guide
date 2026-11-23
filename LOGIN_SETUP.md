# ログイン機能（Firebase接続）のセットアップ手順

サイト側の実装は完了しています（`account.js` / `account-config.js`）。
残りは Firebase プロジェクト側の設定だけです。所要時間の目安は10分程度です。
設定が終わると、ヘッダーの「ログイン / 同期」から Google アカウントでログインでき、
推し・お気に入りが端末をまたいで同期されるようになります。

## Kota が Firebase コンソールでやること

場所: https://console.firebase.google.com/ （Googleアカウントでサインイン）

1. **プロジェクトを作成**
   - 「プロジェクトを追加」→ 名前は任意（例: kansai-event-guide）→ 作成
   - Google アナリティクスは「今は設定しない」でOK

2. **ログイン方法を有効化**
   - 左メニュー「構築 → Authentication」→「始める」
   - 「Sign-in method」タブ →「Google」を有効にして保存

3. **公開ドメインを許可**
   - Authentication の「Settings（設定）→ 承認済みドメイン」に
     `n2007osakadensi-art.github.io` を追加
   - （localhost は最初から許可されています）

4. **データベースを作成**
   - 左メニュー「構築 → Firestore Database」→「データベースを作成」
   - ロケーションは `asia-northeast1（東京）` を選択
   - 「本番環境モード」で開始し、「ルール」タブに下記のルールを貼って「公開」

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/favorites/{docId} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
       match /memberdata/{key} {
         allow get, write: if key.matches('^[a-f0-9]{64}$');
       }
       match /codes/{key} {
         allow get, write: if key.matches('^[a-f0-9]{64}$');
       }
       match /recovery/{key} {
         allow get, write: if key.matches('^[a-f0-9]{64}$');
       }
     }
   }
   ```

   （意味: users はログインした本人が自分の分だけ読み書きできる。memberdata は会員データ本体、codes は会員コードの索引、recovery は「質問と回答」による復旧の索引で、いずれも64桁のハッシュを知る者だけが読み書きできる。get のみにして一覧取得（list）を禁じているのは、ハッシュの一覧を外部から抜かせないため）

5. **ウェブアプリを登録して設定値をコピー**
   - プロジェクトの概要ページで「</>（ウェブ）」アイコン → アプリのニックネームは任意
     （例: guide-web）→「アプリを登録」
   - 表示される `firebaseConfig` の中の次の4つの値を Muse に渡してください:
     `apiKey` / `authDomain` / `projectId` / `appId`
   - この4つは公開情報です（パスワードや秘密鍵ではありません。チャットで送って大丈夫です）

## Muse がやること

- 受け取った4値を `account-config.js` に入れて GitHub に反映
- 公開URLで「ログイン / 同期」ダイアログが Google ログインボタンを表示することを確認
- 実際のログインと同期の最終確認は Kota の端末で（Googleアカウントのパスワードは
  Muse には渡さないでください。ログイン操作は Kota 自身が行います）

## 実装済みの仕様（account.js）

- ログイン方法: Googleアカウント（ポップアップ方式）のみ
- 同期対象: 推し（アーティスト）とお気に入り（イベント）
- 初回ログイン時: 「この端末のデータを統合」か「アカウントのデータを使う」かを選べる
- オフライン時: 変更は端末にキューされ、再接続時に自動で同期される
- ログアウト時: 端末内の推し・お気に入りは消去される（アカウント側には残る）
- 未設定の間: ダイアログに「ログイン機能は準備中です」と表示され、
  従来どおり端末内保存のみで動作する
