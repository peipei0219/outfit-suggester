"""埋め込みベクトルから分類する部分（numpy のみ・モデル非依存）。

ブラウザ側（src/tagger-core.js）と同じ計算をする。
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

import numpy as np

# CLIP の学習済み logit_scale（= exp(4.6052) ≈ 100）
CLIP_LOGIT_SCALE = 100.0

TextEncoder = Callable[[list[str]], np.ndarray]


def l2_normalize(x: np.ndarray, axis: int = -1) -> np.ndarray:
    norm = np.linalg.norm(x, axis=axis, keepdims=True)
    return x / np.clip(norm, 1e-12, None)


@dataclass
class Head:
    """1 つの分類タスク（服の種類 / 色）のクラス重み。"""

    labels: list[str]
    weights: np.ndarray  # (num_classes, dim)、各行は L2 正規化済み
    scale: float = CLIP_LOGIT_SCALE

    def logits(self, image_embeds: np.ndarray) -> np.ndarray:
        return self.scale * l2_normalize(image_embeds) @ self.weights.T

    def predict_proba(self, image_embeds: np.ndarray) -> np.ndarray:
        return softmax(self.logits(image_embeds))


def softmax(x: np.ndarray, axis: int = -1) -> np.ndarray:
    z = x - x.max(axis=axis, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=axis, keepdims=True)


def build_zeroshot_head(
    labels: Sequence[str],
    prompts_per_label: Sequence[Sequence[str]],
    encode_text: TextEncoder,
) -> Head:
    """各クラスのプロンプトを埋め込み、正規化 → 平均 → 再正規化してクラス重みにする。"""
    if len(labels) != len(prompts_per_label):
        raise ValueError("labels and prompts_per_label must have the same length")
    rows = []
    for prompts in prompts_per_label:
        emb = l2_normalize(np.asarray(encode_text(list(prompts)), dtype=np.float32))
        rows.append(l2_normalize(emb.mean(axis=0)))
    return Head(labels=list(labels), weights=np.stack(rows).astype(np.float32))


DEFAULT_CONFIDENCE = {"min_p": 0.5, "min_margin": 0.25}


def is_confident(proba: np.ndarray, min_p: float, min_margin: float) -> np.ndarray:
    """1 位の確率が min_p 以上かつ 2 位との差が min_margin 以上か（ブラウザの isConfident と同じ）。"""
    top2 = -np.sort(-proba, axis=-1)[..., :2]
    return (top2[..., 0] >= min_p) & (top2[..., 0] - top2[..., 1] >= min_margin)


def topk(proba: np.ndarray, labels: Sequence[str], k: int = 3) -> list[tuple[str, float]]:
    idx = np.argsort(-proba)[:k]
    return [(labels[i], float(proba[i])) for i in idx]
