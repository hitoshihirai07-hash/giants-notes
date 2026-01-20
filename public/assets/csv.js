export function parseCSV(text) {
  // RFC4180寄り（ダブルクォート、改行混在対応）
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = "";
    } else if (c === '\r') {
      // ignore
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  row.push(field);
  rows.push(row);

  // 末尾の空行を除去
  while (rows.length && rows[rows.length - 1].every(v => String(v || "") === "")) {
    rows.pop();
  }
  return rows;
}

export async function fetchCSV(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV取得失敗: HTTP ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

export function toComparable(v) {
  const s = String(v ?? "").trim();
  if (!s) return { type: "empty", n: NaN, s: "" };

  // 数字っぽい（小数、先頭0、マイナス対応）
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    return { type: "num", n: Number(s), s };
  }
  // 例: 12.1（投球回）なども上で拾える

  return { type: "str", n: NaN, s };
}
