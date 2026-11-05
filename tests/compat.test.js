import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCompat, pairScore, outfitScore, compatLevel, pairType } from "../src/compat-core.js";
import { encodeF16, decodeF16 } from "../src/tagger-core.js";
import { suggest, chooseCombo } from "../src/rules.js";

test("encodeF16 → decodeF16 の往復", () => {
  const v = [0, 1, -2, 0.5, 0.1, -0.333, 65504, 1e-5];
  const back = decodeF16(encodeF16(v), v.length);
  v.forEach((x, i) => assert.ok(Math.abs(back[i] - x) <= Math.abs(x) * 1e-3 + 1e-4, `${x} → ${back[i]}`));
  assert.equal(encodeF16([1, -2, 0.5, 0]), "ADwAwAA4AAA="); // Python と同じ
});

test("pairType は順序によらず、同じ種類は対象外", () => {
  assert.equal(pairType("bottoms", "tops"), "tops/bottoms");
  assert.equal(pairType("tops", "tops"), null);
});

const dim = 2;
const pt = [["outer", "tops"], ["outer", "bottoms"], ["tops", "bottoms"]];
// 特徴 [a⊙b (2), |a−b| (2)] に対する重み: 「似た向きなら高い」= a⊙b に正の重み
const logistic = loadCompat({
  format: 1, type: "logistic", pair_types: pt, levels: { good: 0.5, poor: -0.5 },
  logistic: Object.fromEntries(pt.map((p) => [p.join("/"), { w_f16: encodeF16([1, 1, 0, 0]), dim: 4, b: 0 }])),
});
// 同じ関数を MLP（4+3 → 1 → 1、恒等に近い）で表したもの
const mlp = loadCompat({
  format: 1, type: "mlp", pair_types: pt, levels: { good: 0.5, poor: -0.5 },
  mlp: [
    { w_f16: encodeF16([1, 1, 0, 0, 0, 0, 0]), shape: [7, 1], b: [1] }, // ReLU のため +1 して正に保つ
    { w_f16: encodeF16([1]), shape: [1, 1], b: [-1] },
  ],
});

test("次元の合わない埋め込みは無視する", () => {
  assert.equal(logistic.embedDim, 2);
  assert.equal(mlp.embedDim, 2);
  const s = outfitScore(logistic, [{ category: "tops", embedding: [1, 0, 0] }, { category: "bottoms", embedding: [1, 0] }]);
  assert.equal(s, null);
});

test("ロジスティックと MLP のスコア", () => {
  const a = Float32Array.from([1, 0]), b = Float32Array.from([0.6, 0.8]);
  assert.ok(Math.abs(pairScore(logistic, a, b, "tops/bottoms") - 0.6) < 1e-3);
  assert.ok(Math.abs(pairScore(mlp, a, b, "tops/bottoms") - 0.6) < 1e-3);
});

test("outfitScore は別の種類の組の平均、相性レベル", () => {
  const items = [
    { category: "tops", embedding: [1, 0] },
    { category: "bottoms", embedding: [2, 0] }, // 正規化されて [1, 0]
    { category: "tops", embedding: [0, 1] },   // tops どうしは組にしない
  ];
  const s = outfitScore(logistic, items); // (1 + 0) / 2
  assert.ok(Math.abs(s - 0.5) < 1e-3);
  assert.equal(compatLevel(logistic, s), "good");
  assert.equal(compatLevel(logistic, -1), "poor");
  assert.equal(outfitScore(logistic, [items[0], items[2]]), null);
});

const item = (id, category, embed = "x") => ({ id, name: id, category, seasons: ["winter"], scenes: ["casual"], embed });
const closet = [item("coatA", "outer"), item("coatB", "outer"), item("knitA", "tops"), item("knitB", "tops"), item("denim", "bottoms", null)];
// coatA と knitA が最も相性が良い
const score = (items) => items.reduce((s, i) => s + ({ coatA: 2, knitA: 2, coatB: 0, knitB: 0 }[i.id] ?? 0), 0);

test("相性の良い組み合わせを選び、特徴のない服は従来どおり", () => {
  const s = suggest({ temp: 10, weather: "sunny", scene: "casual", closet, scoreOutfit: score, random: () => 0 });
  assert.equal(s.outer.name, "coatA");
  assert.equal(s.tops.name, "knitA");
  assert.equal(s.bottoms.name, "denim"); // embed がないので組み合わせの計算には入らない
  assert.equal(s.compat.ids, "coatA+knitA");
});

test("「別の候補」では前回と同じ組み合わせを避ける", () => {
  const prev = suggest({ temp: 10, weather: "sunny", scene: "casual", closet, scoreOutfit: score, random: () => 0 });
  const next = suggest({ temp: 10, weather: "sunny", scene: "casual", closet, scoreOutfit: score, prev, random: () => 0 });
  assert.notEqual(next.compat.ids, prev.compat.ids);
});

test("特徴のある服が 1 枠しかなければ相性は使わない", () => {
  const only = closet.filter((i) => i.category !== "outer");
  assert.equal(chooseCombo((c) => only.filter((i) => i.category === c), score, null), null);
  const s = suggest({ temp: 10, weather: "sunny", scene: "casual", closet: only, scoreOutfit: score });
  assert.equal(s.compat, null);
});

test("実際の model/compat.json で Python と同じスコアになる", async () => {
  const { readFileSync } = await import("node:fs");
  const model = loadCompat(JSON.parse(readFileSync(new URL("../model/compat.json", import.meta.url))));
  const fx = JSON.parse(readFileSync(new URL("./fixtures/compat_parity.json", import.meta.url)));
  const items = fx.items.map((i) => ({ category: i.category, embedding: decodeF16(i.embed, 512) }));
  const js = outfitScore(model, items);
  assert.ok(Math.abs(js - fx.python_outfit_score) < 1e-3, `JS ${js} vs Python ${fx.python_outfit_score}`);
});
