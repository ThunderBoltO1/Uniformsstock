const { parseCsv, json } = require("./utils");

const { SHEET_ID, ORDERS_GID, ORDERS_WEBHOOK_URL } = process.env;

exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    if (!SHEET_ID || !ORDERS_GID) {
      return json(501, {
        error: "ยังไม่ได้ตั้งค่า Google Sheet ID สำหรับการโหลดข้อมูล",
      });
    }
    try {
      const records = await fetchOrders();
      return json(200, records);
    } catch (err) {
      console.error(err);
      return json(500, { error: "ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้" });
    }
  }

  if (event.httpMethod === "POST") {
    if (!ORDERS_WEBHOOK_URL) {
      return json(501, {
        error: "ยังไม่ได้ตั้งค่า ORDERS_WEBHOOK_URL สำหรับบันทึกข้อมูล",
      });
    }

    try {
      const payload = JSON.parse(event.body || "{}");
      const response = await fetch(ORDERS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Webhook status ${response.status}`);
      const data = await response.json().catch(() => ({ success: true }));
      return json(200, data);
    } catch (err) {
      console.error(err);
      return json(500, { error: "บันทึกข้อมูลคำสั่งซื้อไม่สำเร็จ" });
    }
  }

  return json(405, { error: "Method Not Allowed" });
};

async function fetchOrders() {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${ORDERS_GID}`;
  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`CSV status ${response.status}`);
  const csv = await response.text();
  return parseCsv(csv, ["quantity", "total"]);
}

