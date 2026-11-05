// ブラウザ（src/tagger.js）と同じ transformers.js の API・オプションで画像埋め込みを計算し、Python と比べる
// 実行は parity_export.py の出力ディレクトリで（README 参照）
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadTagger, interpret } from "../../src/tagger-core.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const rows = JSON.parse(readFileSync("python.json", "utf8"));
const tagger = loadTagger(JSON.parse(readFileSync(repo + "model/tagger.json", "utf8")));
const [processor, model] = await Promise.all([
  AutoProcessor.from_pretrained(tagger.imageModel),
  CLIPVisionModelWithProjection.from_pretrained(tagger.imageModel, { dtype: "q8" }),
]);
let agree = 0, cosSum = 0, cosMin = 1, disagreeConfident = 0;
for (const r of rows) {
  const image = await RawImage.fromBlob(new Blob([readFileSync("imgs/" + r.file)], { type: "image/png" }));
  const e = Float32Array.from((await model(await processor(image))).image_embeds.data);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < e.length; i++) { dot += e[i] * r.py_embed[i]; na += e[i] ** 2; nb += r.py_embed[i] ** 2; }
  const cos = dot / Math.sqrt(na * nb);
  cosSum += cos; cosMin = Math.min(cosMin, cos);
  const res = interpret(tagger, e);
  if (res.garments[0].key === r.py_top1) agree++;
  else if (res.confident) disagreeConfident++;
}
console.log(`images: ${rows.length}`);
console.log(`embedding cosine (JS vs Python): mean ${(cosSum / rows.length).toFixed(4)}, min ${cosMin.toFixed(4)}`);
console.log(`top-1 agreement: ${agree}/${rows.length}（不一致のうち自動入力されるもの: ${disagreeConfident}）`);
