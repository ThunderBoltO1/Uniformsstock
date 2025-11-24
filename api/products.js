const { parseCsv } = require("../netlify/functions/utils");

const {
  SHEET_ID = "1i3XMdNVGD9-MSCi9UKHcDuUXC7oGmLXNI5bvEhsoCaU",
  PRODUCTS_GID = "23685886",
  PRODUCTS_WEBHOOK_URL,
} = process.env;

module.exports = async (req, res) => {
  const method = req.method;

  if (method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return res.status(200).end();
  }

  if (!SHEET_ID || !PRODUCTS_GID) {
    return res.status(501).json({
      error: "ยังไม่ได้ตั้งค่าการเชื่อมต่อกับ Google Sheets",
      details: "กรุณาตรวจสอบการตั้งค่า SHEET_ID และ PRODUCTS_GID",
    });
  }

  if (method === "GET") {
    try {
      const records = await fetchProducts();
      return res.status(200).json(records);
    } catch (err) {
      console.error("Error fetching products:", err);
      return res.status(500).json({
        error: "ไม่สามารถโหลดข้อมูลสินค้าได้",
        details: err.message,
      });
    }
  }

  if (method === "POST") {
    if (!PRODUCTS_WEBHOOK_URL) {
      return res.status(501).json({
        error: "ยังไม่ได้ตั้งค่าการเชื่อมต่อสำหรับบันทึกข้อมูล",
        details: "กรุณาตั้งค่า PRODUCTS_WEBHOOK_URL",
      });
    }

    try {
      const payload = req.body && Object.keys(req.body).length ? req.body : await readJsonBody(req);

      const response = await fetch(PRODUCTS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Webhook error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(`Webhook error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json().catch(() => ({ success: true }));
      return res.status(200).json(data);
    } catch (err) {
      console.error("Error in products POST handler:", err);
      return res.status(500).json({
        error: "บันทึกข้อมูลสินค้าไม่สำเร็จ",
        details: err.message,
      });
    }
  }

  res.setHeader("Allow", "GET, POST, OPTIONS");
  return res.status(405).json({
    error: "Method Not Allowed",
    allowedMethods: ["GET", "POST", "OPTIONS"],
  });
};

async function fetchProducts() {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${PRODUCTS_GID}`;

  const response = await fetch(csvUrl, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
  }

  const csv = await response.text();
  const products = parseCsv(csv, ["stock", "price"]);
  return products;
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
