// コーデの相性スコア（ml/src/outfit_ml/compat/models.py と同じ計算）
// 入力は服ごとの CLIP 画像埋め込み（L2 正規化して使う）
import { decodeF16, l2normalize } from "./tagger-core.js";

const PAIR_ORDER = ["outer", "tops", "bottoms"];

export function pairType(a, b) {
  if (a === b) return null;
  const [x, y] = [a, b].sort((p, q) => PAIR_ORDER.indexOf(p) - PAIR_ORDER.indexOf(q));
  return `${x}/${y}`;
}

export function loadCompat(json) {
  if (json.format !== 1) throw new Error(`未対応の相性モデルです (format ${json.format})`);
  const pairTypes = json.pair_types.map((p) => p.join("/"));
  const model = { type: json.type, pairTypes, levels: json.levels };
  if (json.type === "logistic") {
    model.logistic = Object.fromEntries(
      Object.entries(json.logistic).map(([pt, { w_f16, dim, b }]) => [pt, { w: decodeF16(w_f16, dim), b }])
    );
  } else if (json.type === "mlp") {
    model.mlp = json.mlp.map(({ w_f16, shape, b }) => ({ w: decodeF16(w_f16, shape[0] * shape[1]), rows: shape[0], cols: shape[1], b }));
  } else {
    throw new Error(`未対応の相性モデルの種類です (${json.type})`);
  }
  // 入力の埋め込みの次元（特徴は [a⊙b, |a−b|] なので 2 倍になっている）
  model.embedDim = json.type === "logistic"
    ? Object.values(model.logistic)[0].w.length / 2
    : (model.mlp[0].rows - pairTypes.length) / 2;
  return model;
}

// [a⊙b, |a−b|]（順序によらない組の特徴）
function pairFeatures(a, b) {
  const d = a.length, f = new Float32Array(2 * d);
  for (let i = 0; i < d; i++) {
    f[i] = a[i] * b[i];
    f[d + i] = Math.abs(a[i] - b[i]);
  }
  return f;
}

// 2 つの服の相性（ロジット）。a, b は L2 正規化済み、pt は "outer/tops" など
export function pairScore(model, a, b, pt) {
  const f = pairFeatures(a, b);
  if (model.type === "logistic") {
    const { w, b: bias } = model.logistic[pt];
    let s = bias;
    for (let i = 0; i < f.length; i++) s += w[i] * f[i];
    return s;
  }
  // MLP: 入力 = 特徴 + 種類の組の one-hot、隠れ層は ReLU
  let h = new Float32Array(f.length + model.pairTypes.length);
  h.set(f);
  h[f.length + model.pairTypes.indexOf(pt)] = 1;
  model.mlp.forEach((layer, k) => {
    const out = new Float32Array(layer.cols);
    for (let j = 0; j < layer.cols; j++) out[j] = layer.b[j];
    for (let i = 0; i < layer.rows; i++) {
      const x = h[i];
      if (x === 0) continue;
      const row = i * layer.cols;
      for (let j = 0; j < layer.cols; j++) out[j] += x * layer.w[row + j];
    }
    if (k < model.mlp.length - 1) for (let j = 0; j < out.length; j++) out[j] = Math.max(0, out[j]);
    h = out;
  });
  return h[0];
}

// コーデ全体のスコア = 別の種類どうしの組のスコアの平均。items: [{ category, embedding }]
export function outfitScore(model, items) {
  // 画像モデルが変わったなどで次元が合わない埋め込みは使わない
  items = items.filter((i) => i.embedding && i.embedding.length === model.embedDim);
  const normed = items.map((i) => ({ category: i.category, e: l2normalize(i.embedding) }));
  const scores = [];
  for (let i = 0; i < normed.length; i++) {
    for (let j = i + 1; j < normed.length; j++) {
      const pt = pairType(normed[i].category, normed[j].category);
      if (!pt) continue;
      const [x, y] = PAIR_ORDER.indexOf(normed[i].category) < PAIR_ORDER.indexOf(normed[j].category) ? [normed[i], normed[j]] : [normed[j], normed[i]];
      scores.push(pairScore(model, x.e, y.e, pt));
    }
  }
  return scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null;
}

// 表示用の 3 段階（基準は Python で valid のコーデから決めた値）
export function compatLevel(model, score) {
  if (score == null) return null;
  return score >= model.levels.good ? "good" : score < model.levels.poor ? "poor" : "ok";
}
