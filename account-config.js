// Firebase の「ウェブアプリの構成」から取得する公開用設定。
// 管理者用サービスアカウント秘密鍵、パスワードは絶対にここに書かない。
// syncEndpoint: アカウント用スプレッドシートの入口（Apps Script）の URL。
// 同期の主軸はこちらで、Firestore は保険。未設定の間は端末内保存のみで動く。
window.KG_ACCOUNT_CONFIG = { apiKey: "AIzaSyAeqWGn1jg4LpErCcxA8ERqgMF9F0AFxpA", authDomain: "kansai-event-guide.firebaseapp.com", projectId: "kansai-event-guide", appId: "1:490905264522:web:4197e204d18ee158ad2873", syncEndpoint: "https://script.google.com/macros/s/AKfycbwWKSnM1KNN3yAihKEvUtfozC7v70uJqao8GE5RMbHm36zeC3Vou4dFGDCkyzDYqrLe/exec" };
