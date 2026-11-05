"""CLIP のゼロショット分類に使うプロンプト。

1 つのクラスに対して複数の言い回し（テンプレート × 呼び方）を作り、
テキスト埋め込みを平均する「プロンプトアンサンブル」を使う。
CLIP 論文でも単一テンプレートより精度が上がることが報告されている。
"""

from __future__ import annotations

GARMENT_TEMPLATES: tuple[str, ...] = (
    "a photo of a {}.",
    "a product photo of a {}.",
    "a photo of a {} laid flat.",
    "a photo of a person wearing a {}.",
    "a close-up photo of a {}.",
)

COLOR_TEMPLATES: tuple[str, ...] = (
    "a photo of {} clothing.",
    "a photo of a {} garment.",
    "a product photo of {} clothes.",
)

# 評価で「アンサンブルの効果」を比べるための単一テンプレート
SINGLE_GARMENT_TEMPLATE: tuple[str, ...] = ("a photo of a {}.",)
SINGLE_COLOR_TEMPLATE: tuple[str, ...] = ("a photo of {} clothing.",)


def expand(names: tuple[str, ...], templates: tuple[str, ...]) -> list[str]:
    """呼び方 × テンプレートの全組み合わせのプロンプトを返す。"""
    return [t.format(n) for n in names for t in templates]
