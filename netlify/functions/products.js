const { parseCsv, json } = require("./utils");

const { SHEET_ID, PRODUCTS_GID, PRODUCTS_WEBHOOK_URL } = process.env;

exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    if (!SHEET_ID || !PRODUCTS_GID) {
      return json(501, {
        error: "ยังไม่ได้ตั้งค่า Google Sheet ID สำหรับการโหลดข้อมูลสินค้า",
      });
    }
    try {
      const records = await fetchProducts();
      return json(200, records);
    } catch (err) {
      console.error(err);
      return json(500, { error: "ไม่สามารถโหลดข้อมูลสินค้าได้" });
    }
  }

  if (event.httpMethod === "POST") {
    if (!PRODUCTS_WEBHOOK_URL) {
      return json(501, {
        error: "ยังไม่ได้ตั้งค่า PRODUCTS_WEBHOOK_URL สำหรับบันทึกข้อมูล",
      });
    }

    try {
      const payload = JSON.parse(event.body || "{}");
      const response = await fetch(PRODUCTS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Webhook status ${response.status}`);
      }
      const data = await response.json().catch(() => ({ success: true }));
      return json(200, data);
    } catch (err) {
      console.error(err);
      return json(500, { error: "บันทึกข้อมูลสินค้าไม่สำเร็จ" });
    }
  }

  return json(405, { error: "Method Not Allowed" });
};

async function fetchProducts() {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${PRODUCTS_GID}`;
  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`CSV status ${response.status}`);
  const csv = await response.text();
  return parseCsv(csv, ["stock", "price"]);
}

