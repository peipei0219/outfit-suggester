// 手持ちの服（クローゼット）を端末の localStorage に保存する
const KEY = "outfit-suggester.closet.v1";

export const CATEGORIES = { outer: "アウター", tops: "トップス", bottoms: "ボトムス" };
export const SEASONS = {
  heavy: "真冬（〜5℃）",
  winter: "冬（6〜12℃）",
  mid: "春秋（13〜24℃）",
  summer: "夏（25℃〜）",
};
export const SCENES = { casual: "カジュアル", office: "オフィス", formal: "フォーマル", sport: "スポーツ" };

function isValidItem(i) {
  return (
    i && typeof i.name === "string" && i.name.trim() &&
    i.category in CATEGORIES &&
    Array.isArray(i.seasons) && i.seasons.every((s) => s in SEASONS) &&
    Array.isArray(i.scenes) && i.scenes.every((s) => s in SCENES)
  );
}

export function loadCloset() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(items) ? items.filter(isValidItem) : [];
  } catch {
    return [];
  }
}

function save(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // プライベートブラウズなどで保存できない場合はメモリ上だけで動かす
  }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function addItem(items, item) {
  const next = [...items, { ...item, name: item.name.trim(), id: newId() }];
  save(next);
  return next;
}

export function removeItem(items, id) {
  const next = items.filter((i) => i.id !== id);
  save(next);
  return next;
}

export function exportCloset(items) {
  return JSON.stringify({ version: 1, items }, null, 2);
}

// 読み込んだ服を今のクローゼットに追加する（同じ id は上書き）
export function importCloset(items, json) {
  const data = JSON.parse(json);
  const incoming = (Array.isArray(data) ? data : data.items ?? []).filter(isValidItem);
  if (!incoming.length) throw new Error("読み込める服が見つかりませんでした");
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id ?? newId(), { ...i, id: i.id ?? newId() });
  const next = [...byId.values()];
  save(next);
  return { items: next, count: incoming.length };
}
