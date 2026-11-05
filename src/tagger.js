// 端末内で CLIP（画像側）を動かして服を判定する
// モデル: Xenova/clip-vit-base-patch32（ONNX、8bit 量子化）を transformers.js で読み込む
import { loadTagger, interpret } from "./tagger-core.js";

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";
const TAGGER_URL = "model/tagger.json";

let taggerPromise = null;
let encoderPromise = null;

// 分類器ファイルがあれば読み込む（なければ null = 機能を出さない）
export function getTagger() {
  taggerPromise ??= fetch(TAGGER_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => (json ? loadTagger(json) : null))
    .catch(() => null);
  return taggerPromise;
}

async function getEncoder(modelId, onProgress) {
  encoderPromise ??= (async () => {
    const { AutoProcessor, CLIPVisionModelWithProjection, RawImage } = await import(TRANSFORMERS_URL);
    const files = new Map();
    const progress_callback = (e) => {
      if (e.status !== "progress" || !e.total) return;
      files.set(e.file, [e.loaded, e.total]);
      let loaded = 0, total = 0;
      for (const [l, t] of files.values()) { loaded += l; total += t; }
      onProgress?.({ loaded, total });
    };
    const [processor, model] = await Promise.all([
      AutoProcessor.from_pretrained(modelId, { progress_callback }),
      CLIPVisionModelWithProjection.from_pretrained(modelId, { dtype: "q8", progress_callback }),
    ]);
    return async (blob) => {
      const image = await RawImage.fromBlob(blob);
      const { image_embeds } = await model(await processor(image));
      return Float32Array.from(image_embeds.data);
    };
  })();
  try {
    return await encoderPromise;
  } catch (e) {
    encoderPromise = null; // 失敗したら次回やり直せるように
    throw e;
  }
}

// 写真を判定する。結果に画像埋め込み（相性の計算に使う）も含める
export async function analyzePhoto(blob, onProgress) {
  const tagger = await getTagger();
  if (!tagger) throw new Error("分類器ファイルがありません");
  const encode = await getEncoder(tagger.imageModel, onProgress);
  const embedding = await encode(blob);
  return { ...interpret(tagger, embedding), embedding };
}

// 画像埋め込みだけを計算する（モデルが端末に保存済みのときの裏側の処理用）
export async function embedPhoto(blob) {
  const tagger = await getTagger();
  if (!tagger) throw new Error("分類器ファイルがありません");
  const encode = await getEncoder(tagger.imageModel);
  return encode(blob);
}
