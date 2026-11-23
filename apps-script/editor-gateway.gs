/* 関西イベントガイド 編集入力ゲートウェイ
   試作サイトのフォーム送信を受けて、シート「編集入力」タブに1行追加する。
   設置手順は EDITOR_SETUP.md。シートに紐づく Apps Script として貼ること。 */
const TAB_NAME = '編集入力';
const HEADERS = ['受付日時', '種別', '対象ID', 'タイトル', '日付', '終了日', '時刻ラベル', '会場', '府県', 'エリア', 'カテゴリ', '出演者', 'タイムテーブル', '料金', '料金区分', '主催', '公式リンク', 'チケットリンク', '画像URL', '説明', '備考', '提出者', '状態'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(TAB_NAME);
    if (!sh) { sh = ss.insertSheet(TAB_NAME); sh.appendRow(HEADERS); }
    sh.appendRow([
      new Date(),
      data.kind || '', data.targetId || '', data.title || '', data.date || '', data.dateEnd || '',
      data.timeLabel || '', data.venue || '', data.prefecture || '', data.area || '', data.category || '',
      (data.performers || []).join('\n'), (data.timetable || []).join('\n'), data.price || '', data.priceClass || '',
      data.organizer || '', data.linkOfficial || '', data.linkTicket || '', (data.imageUrls || []).join('\n'),
      data.description || '', data.notes || '', data.submitter || '', '未処理'
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'editor-gateway' })).setMimeType(ContentService.MimeType.JSON);
}
