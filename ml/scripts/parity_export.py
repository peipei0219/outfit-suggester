"""Python とブラウザ（transformers.js）の画像埋め込みが一致するか確かめるための材料を書き出す。

使い方:
  uv run python scripts/parity_export.py /tmp/parity
  (cd /tmp/parity && npm install --no-save @huggingface/transformers@3.0.2 && node <repo>/ml/scripts/parity.mjs)

テストデータの画像をアプリと同じ長辺 480px にして保存し、Python（ONNX Runtime）の埋め込みと予測を python.json に残す。
"""

import json
import sys
from pathlib import Path

from PIL import Image

from outfit_ml import evaluate, export
from outfit_ml.cli import REPO_ROOT
from outfit_ml.clip import ClipEncoder

out = Path(sys.argv[1])
(out / "imgs").mkdir(parents=True, exist_ok=True)
ds = evaluate.load_samples(3, 1, "test")
imgs = [img.convert("RGB").resize((360, 480), Image.LANCZOS) for img in ds["image"]]
embeds = ClipEncoder().encode_images(imgs)
head = export.head_from_json(json.loads((REPO_ROOT / "model" / "tagger.json").read_text())["heads"]["garment"])
rows = []
for i, (img, e, t) in enumerate(zip(imgs, embeds, ds["articleType"], strict=True)):
    img.save(out / "imgs" / f"{i:03d}.png")
    p = head.predict_proba(e[None])[0]
    rows.append(
        {
            "file": f"{i:03d}.png",
            "articleType": t,
            "py_top1": head.labels[int(p.argmax())],
            "py_p": float(p.max()),
            "py_embed": e.tolist(),
        }
    )
(out / "python.json").write_text(json.dumps(rows))
print(f"wrote {len(rows)} images to {out}")
