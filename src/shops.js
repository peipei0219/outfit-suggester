// おすすめの服を各ショップで検索するリンク
// ※ 各サイトの検索 URL の形式が変わったら、ここだけ直せば OK

// 「シャツ＋カーディガン」「スーツ／ワンピース」「なし（クールビズ）」などを検索ワードに分解する
export function toKeywords(name) {
  return name
    .replace(/[（(].*?[）)]/g, "")
    .split(/[＋+／/]/)
    .map((s) => s.trim())
    .filter((s) => s && s !== "なし");
}

// ---- Shift_JIS エンコード（ZOZOTOWN の検索は Shift_JIS のキーワードを受け付ける）----
let sjisTable = null;
function buildSjisTable() {
  const table = new Map();
  const decoder = new TextDecoder("shift_jis", { fatal: true });
  const leads = [];
  for (let b = 0x81; b <= 0x9f; b++) leads.push(b);
  for (let b = 0xe0; b <= 0xfc; b++) leads.push(b);
  for (const lead of leads) {
    for (let trail = 0x40; trail <= 0xfc; trail++) {
      if (trail === 0x7f) continue;
      try {
        const ch = decoder.decode(new Uint8Array([lead, trail]));
        if (ch.length === 1 && !table.has(ch)) table.set(ch, [lead, trail]);
      } catch {
        // 未定義のコード
      }
    }
  }
  for (let b = 0xa1; b <= 0xdf; b++) table.set(String.fromCharCode(0xff61 + b - 0xa1), [b]); // 半角カナ
  return table;
}

const pct = (b) => "%" + b.toString(16).toUpperCase().padStart(2, "0");

export function encodeShiftJIS(text) {
  sjisTable ??= buildSjisTable();
  let out = "";
  for (const ch of text) {
    if (/[A-Za-z0-9\-_.*]/.test(ch)) out += ch;
    else if (ch === " ") out += "+";
    else if (ch.charCodeAt(0) < 0x80) out += pct(ch.charCodeAt(0));
    else {
      const bytes = sjisTable.get(ch);
      if (!bytes) return null; // Shift_JIS にない文字
      out += bytes.map(pct).join("");
    }
  }
  return out;
}

export const SHOPS = [
  {
    key: "uniqlo",
    label: "ユニクロ",
    url: (q) => `https://www.uniqlo.com/jp/ja/search?q=${encodeURIComponent(q)}`,
  },
  {
    key: "zozo",
    label: "ZOZOTOWN",
    url: (q) => {
      const sjis = encodeShiftJIS(q);
      return `https://zozo.jp/search/?p_keyv=${sjis ?? encodeURIComponent(q)}`;
    },
  },
];
