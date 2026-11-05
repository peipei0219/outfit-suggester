import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest, getBand, TEMP_BANDS, OUTFITS } from "../src/rules.js";

test("気温帯の境界", () => {
  assert.equal(getBand(5).key, "freezing");
  assert.equal(getBand(6).key, "cold");
  assert.equal(getBand(24).key, "mild");
  assert.equal(getBand(40).key, "hot");
});

test("すべてのシーン × 気温帯に候補がある", () => {
  for (const scene of Object.keys(OUTFITS)) {
    for (const band of TEMP_BANDS) {
      const set = OUTFITS[scene][band.key];
      for (const slot of ["outer", "tops", "bottoms"]) assert.ok(set[slot].length > 0, `${scene}/${band.key}/${slot}`);
    }
  }
});

const closet = [
  { id: "a", name: "ネイビーのコート", category: "outer", seasons: ["winter"], scenes: ["office"] },
  { id: "b", name: "麻のシャツ", category: "tops", seasons: ["summer"], scenes: ["office"] },
];

test("条件に合う手持ちの服を優先する", () => {
  const s = suggest({ temp: 10, weather: "sunny", scene: "office", closet });
  assert.deepEqual(s.outer, { name: "ネイビーのコート", owned: true, id: "a" });
  assert.equal(s.tops.owned, false); // 麻のシャツは夏用なので選ばれない
});

test("降水確率と寒暖差のアドバイス", () => {
  const s = suggest({ temp: 15, weather: "cloudy", scene: "casual", rainChance: 60, range: { max: 20, min: 10 } });
  assert.ok(s.items.includes("折りたたみ傘"));
  assert.equal(s.tips.length, 2);
});

test("「別の候補」は前回と違うものを選ぶ", () => {
  const prev = suggest({ temp: 10, weather: "sunny", scene: "casual" });
  for (let i = 0; i < 20; i++) {
    const next = suggest({ temp: 10, weather: "sunny", scene: "casual", prev });
    assert.notEqual(next.outer.name, prev.outer.name);
  }
});
