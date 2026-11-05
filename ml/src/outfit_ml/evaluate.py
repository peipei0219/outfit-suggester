"""公開データセットでゼロショット分類の精度を測る。

データセット: ashraq/fashion-product-images-small（Hugging Face）
  ファッション EC の商品画像約 4.4 万枚。articleType（服の種類）と baseColour（色）のラベル付き。
データセットのラベルはこのアプリの分類と 1 対 1 ではないため、
「正解とみなす候補の集合」に変換して評価する（例: Jackets → ダウン/デニム/レザー… のどれでも正解）。
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

import numpy as np

from .classifier import Head, is_confident
from .taxonomy import GARMENT_BY_KEY

# データセットの articleType → 正解とみなすアプリの服の種類
ARTICLE_TYPE_MAP: dict[str, tuple[str, ...]] = {
    "Tshirts": ("tshirt", "long_tee", "polo"),
    "Shirts": ("shirt",),
    "Tops": ("blouse", "tshirt", "tank_top"),
    "Sweatshirts": ("sweatshirt",),
    "Sweaters": ("knit", "turtleneck", "cardigan"),
    "Jackets": ("down_jacket", "blazer", "denim_jacket", "leather_jacket", "windbreaker", "fleece"),
    "Blazers": ("blazer",),
    "Rain Jacket": ("windbreaker",),
    "Shrug": ("cardigan",),
    "Dresses": ("dress",),
    "Jeans": ("jeans",),
    "Trousers": ("slacks", "chinos", "wide_pants"),
    "Track Pants": ("track_pants",),
    "Shorts": ("shorts",),
    "Skirts": ("skirt", "long_skirt"),
    "Leggings": ("leggings",),
}

# データセットの baseColour → 正解とみなすアプリの色
BASE_COLOUR_MAP: dict[str, tuple[str, ...]] = {
    "Black": ("black",),
    "White": ("white",),
    "Off White": ("white", "beige"),
    "Grey": ("grey",),
    "Grey Melange": ("grey",),
    "Charcoal": ("grey", "black"),
    "Silver": ("grey",),
    "Navy Blue": ("navy",),
    "Blue": ("blue", "light_blue"),
    "Turquoise Blue": ("blue", "light_blue"),
    "Beige": ("beige",),
    "Cream": ("beige", "white"),
    "Khaki": ("khaki", "beige"),
    "Olive": ("khaki", "green"),
    "Brown": ("brown",),
    "Coffee Brown": ("brown",),
    "Tan": ("beige", "brown"),
    "Green": ("green",),
    "Sea Green": ("green",),
    "Red": ("red",),
    "Maroon": ("burgundy", "red"),
    "Burgundy": ("burgundy",),
    "Pink": ("pink",),
    "Rose": ("pink",),
    "Peach": ("pink", "orange"),
    "Yellow": ("yellow",),
    "Mustard": ("yellow",),
    "Purple": ("purple",),
    "Lavender": ("purple",),
    "Magenta": ("pink", "purple"),
    "Orange": ("orange",),
    "Rust": ("orange", "brown"),
}


@dataclass
class Metrics:
    n: int = 0
    top1: int = 0
    top3: int = 0
    category: int = 0  # 服の種類のみ: 種類（アウター/トップス/ボトムス）が合っているか
    per_class: dict[str, list[int]] = field(default_factory=lambda: defaultdict(lambda: [0, 0]))
    confusions: Counter = field(default_factory=Counter)

    def as_dict(self) -> dict:
        d = {"n": self.n, "top1": self.top1 / max(self.n, 1), "top3": self.top3 / max(self.n, 1)}
        if self.category:
            d["category"] = self.category / max(self.n, 1)
        return d


def score(
    head: Head,
    image_embeds: np.ndarray,
    gold: list[tuple[str, tuple[str, ...]]],
    with_category: bool = False,
) -> Metrics:
    """gold: (データセットのラベル, 正解とみなすキーの集合) のリスト。"""
    proba = head.predict_proba(image_embeds)
    order = np.argsort(-proba, axis=1)
    m = Metrics()
    for row, (raw, ok) in zip(order, gold, strict=True):
        preds = [head.labels[i] for i in row[:3]]
        hit1 = preds[0] in ok
        m.n += 1
        m.top1 += hit1
        m.top3 += any(p in ok for p in preds)
        m.per_class[raw][0] += hit1
        m.per_class[raw][1] += 1
        if not hit1:
            m.confusions[(raw, preds[0])] += 1
        if with_category:
            cats = {GARMENT_BY_KEY[k].category for k in ok}
            m.category += GARMENT_BY_KEY[preds[0]].category in cats
    return m


def coverage_table(
    head: Head, image_embeds: np.ndarray, gold: list[tuple[str, tuple[str, ...]]], min_margins=(0.0, 0.1, 0.25, 0.4)
) -> list[dict]:
    """自動入力の基準ごとに「自動入力される割合」と「そのときの正解率」を出す。

    自動入力は間違えるとユーザーが直す手間になるので、正解率と自動入力率のバランスで基準を選ぶ。
    """
    proba = head.predict_proba(image_embeds)
    hit = np.array([head.labels[i] in ok for i, (_, ok) in zip(proba.argmax(axis=1), gold, strict=True)])
    rows = []
    for min_p in (0.3, 0.5, 0.7):
        for min_margin in min_margins:
            mask = is_confident(proba, min_p, min_margin)
            rows.append(
                {
                    "min_p": min_p,
                    "min_margin": min_margin,
                    "coverage": float(mask.mean()),
                    "accuracy": float(hit[mask].mean()) if mask.any() else float("nan"),
                }
            )
    return rows


def load_samples(per_class: int, seed: int = 0, dataset_id: str = "ashraq/fashion-product-images-small"):
    """各 articleType から最大 per_class 枚ずつ取り出す（クラスの偏りをならすため）。"""
    from datasets import load_dataset

    ds = load_dataset(dataset_id, split="train")
    ds = ds.filter(lambda t: t in ARTICLE_TYPE_MAP, input_columns="articleType")
    rng = np.random.default_rng(seed)
    by_type: dict[str, list[int]] = defaultdict(list)
    for i, t in enumerate(ds["articleType"]):
        by_type[t].append(i)
    picked = []
    for idx in by_type.values():
        picked.extend(rng.permutation(idx)[:per_class].tolist())
    return ds.select(sorted(picked))


def report_markdown(results: dict[str, dict[str, Metrics]], meta: dict, coverage: list[dict] | None = None) -> str:
    lines = [
        "# CLIP ゼロショット分類の評価",
        "",
        f"- データセット: `{meta['dataset']}`（各クラス最大 {meta['per_class']} 枚、seed={meta['seed']}）",
        f"- モデル: `{meta['model']}`",
        "",
        "## 結果",
        "",
        "| タスク | プロンプト | 件数 | Top-1 | Top-3 | 種類の正解率 |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for task, by_variant in results.items():
        for variant, m in by_variant.items():
            d = m.as_dict()
            cat = f"{d['category']:.1%}" if "category" in d else "-"
            lines.append(f"| {task} | {variant} | {d['n']} | {d['top1']:.1%} | {d['top3']:.1%} | {cat} |")
    for task, by_variant in results.items():
        m = by_variant["ensemble"]
        lines += [
            "",
            f"## {task}: クラス別 Top-1（アンサンブル）",
            "",
            "| データセットのラベル | 件数 | Top-1 |",
            "|---|---:|---:|",
        ]
        for raw, (hit, n) in sorted(m.per_class.items(), key=lambda kv: kv[1][0] / kv[1][1]):
            lines.append(f"| {raw} | {n} | {hit / n:.1%} |")
        lines += [
            "",
            f"よくある間違い（{task}）: " + "、".join(f"{a}→{b}（{c}件）" for (a, b), c in m.confusions.most_common(5)),
        ]
    if coverage:
        lines += [
            "",
            "## 自動入力の基準（服の種類・アンサンブル）",
            "",
            "| 1位の確率 ≥ | 2位との差 ≥ | 自動入力される割合 | そのときの正解率 |",
            "|---:|---:|---:|---:|",
        ]
        lines += [f"| {r['min_p']} | {r['min_margin']} | {r['coverage']:.1%} | {r['accuracy']:.1%} |" for r in coverage]
    return "\n".join(lines) + "\n"
