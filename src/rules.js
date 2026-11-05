// 気温帯ごとの服装候補（シーン別）
export const TEMP_BANDS = [
  { max: 5,  label: "かなり寒い",   key: "freezing", verdict: "しっかり防寒したい日" },
  { max: 12, label: "寒い",         key: "cold",     verdict: "コートが活躍する日" },
  { max: 18, label: "肌寒い",       key: "cool",     verdict: "羽織りものが一枚ほしい日" },
  { max: 24, label: "過ごしやすい", key: "mild",     verdict: "軽やかに過ごせる日" },
  { max: 28, label: "暖かい",       key: "warm",     verdict: "半袖でちょうどいい日" },
  { max: Infinity, label: "暑い",   key: "hot",      verdict: "涼しさを優先したい日" },
];

export const OUTFITS = {
  casual: {
    freezing: { outer: ["ダウンジャケット", "厚手のコート"], tops: ["ニット", "裏起毛スウェット"], bottoms: ["裏起毛パンツ", "デニム＋タイツ"] },
    cold:     { outer: ["ウールコート", "中綿ジャケット"], tops: ["ニット", "スウェット"], bottoms: ["デニム", "コーデュロイパンツ"] },
    cool:     { outer: ["ライトジャケット", "カーディガン"], tops: ["長袖Tシャツ", "シャツ"], bottoms: ["チノパン", "デニム"] },
    mild:     { outer: ["薄手のシャツ羽織り", "なし"], tops: ["長袖Tシャツ", "ロンT"], bottoms: ["チノパン", "ロングスカート"] },
    warm:     { outer: ["なし"], tops: ["半袖Tシャツ", "ポロシャツ"], bottoms: ["ワイドパンツ", "デニム"] },
    hot:      { outer: ["なし"], tops: ["半袖Tシャツ", "リネンシャツ"], bottoms: ["ショートパンツ", "リネンパンツ"] },
  },
  office: {
    freezing: { outer: ["チェスターコート", "ダウンコート"], tops: ["シャツ＋ニット", "タートルネック"], bottoms: ["ウールスラックス"] },
    cold:     { outer: ["ステンカラーコート"], tops: ["シャツ＋カーディガン"], bottoms: ["スラックス"] },
    cool:     { outer: ["ジャケット", "トレンチコート"], tops: ["シャツ", "ブラウス"], bottoms: ["スラックス", "タイトスカート"] },
    mild:     { outer: ["ジャケット"], tops: ["シャツ", "ブラウス"], bottoms: ["スラックス"] },
    warm:     { outer: ["なし（クールビズ）"], tops: ["半袖シャツ", "ブラウス"], bottoms: ["スラックス"] },
    hot:      { outer: ["なし（クールビズ）"], tops: ["半袖シャツ", "接触冷感ブラウス"], bottoms: ["薄手スラックス"] },
  },
  formal: {
    freezing: { outer: ["ウールコート"], tops: ["スーツ／ワンピース"], bottoms: ["スーツパンツ"] },
    cold:     { outer: ["ウールコート"], tops: ["スーツ／ワンピース"], bottoms: ["スーツパンツ"] },
    cool:     { outer: ["スプリングコート"], tops: ["スーツ／ワンピース"], bottoms: ["スーツパンツ"] },
    mild:     { outer: ["なし"], tops: ["スーツ／ワンピース"], bottoms: ["スーツパンツ"] },
    warm:     { outer: ["なし"], tops: ["サマースーツ／ワンピース"], bottoms: ["スーツパンツ"] },
    hot:      { outer: ["なし"], tops: ["サマースーツ／ワンピース"], bottoms: ["スーツパンツ"] },
  },
  sport: {
    freezing: { outer: ["ウィンドブレーカー＋フリース"], tops: ["保温インナー＋長袖"], bottoms: ["タイツ＋ジャージ"] },
    cold:     { outer: ["ウィンドブレーカー"], tops: ["長袖ドライシャツ"], bottoms: ["ジャージパンツ"] },
    cool:     { outer: ["薄手ウィンドブレーカー"], tops: ["長袖ドライシャツ"], bottoms: ["ジャージパンツ", "ショーツ＋タイツ"] },
    mild:     { outer: ["なし"], tops: ["ドライTシャツ"], bottoms: ["ショーツ"] },
    warm:     { outer: ["なし"], tops: ["ドライTシャツ"], bottoms: ["ショーツ"] },
    hot:      { outer: ["なし"], tops: ["ノースリーブ／ドライTシャツ"], bottoms: ["ショーツ"] },
  },
};

export const WEATHER_ITEMS = {
  sunny:  ["サングラス", "帽子"],
  cloudy: [],
  rainy:  ["傘", "レインブーツ／防水シューズ", "撥水アウター"],
  snowy:  ["滑りにくいブーツ", "手袋", "マフラー"],
};

// 気温帯 → クローゼット登録時の季節区分
export const BAND_TO_SEASON = {
  freezing: "heavy",
  cold: "winter",
  cool: "mid",
  mild: "mid",
  warm: "summer",
  hot: "summer",
};

export function getBand(temp) {
  return TEMP_BANDS.find((b) => temp <= b.max);
}

// 前回と違うものを優先してランダムに選ぶ
function pick(arr, prev) {
  const pool = arr.length > 1 ? arr.filter((x) => x !== prev) : arr;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * @param {object} p
 * @param {number} p.temp 気温（℃）
 * @param {string} p.weather sunny | cloudy | rainy | snowy
 * @param {string} p.scene casual | office | formal | sport
 * @param {Array}  [p.closet] 手持ちの服
 * @param {{max:number,min:number}} [p.range] 今日の最高・最低気温
 * @param {number} [p.rainChance] 降水確率（%）
 * @param {object} [p.prev] 前回の提案（「別の候補」で同じものを避ける）
 * @param {(items: object[]) => number|null} [p.scoreOutfit] 手持ちの服の組み合わせの相性スコア
 * @param {() => number} [p.random] 乱数（テスト用）
 */
export function suggest({ temp, weather, scene, closet = [], range, rainChance, prev, scoreOutfit, random = Math.random }) {
  const band = getBand(temp);
  const season = BAND_TO_SEASON[band.key];
  const generic = OUTFITS[scene][band.key];
  const ownedFor = (category) =>
    closet.filter((i) => i.category === category && i.seasons.includes(season) && i.scenes.includes(scene));

  const combo = scoreOutfit ? chooseCombo(ownedFor, scoreOutfit, prev?.compat?.ids, random) : null;

  const slot = (category) => {
    if (combo?.items[category]) {
      const item = combo.items[category];
      return { name: item.name, owned: true, id: item.id };
    }
    const owned = ownedFor(category);
    if (owned.length) {
      const item = pick(owned, owned.find((i) => i.name === prev?.[category]?.name));
      return { name: item.name, owned: true, id: item.id };
    }
    return { name: pick(generic[category], prev?.[category]?.name), owned: false };
  };

  const items = [...WEATHER_ITEMS[weather]];
  const tips = [];
  if (band.key === "hot" && weather === "sunny") items.push("日焼け止め");
  if (weather !== "rainy" && weather !== "snowy" && rainChance >= 50) {
    items.push("折りたたみ傘");
    tips.push(`降水確率 ${rainChance}%。雨に備えましょう`);
  } else if (weather === "cloudy") {
    items.push("折りたたみ傘（念のため）");
  }
  if (range && range.max - range.min >= 8) {
    tips.push(`寒暖差 ${range.max - range.min}℃。脱ぎ着しやすい重ね着がおすすめ`);
  }

  return {
    band: band.label,
    bandKey: band.key,
    verdict: band.verdict,
    outer: slot("outer"),
    tops: slot("tops"),
    bottoms: slot("bottoms"),
    items,
    tips,
    compat: combo ? { score: combo.score, ids: combo.ids } : null,
  };
}

const SLOTS = ["outer", "tops", "bottoms"];
const MAX_PER_SLOT = 8; // 組み合わせが増えすぎないよう、各枠の候補を最大 8 着にする
const TOP_K = 5; // 相性の上位 5 通りから選ぶ（「別の候補」で変化をつけるため）
const TEMPERATURE = 0.3;

// 写真の特徴（embed）がある手持ちの服で、相性の良い組み合わせを選ぶ。2 枠以上そろわなければ null
export function chooseCombo(ownedFor, scoreOutfit, prevIds, random = Math.random) {
  const pools = {};
  for (const cat of SLOTS) {
    const withEmbed = ownedFor(cat).filter((i) => i.embed);
    if (withEmbed.length) pools[cat] = shuffle(withEmbed, random).slice(0, MAX_PER_SLOT);
  }
  const cats = Object.keys(pools);
  if (cats.length < 2) return null;

  let combos = [{}];
  for (const cat of cats) combos = combos.flatMap((c) => pools[cat].map((item) => ({ ...c, [cat]: item })));
  const scored = combos
    .map((items) => ({ items, score: scoreOutfit(Object.values(items)) }))
    .filter((c) => c.score != null)
    .map((c) => ({ ...c, ids: cats.map((k) => c.items[k].id).join("+") }))
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;

  let top = scored.slice(0, TOP_K);
  if (top.length > 1) top = top.filter((c) => c.ids !== prevIds);
  const max = top[0].score;
  const weights = top.map((c) => Math.exp((c.score - max) / TEMPERATURE));
  let r = random() * weights.reduce((s, w) => s + w, 0);
  for (let k = 0; k < top.length; k++) {
    r -= weights[k];
    if (r <= 0) return top[k];
  }
  return top[top.length - 1];
}

function shuffle(arr, random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
