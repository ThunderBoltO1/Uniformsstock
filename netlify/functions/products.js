// netlify/functions/products.js
const { parseCsv, json } = require("./utils");

const { 
  SHEET_ID = "1i3XMdNVGD9-MSCi9UKHcDuUXC7oGmLXNI5bvEhsoCaU", 
  PRODUCTS_GID = "23685886", 
  PRODUCTS_WEBHOOK_URL 
} = process.env;

exports.handler = async (event) => {
  // Log the incoming request for debugging
  console.log('Incoming request:', {
    method: event.httpMethod,
    path: event.path,
    query: event.queryStringParameters,
    headers: event.headers,
    body: event.body
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  // Check for required environment variables
  if (!SHEET_ID || !PRODUCTS_GID) {
    console.error('Missing required environment variables:', { SHEET_ID, PRODUCTS_GID });
    return json(501, {
      error: "ยังไม่ได้ตั้งค่าการเชื่อมต่อกับ Google Sheets",
      details: "กรุณาตรวจสอบการตั้งค่า SHEET_ID และ PRODUCTS_GID"
    });
  }

  if (event.httpMethod === "GET") {
    try {
      console.log('Fetching products...');
      const records = await fetchProducts();
      console.log(`Fetched ${records.length} products`);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(records)
      };
    } catch (err) {
      console.error('Error fetching products:', err);
      return json(500, { 
        error: "ไม่สามารถโหลดข้อมูลสินค้าได้",
        details: err.message 
      });
    }
  }

  if (event.httpMethod === "POST") {
    if (!PRODUCTS_WEBHOOK_URL) {
      console.error('Missing PRODUCTS_WEBHOOK_URL');
      return json(501, {
        error: "ยังไม่ได้ตั้งค่าการเชื่อมต่อสำหรับบันทึกข้อมูล",
        details: "กรุณาตั้งค่า PRODUCTS_WEBHOOK_URL"
      });
    }

    try {
      const payload = JSON.parse(event.body || "{}");
      console.log('Sending payload to webhook:', payload);
      
      const response = await fetch(PRODUCTS_WEBHOOK_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Webhook error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Webhook error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json().catch(() => ({ success: true }));
      console.log('Webhook response:', data);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(data)
      };
    } catch (err) {
      console.error('Error in POST handler:', err);
      return json(500, { 
        error: "บันทึกข้อมูลสินค้าไม่สำเร็จ",
        details: err.message
      });
    }
  }

  // Method not allowed
  return {
    statusCode: 405,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Allow': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify({ 
      error: "Method Not Allowed",
      allowedMethods: ['GET', 'POST', 'OPTIONS']
    })
  };
};

async function fetchProducts() {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${PRODUCTS_GID}`;
  console.log('Fetching CSV from:', csvUrl);
  
  const response = await fetch(csvUrl, { 
    cache: "no-store",
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
  }
  
  const csv = await response.text();
  console.log('CSV content length:', csv.length);
  
  const products = parseCsv(csv, ["stock", "price"]);
  console.log('Parsed products count:', products.length);
  
  return products;
}