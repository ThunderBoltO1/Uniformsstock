function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCsv(csv, numericFields = []) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines.shift()).map((h) => h.trim());
  return lines
    .map((line) => parseCsvLine(line))
    .filter((cells) => cells.some((cell) => cell.trim().length))
    .map((cells) => {
      return headers.reduce((record, header, idx) => {
        if (!header) return record;
        let value = (cells[idx] ?? "").trim();
        if (numericFields.includes(header)) {
          const numeric = Number(value.replace(/,/g, ""));
          value = Number.isNaN(numeric) ? 0 : numeric;
        }
        record[header] = value;
        return record;
      }, {});
    });
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": process.env.CORS_ALLOWED_ORIGIN || "*",
    },
    body: JSON.stringify(body),
  };
}

module.exports = { parseCsv, json };
