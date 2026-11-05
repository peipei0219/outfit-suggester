"""ブラウザ用の分類器ファイル（model/tagger.json）を作る。

重みは float16 を base64 にして容量を抑える（約 44 クラス × 512 次元 ≈ 60KB）。
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import __version__, prompts, taxonomy
from .classifier import DEFAULT_CONFIDENCE, Head, TextEncoder, build_zeroshot_head

FORMAT_VERSION = 1


def encode_f16(x: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(x, dtype="<f2").tobytes()).decode("ascii")


def decode_f16(s: str, shape: tuple[int, ...]) -> np.ndarray:
    return np.frombuffer(base64.b64decode(s), dtype="<f2").astype(np.float32).reshape(shape)


def build_heads(
    encode_text: TextEncoder,
    garment_templates: tuple[str, ...] = prompts.GARMENT_TEMPLATES,
    color_templates: tuple[str, ...] = prompts.COLOR_TEMPLATES,
) -> dict[str, Head]:
    taxonomy.validate()
    garment = build_zeroshot_head(
        [g.key for g in taxonomy.GARMENTS],
        [prompts.expand(g.en, garment_templates) for g in taxonomy.GARMENTS],
        encode_text,
    )
    color = build_zeroshot_head(
        [c.key for c in taxonomy.COLORS],
        [prompts.expand(c.en, color_templates) for c in taxonomy.COLORS],
        encode_text,
    )
    return {"garment": garment, "color": color}


def head_to_json(head: Head) -> dict:
    d = {
        "labels": head.labels,
        "dim": int(head.weights.shape[1]),
        "scale": head.scale,
        "weights_f16": encode_f16(head.weights),
    }
    if head.bias is not None:
        d["bias"] = [round(float(b), 4) for b in head.bias]
    return d


def head_from_json(d: dict) -> Head:
    return Head(
        labels=list(d["labels"]),
        weights=decode_f16(d["weights_f16"], (len(d["labels"]), d["dim"])),
        scale=float(d["scale"]),
        bias=np.asarray(d["bias"], dtype=np.float32) if "bias" in d else None,
    )


def apply_calibration(heads: dict[str, Head], calibration: dict | None) -> dict[str, Head]:
    """evaluate が dev で求めた平均画像埋め込みと alpha でキャリブレーションする。"""
    if not calibration:
        return heads
    mean = np.asarray(calibration["mean_image_embed"], dtype=np.float32)
    return {name: h.calibrated(mean, calibration["alpha"]) for name, h in heads.items()}


def to_json(heads: dict[str, Head], model_id: str, browser_model_id: str, confidence: dict | None = None) -> dict:
    return {
        "format": FORMAT_VERSION,
        "generator": f"outfit-ml {__version__}",
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "text_model": model_id,
        "image_model": browser_model_id,
        "garments": {
            g.key: {"ja": g.ja, "category": g.category, "seasons": list(g.seasons)} for g in taxonomy.GARMENTS
        },
        "colors": {c.key: {"ja": c.ja} for c in taxonomy.COLORS},
        "heads": {name: head_to_json(h) for name, h in heads.items()},
        "confidence": confidence or DEFAULT_CONFIDENCE,
    }


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
