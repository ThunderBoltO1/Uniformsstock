const { parseCsv } = require("../netlify/functions/utils");

const {
  SHEET_ID = "1i3XMdNVGD9-MSCi9UKHcDuUXC7oGmLXNI5bvEhsoCaU",
  ORDERS_GID = "1366868069",
  ORDERS_WEBHOOK_URL,
} = process.env;

module.exports = async (req, res) => {
  const method = req.method;

  if (method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return res.status(200).end();
  }

  if (method === "GET") {
    try {
      const records = await fetchOrders();
      return res.status(200).json(records);
    } catch (err) {
      console.error("Error fetching orders:", err);
      return res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้" });
    }
  }

  if (method === "POST") {
    try {
      const payload = req.body && Object.keys(req.body).length ? req.body : await readJsonBody(req);

      // ถ้ายังไม่ได้ตั้งค่า ORDERS_WEBHOOK_URL ให้ตอบ success แบบจำลองไปก่อน
      if (!ORDERS_WEBHOOK_URL) {
        console.warn("ORDERS_WEBHOOK_URL is not set. Returning mock success response.");
        return res.status(200).json({
          success: true,
          message: "ORDERS_WEBHOOK_URL is not configured. This is a mock success response.",
          payload,
        });
      }

      const response = await fetch(ORDERS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Webhook status ${response.status}`);
      const data = await response.json().catch(() => ({ success: true }));
      return res.status(200).json(data);
    } catch (err) {
      console.error("Error in orders POST handler:", err);
      return res.status(500).json({ error: "บันทึกข้อมูลคำสั่งซื้อไม่สำเร็จ" });
    }
  }

  res.setHeader("Allow", "GET, POST, OPTIONS");
  return res.status(405).json({ error: "Method Not Allowed" });
};

async function fetchOrders() {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${ORDERS_GID}`;
  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`CSV status ${response.status}`);
  const csv = await response.text();
  return parseCsv(csv, ["quantity", "total"]);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", (err) => reject(err));
  });
}
