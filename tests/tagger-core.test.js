import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeF16, loadTagger, predict, interpret, suggestName, l2normalize } from "../src/tagger-core.js";

test("decodeF16 は Python の encode_f16 と同じ形式を読める", () => {
  // ml/tests/test_export.py の test_known_f16_encoding_shared_with_js と同じ値
  assert.deepEqual([...decodeF16("ADwAwAA4AAA=", 4)], [1, -2, 0.5, 0]);
});

const f16b64 = (values) => {
  // テスト用の簡易 float16 エンコーダ（0, ±1 だけ扱う）
  const bytes = values.flatMap((v) => (v === 0 ? [0, 0] : v === 1 ? [0x00, 0x3c] : [0x00, 0xbc]));
  return Buffer.from(bytes).toString("base64");
};

const fakeTagger = loadTagger({
  format: 1,
  image_model: "test",
  garments: {
    wool_coat: { ja: "ウールコート", category: "outer", seasons: ["heavy", "winter"] },
    tshirt: { ja: "Tシャツ", category: "tops", seasons: ["summer"] },
    jeans: { ja: "デニムパンツ", category: "bottoms", seasons: ["mid"] },
  },
  colors: { navy: { ja: "ネイビー" }, white: { ja: "白" } },
  heads: {
    garment: { labels: ["wool_coat", "tshirt", "jeans"], dim: 3, scale: 100, weights_f16: f16b64([1, 0, 0, 0, 1, 0, 0, 0, 1]) },
    color: { labels: ["navy", "white"], dim: 3, scale: 100, weights_f16: f16b64([0, 0, 1, 0, -1, 0]) },
  },
});

test("predict は確率の合計が 1 で、近いクラスが先頭", () => {
  const r = predict(fakeTagger.heads.garment, Float32Array.from([0.2, 3, 0.1]));
  assert.equal(r[0].key, "tshirt");
  assert.ok(Math.abs(r.reduce((s, x) => s + x.p, 0) - 1) < 1e-6);
});

test("predict は次元が違うとエラー", () => {
  assert.throws(() => predict(fakeTagger.heads.garment, new Float32Array(4)));
});

test("interpret は種類・季節・色と自信の有無を返す", () => {
  const r = interpret(fakeTagger, Float32Array.from([5, 0, 1]));
  assert.equal(r.garments[0].key, "wool_coat");
  assert.equal(r.garments[0].category, "outer");
  assert.deepEqual(r.garments[0].seasons, ["heavy", "winter"]);
  assert.equal(r.colors[0].key, "navy");
  assert.equal(r.confident, true);
  assert.equal(suggestName(r.garments[0], r.colors[0]), "ネイビーのウールコート");
});

test("どのクラスにも近くないときは自信なし", () => {
  const r = interpret(fakeTagger, Float32Array.from([1, 1, 1]));
  assert.equal(r.confident, false);
});

test("1 位と 2 位が拮抗しているときは自信なし", () => {
  // wool_coat と tshirt のちょうど中間
  const r = interpret(fakeTagger, Float32Array.from([1, 1, 0]));
  assert.equal(r.garments[0].p > 0.45, true);
  assert.equal(r.confident, false);
});

test("tagger.json の confidence で基準を変えられる", () => {
  const t = { ...fakeTagger, confidence: { min_p: 1.5, min_margin: 0 } }; // 確率は 1 を超えないので必ず自信なし
  assert.equal(interpret(t, Float32Array.from([5, 0, 1])).confident, false);
});

test("l2normalize", () => {
  const v = l2normalize([3, 4]);
  assert.ok(Math.abs(v[0] - 0.6) < 1e-6 && Math.abs(v[1] - 0.8) < 1e-6);
});
