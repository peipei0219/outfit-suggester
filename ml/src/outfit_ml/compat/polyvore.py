"""Polyvore Outfits（Vasileva et al., ECCV 2018）の読み込み。

公式: https://huggingface.co/datasets/mvasil/polyvore-outfits （CC BY 4.0、要ログイン）
このコードは同じファイルを再配布しているミラー Stylique/Polyvore を使う。
disjoint 分割のファイル（コーデ・FITB・相性判定）は公式と SHA-256 が一致することを確認済み（README 参照）。

disjoint 分割: train / valid / test でアイテムが重ならない。未知の服への汎化を測れる。
"""

from __future__ import annotations

import json
import zipfile
from dataclasses import dataclass
from functools import cache
from pathlib import Path

MIRROR = "Stylique/Polyvore"
OFFICIAL = "mvasil/polyvore-outfits"

# Polyvore の semantic_category → アプリの種類（closet.js の CATEGORIES）
CATEGORY_MAP = {"outerwear": "outer", "tops": "tops", "bottoms": "bottoms"}
APP_CATEGORIES = ("outer", "tops", "bottoms")
PAIR_TYPES = (("outer", "tops"), ("outer", "bottoms"), ("tops", "bottoms"))


def pair_type(a: str, b: str) -> tuple[str, str] | None:
    """2 つの種類の組を正規化する（同じ種類どうしは対象外）。"""
    key = tuple(sorted((a, b), key=APP_CATEGORIES.index))
    return key if key in PAIR_TYPES else None


def _path(name: str) -> Path:
    from huggingface_hub import hf_hub_download

    return Path(hf_hub_download(MIRROR, name, repo_type="dataset"))


@cache
def metadata() -> dict[str, dict]:
    return json.loads(_path("polyvore_item_metadata.json").read_text())


def app_category(item_id: str) -> str | None:
    return CATEGORY_MAP.get(metadata()[item_id]["semantic_category"])


@dataclass
class Split:
    name: str
    outfits: list[list[str]]  # 各コーデのアイテム ID（アプリの種類に入るものだけ）
    index: dict[str, str]  # "setid_index" → item_id（FITB・相性判定の参照用）

    def items(self) -> set[str]:
        return {i for o in self.outfits for i in o}


@cache
def load_split(name: str) -> Split:
    raw = json.loads(_path(f"disjoint/{name}.json").read_text())
    outfits, index = [], {}
    for o in raw:
        ids = []
        for it in o["items"]:
            index[f"{o['set_id']}_{it['index']}"] = it["item_id"]
            if app_category(it["item_id"]):
                ids.append(it["item_id"])
        outfits.append(ids)
    return Split(name, outfits, index)


@dataclass
class FitbQuestion:
    context: list[str]  # 空欄以外のアイテム（アプリの種類に入るものだけ）
    candidates: list[str]  # 4 択
    answer: int  # 正解の位置


def load_fitb(name: str) -> list[FitbQuestion]:
    """空欄がアプリの種類に入り、別の種類の手がかりが 1 つ以上ある問題だけを使う。"""
    split = load_split(name)
    out = []
    for q in json.loads(_path(f"disjoint/fill_in_blank_{name}.json").read_text()):
        set_id = q["question"][0].split("_")[0]
        cands = [split.index[a] for a in q["answers"]]
        answer = next(i for i, a in enumerate(q["answers"]) if a.split("_")[0] == set_id)
        cat = app_category(cands[answer])
        if cat is None or any(app_category(c) != cat for c in cands):
            continue
        context = [split.index[x] for x in q["question"] if app_category(split.index[x])]
        if not any(pair_type(cat, app_category(c)) for c in context):
            continue
        out.append(FitbQuestion(context, cands, answer))
    return out


def load_compatibility(name: str) -> list[tuple[int, list[str]]]:
    """(ラベル, アイテム) のリスト。別の種類の組が 1 つ以上あるコーデだけを使う。"""
    split = load_split(name)
    out = []
    for line in _path(f"disjoint/compatibility_{name}.txt").read_text().splitlines():
        label, *refs = line.split()
        ids = [split.index[r] for r in refs if app_category(split.index[r])]
        cats = [app_category(i) for i in ids]
        if any(pair_type(a, b) for k, a in enumerate(cats) for b in cats[k + 1 :]):
            out.append((int(label), ids))
    return out


def open_images() -> zipfile.ZipFile:
    return zipfile.ZipFile(_path("images.zip"))


def find_image(zf: zipfile.ZipFile, item_id: str) -> str:
    return _image_names(zf)[item_id]


def _image_names(zf: zipfile.ZipFile, _cache: dict = {}) -> dict[str, str]:  # noqa: B006
    key = id(zf)
    if key not in _cache:
        _cache[key] = {Path(n).stem: n for n in zf.namelist() if n.endswith(".jpg")}
    return _cache[key]
