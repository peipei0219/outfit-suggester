// 気温帯ごとの服装候補（シーン別）
export const TEMP_BANDS = [
  { max: 5,  label: "かなり寒い" , key: "freezing" },
  { max: 12, label: "寒い",        key: "cold" },
  { max: 18, label: "肌寒い",      key: "cool" },
  { max: 24, label: "過ごしやすい", key: "mild" },
  { max: 28, label: "暖かい",      key: "warm" },
  { max: Infinity, label: "暑い",  key: "hot" },
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
  cloudy: ["折りたたみ傘（念のため）"],
  rainy:  ["傘", "レインブーツ／防水シューズ", "撥水アウター"],
  snowy:  ["滑りにくいブーツ", "手袋", "マフラー"],
};

export function getBand(temp) {
  return TEMP_BANDS.find((b) => temp <= b.max);
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function suggest({ temp, weather, scene }) {
  const band = getBand(temp);
  const set = OUTFITS[scene][band.key];
  const items = [...WEATHER_ITEMS[weather]];
  if (band.key === "hot" && weather === "sunny") items.push("日焼け止め");
  return {
    band: band.label,
    outer: pick(set.outer),
    tops: pick(set.tops),
    bottoms: pick(set.bottoms),
    items,
  };
}
