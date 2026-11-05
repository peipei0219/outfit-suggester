"""Polyvore のアイテム画像を CLIP（ブラウザと同じ量子化 ONNX）で埋め込み、キャッシュする。"""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np

from ..classifier import l2_normalize
from . import polyvore

CACHE = Path(__file__).resolve().parents[3] / "data" / "polyvore_clip.npz"


def build_cache(path: Path = CACHE, batch: int = 256) -> None:
    from PIL import Image

    from ..clip import ClipEncoder

    ids = sorted(set().union(*(polyvore.load_split(s).items() for s in ("train", "valid", "test"))))
    done: dict[str, np.ndarray] = {}
    if path.exists():
        z = np.load(path)
        done = dict(zip(z["ids"].tolist(), z["embeds"], strict=True))
    todo = [i for i in ids if i not in done]
    print(f"items: {len(ids)}, cached: {len(done)}, to encode: {len(todo)}")
    enc = ClipEncoder()
    zf = polyvore.open_images()
    for k in range(0, len(todo), batch):
        chunk = todo[k : k + batch]
        imgs = [Image.open(io.BytesIO(zf.read(polyvore.find_image(zf, i)))).convert("RGB") for i in chunk]
        for i, e in zip(chunk, enc.encode_images(imgs), strict=True):
            done[i] = e
        if (k // batch) % 20 == 0 or k + batch >= len(todo):
            _save(path, done)
            print(f"  {min(k + batch, len(todo))}/{len(todo)}", flush=True)
    _save(path, done)


def _save(path: Path, done: dict[str, np.ndarray]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    keys = sorted(done)
    np.savez(path, ids=np.array(keys), embeds=np.stack([done[k] for k in keys]).astype(np.float32))


def load_cache(path: Path = CACHE) -> dict[str, np.ndarray]:
    z = np.load(path)
    embeds = l2_normalize(z["embeds"])
    return dict(zip(z["ids"].tolist(), embeds, strict=True))
