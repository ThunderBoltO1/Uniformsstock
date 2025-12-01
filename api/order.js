const admin = require("./firebaseAdmin");
const db = admin.firestore();

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request (CORS preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    try {
      const snapshot = await db.collection("orders").orderBy("createdAt", "desc").get();
      const records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(records);
    } catch (err) {
      console.error("Error fetching orders:", err);
      return res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้" });
    }
  }

  if (req.method === "POST") {
    try {
      const { action = "create", payload } = req.body || {};

      if (!payload || !payload.id) {
        return res.status(400).json({ error: "ต้องมีรหัสคำสั่งซื้อ (id)" });
      }

      const docRef = db.collection("orders").doc(String(payload.id));
      const timestamp = admin.firestore.FieldValue.serverTimestamp();

      if (action === "update") {
        await docRef.set({ ...payload, updatedAt: timestamp }, { merge: true });
      } else {
        await docRef.set({ ...payload, createdAt: timestamp, updatedAt: timestamp });
      }

      const saved = await docRef.get();
      return res.status(200).json({ id: docRef.id, ...saved.data() });
    } catch (err) {
      console.error("Error saving order:", err);
      return res.status(500).json({ error: "บันทึกข้อมูลคำสั่งซื้อไม่สำเร็จ" });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
  return res.status(405).json({ error: "Method Not Allowed" });
};
