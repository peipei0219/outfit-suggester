import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
};
const { loadCloset, addItem, removeItem, exportCloset, importCloset } = await import("../src/closet.js");

beforeEach(() => store.clear());

const coat = { name: " 黒のコート ", category: "outer", seasons: ["winter"], scenes: ["casual"] };

test("追加・保存・削除", () => {
  const { items, added } = addItem([], coat);
  assert.equal(added.name, "黒のコート");
  assert.equal(loadCloset().length, 1);
  assert.equal(removeItem(items, added.id).length, 0);
  assert.equal(loadCloset().length, 0);
});

test("書き出し → 読み込みで写真も戻り、同じ id は重複しない", () => {
  const { items, added } = addItem([], coat);
  const json = exportCloset(items, new Map([[added.id, "data:image/jpeg;base64,AAAA"]]));
  const r = importCloset(items, json);
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.photos, [[added.id, "data:image/jpeg;base64,AAAA"]]);
  assert.equal("photo" in r.items[0], false);
});

test("不正なデータは読み込まない", () => {
  assert.throws(() => importCloset([], JSON.stringify({ items: [{ name: 1 }] })));
  store.set("outfit-suggester.closet.v1", "{broken");
  assert.deepEqual(loadCloset(), []);
});

test("updateItem で特徴を保存・削除できる", async () => {
  const { updateItem } = await import("../src/closet.js");
  const { items, added } = addItem([], coat);
  let next = updateItem(items, added.id, { embed: "AAAA" });
  assert.equal(loadCloset()[0].embed, "AAAA");
  next = updateItem(next, added.id, { embed: undefined });
  assert.equal("embed" in loadCloset()[0], false); // JSON にすると消える
});
