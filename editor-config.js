/* 編集入力の送信先。2026-11-23 Kota指示「勝手に設定して」により、受付メール
   kansai-event-info@muse.ai への送信経路（FormSubmit AJAX）を設定。
   送信内容はメールで受付アドレスに届き、確認のうえスペース版ガイドへ登録される。
   シート「編集入力」タブへの直接ステージングに切り替える場合は、Apps Script
   ゲートウェイをデプロイしてそのURLをここに入れる（EDITOR_SETUP.md参照）。 */
window.KG_EDITOR_CONFIG = { endpoint: 'https://formsubmit.co/ajax/kansai-event-info@muse.ai' };
