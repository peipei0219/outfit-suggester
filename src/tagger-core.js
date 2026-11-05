// 画像埋め込み → 服の種類・色の確率（ml/src/outfit_ml/classifier.py と同じ計算）
// DOM やモデルに依存しない純粋な関数だけを置く（node --test でテストする）

// float16（リトルエンディアン）の base64 を Float32Array に戻す
export function decodeF16(base64, length) {
  const bin = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const h = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    const sign = h & 0x8000 ? -1 : 1;
    const exp = (h >> 10) & 0x1f;
    const frac = h & 0x3ff;
    out[i] =
      exp === 0 ? sign * 2 ** -14 * (frac / 1024)
      : exp === 31 ? (frac ? NaN : sign * Infinity)
      : sign * 2 ** (exp - 15) * (1 + frac / 1024);
  }
  return out;
}

export function loadTagger(json) {
  if (json.format !== 1) throw new Error(`未対応の分類器ファイルです (format ${json.format})`);
  const heads = {};
  for (const [name, h] of Object.entries(json.heads)) {
    heads[name] = { labels: h.labels, dim: h.dim, scale: h.scale, weights: decodeF16(h.weights_f16, h.labels.length * h.dim) };
  }
  return {
    garments: json.garments, colors: json.colors, heads, imageModel: json.image_model,
    confidence: { ...DEFAULT_CONFIDENCE, ...json.confidence }, // 評価データで決めた値があれば使う
  };
}

export function l2normalize(v) {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return Float32Array.from(v, (x) => x / n);
}

// 確率の高い順に [{ key, p }]
export function predict(head, embedding) {
  if (embedding.length !== head.dim) throw new Error(`埋め込みの次元が違います (${embedding.length} ≠ ${head.dim})`);
  const e = l2normalize(embedding);
  const logits = head.labels.map((_, c) => {
    let dot = 0;
    const off = c * head.dim;
    for (let i = 0; i < head.dim; i++) dot += head.weights[off + i] * e[i];
    return head.scale * dot;
  });
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return head.labels.map((key, i) => ({ key, p: exps[i] / sum })).sort((a, b) => b.p - a.p);
}

// 自動入力してよいか: 1 位の確率が min_p 以上、かつ 2 位との差が min_margin 以上
export const DEFAULT_CONFIDENCE = { min_p: 0.5, min_margin: 0.25 };

export function isConfident(ranked, { min_p, min_margin } = DEFAULT_CONFIDENCE) {
  const [first, second] = ranked;
  return first.p >= min_p && first.p - (second?.p ?? 0) >= min_margin;
}

// 画像埋め込みから、登録フォームに入れる候補を作る
export function interpret(tagger, embedding, k = 3) {
  const garments = predict(tagger.heads.garment, embedding).slice(0, k)
    .map(({ key, p }) => ({ key, p, ...tagger.garments[key] }));
  const colors = predict(tagger.heads.color, embedding).slice(0, k)
    .map(({ key, p }) => ({ key, p, ...tagger.colors[key] }));
  return { garments, colors, confident: isConfident(garments, tagger.confidence) };
}

// 推定結果から服の名前を作る（例: 「ネイビーのウールコート」）
export const suggestName = (garment, color) => (color ? `${color.ja}の${garment.ja}` : garment.ja);
