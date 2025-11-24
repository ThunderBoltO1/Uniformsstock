# Uniforms Stock Web App

แดชบอร์ดจัดการสินค้ากับคำสั่งซื้อสำหรับธุรกิจยูนิฟอร์ม ใช้ HTML + Tailwind + JavaScript ฝั่งหน้าบ้าน และรองรับการเชื่อมต่อ Google Sheets ผ่าน Google Apps Script หรือบริการใดๆ ที่ตอบกลับในรูป JSON

## โครงสร้าง

- `index.html` – หน้าเลือกเมนูไปยังสินค้าหรือคำสั่งซื้อ
- `products.html` – หน้าจัดการคลังสินค้า
- `orders.html` – หน้าจัดการคำสั่งซื้อ
- `js/app.js` – ล็อกิกสำหรับโหลด/บันทึกข้อมูล, เรนเดอร์ตาราง, ใช้ร่วมได้ทั้งสองหน้า

เปิดใช้งานได้ทันทีด้วยการดับเบิลคลิก `index.html` (แล้วเลือกหน้า) หรือรันผ่าน static server (`npx serve .`)

## การเชื่อม Google Sheets

1. สร้าง Google Sheet ที่มีแท็บ `products` และ `orders` (หรือชื่ออื่นตามต้องการ) โดยให้แถวแรกเป็นชื่อคอลัมน์ เช่น `name,sku,stock,price...`
2. ไปที่ **Extensions → Apps Script** แล้วแทนที่สคริปต์ด้วยตัวอย่างด้านล่าง:

```javascript
const SHEET = SpreadsheetApp.getActiveSpreadsheet();

function doGet(e) {
  const table = e.parameter.table;
  const rows = getSheetData(table);
  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doPost(e) {
  const { action, payload } = JSON.parse(e.postData.contents);
  const table = e.parameter.table;
  writeSheetData(table, action, payload);
  return ContentService.createTextOutput(JSON.stringify({ success: true }));
}
```

> เพิ่มฟังก์ชัน `getSheetData` และ `writeSheetData` ให้แปลงข้อมูลจาก/ไปยังแผ่นงานตาม schema ที่ต้องการ

3. Deploy เป็น **Web App** (เลือก `Execute as: Me` และ `Accessible by: Anyone with the link`)
4. นำ URL ที่ได้ไปแทนที่ `YOUR-APPSCRIPT-ID` ใน `js/app.js`

```js
const SHEETS_ENDPOINT = {
  products: "https://script.google.com/macros/s/REAL-ID/exec?table=products",
  orders: "https://script.google.com/macros/s/REAL-ID/exec?table=orders",
};
```

## การใช้งาน

- เข้าหน้า `products.html` หรือ `orders.html` เพื่อพิมพ์ข้อมูลและกดบันทึก ระบบจะส่งข้อมูลไปยัง Google Sheets
- ปุ่ม “รีเฟรชข้อมูล” จะโหลดข้อมูลล่าสุดกลับมาแสดง
- ปุ่ม “แก้ไข” จะดึงข้อมูลกลับมาใส่ฟอร์ม อัปเดตและบันทึกซ้ำเพื่อเขียนทับบนชีต

## การปรับแต่ง

- ปรับฟิลด์ในฟอร์มให้ตรงกับคอลัมน์ Google Sheets หรือเพิ่มการตรวจสอบข้อมูลใน `app.js`
- หากต้องการระบบล็อกอิน/สิทธิ์ สามารถนำหน้า HTML นี้ไปต่อยอดกับบริการ auth ภายนอก หรือย้ายไปใช้เฟรมเวิร์กเต็มรูปแบบในอนาคต

# Uniformsstock
