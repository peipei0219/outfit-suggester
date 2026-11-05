import { test } from "node:test";
import assert from "node:assert/strict";
import { toKeywords, encodeShiftJIS, SHOPS } from "../src/shops.js";

test("服の名前を検索ワードに分解する", () => {
  assert.deepEqual(toKeywords("シャツ＋カーディガン"), ["シャツ", "カーディガン"]);
  assert.deepEqual(toKeywords("スーツ／ワンピース"), ["スーツ", "ワンピース"]);
  assert.deepEqual(toKeywords("なし（クールビズ）"), []);
});

test("Shift_JIS エンコード", () => {
  assert.equal(encodeShiftJIS("ニット"), "%83%6A%83%62%83%67");
  assert.equal(encodeShiftJIS("ドライTシャツ"), "%83%68%83%89%83%43T%83%56%83%83%83%63");
});

test("各ショップの検索 URL", () => {
  const [uniqlo, zozo] = SHOPS;
  assert.equal(uniqlo.url("ニット"), "https://www.uniqlo.com/jp/ja/search?q=%E3%83%8B%E3%83%83%E3%83%88");
  assert.equal(zozo.url("ニット"), "https://zozo.jp/search/?p_keyv=%83%6A%83%62%83%67");
});
