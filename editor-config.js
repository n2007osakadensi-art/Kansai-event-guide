/* 編集入力の送信先。2026-11-26 v163 で送信経路を Google フォームへ切り替えた。
   旧経路（FormSubmit AJAX→受付メール）は応答が約48秒に劣化し、フォーム側の
   タイムアウトを超えて送信が成立しなくなっていた（編集が届かない重大バグの主因）。
   Google フォームの回答は Forms API で読み出せ、定期ジョブ kansai-editor-intake が
   取り込んでスペース版ガイドへ登録・シート同期まで進める。
   フォーム: 「関西イベントガイド 編集入力」(formId 1u4_zvCv7lwvlvzZsbLPotIPpSXC7XEXRWN3r9AYsl0c)
   項目: 件名 entry.1080706032 / 送信内容JSON entry.1332259934 */
window.KG_EDITOR_CONFIG = {
  formAction: 'https://docs.google.com/forms/d/e/1FAIpQLSdvq5Z1iDgxDit1pvXNDUPg-VDT7g6EZl-4HAZmanXMJaq8wg/formResponse',
  formSubjectEntry: 'entry.1080706032',
  formPayloadEntry: 'entry.1332259934'
};
