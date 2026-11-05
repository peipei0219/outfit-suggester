"""服の分類体系（タクソノミー）。

アプリ（src/closet.js）の種類・季節のキーと一致させる。
細かい「服の種類」を推定し、そこから種類（アウター/トップス/ボトムス）と
着る季節を決める設計にしている。CLIP は「アウター」のような抽象的な区分より
「ダウンジャケット」のような具体的な名前の方が当てやすいため。
"""

from __future__ import annotations

from dataclasses import dataclass

# アプリ側のキー（src/closet.js の CATEGORIES / SEASONS と一致させる）
CATEGORIES = ("outer", "tops", "bottoms")
SEASONS = ("heavy", "winter", "mid", "summer")


@dataclass(frozen=True)
class Garment:
    key: str
    ja: str
    en: tuple[str, ...]  # CLIP に渡す英語の呼び方（複数あれば平均する）
    category: str
    seasons: tuple[str, ...]


GARMENTS: tuple[Garment, ...] = (
    # --- アウター ---
    Garment("down_jacket", "ダウンジャケット", ("down jacket", "puffer jacket"), "outer", ("heavy", "winter")),
    Garment("wool_coat", "ウールコート", ("wool coat", "long overcoat"), "outer", ("heavy", "winter")),
    Garment("trench_coat", "トレンチコート", ("trench coat",), "outer", ("mid",)),
    Garment("blazer", "ジャケット", ("blazer", "tailored jacket"), "outer", ("mid", "winter")),
    Garment("denim_jacket", "デニムジャケット", ("denim jacket", "jean jacket"), "outer", ("mid",)),
    Garment("leather_jacket", "レザージャケット", ("leather jacket",), "outer", ("mid", "winter")),
    Garment("windbreaker", "ナイロンジャケット", ("windbreaker", "nylon rain jacket"), "outer", ("mid",)),
    Garment("fleece", "フリース", ("fleece jacket",), "outer", ("winter",)),
    Garment("cardigan", "カーディガン", ("cardigan",), "outer", ("mid",)),
    # --- トップス ---
    Garment("tshirt", "Tシャツ", ("t-shirt", "short sleeve t-shirt"), "tops", ("summer", "mid")),
    Garment("long_tee", "長袖Tシャツ", ("long sleeve t-shirt",), "tops", ("mid",)),
    Garment("polo", "ポロシャツ", ("polo shirt",), "tops", ("summer",)),
    Garment("shirt", "シャツ", ("button-up shirt", "dress shirt"), "tops", ("mid", "summer")),
    Garment("blouse", "ブラウス", ("blouse",), "tops", ("mid", "summer")),
    Garment("knit", "ニット", ("knit sweater", "wool sweater"), "tops", ("winter", "heavy")),
    Garment("turtleneck", "タートルネック", ("turtleneck sweater",), "tops", ("winter", "heavy")),
    Garment("sweatshirt", "スウェット", ("sweatshirt", "hoodie"), "tops", ("mid", "winter")),
    Garment("tank_top", "タンクトップ", ("tank top", "sleeveless top"), "tops", ("summer",)),
    # アプリに「ワンピース」区分がないため、いまはトップスとして扱う
    Garment("dress", "ワンピース", ("dress", "one-piece dress"), "tops", ("mid", "summer")),
    # --- ボトムス ---
    Garment("jeans", "デニムパンツ", ("jeans", "denim pants"), "bottoms", ("mid", "winter")),
    Garment("chinos", "チノパン", ("chino pants",), "bottoms", ("mid",)),
    Garment("slacks", "スラックス", ("slacks", "dress trousers"), "bottoms", ("mid", "winter")),
    Garment("wide_pants", "ワイドパンツ", ("wide leg pants",), "bottoms", ("mid", "summer")),
    Garment("shorts", "ショートパンツ", ("shorts",), "bottoms", ("summer",)),
    Garment("skirt", "スカート", ("skirt",), "bottoms", ("mid", "summer")),
    Garment("long_skirt", "ロングスカート", ("long skirt", "maxi skirt"), "bottoms", ("mid", "summer")),
    Garment("track_pants", "ジャージパンツ", ("track pants", "jogger pants"), "bottoms", ("mid",)),
    Garment("leggings", "レギンス", ("leggings",), "bottoms", ("winter",)),
)


@dataclass(frozen=True)
class Color:
    key: str
    ja: str
    en: tuple[str, ...]


COLORS: tuple[Color, ...] = (
    Color("black", "黒", ("black",)),
    Color("white", "白", ("white", "off-white")),
    Color("grey", "グレー", ("grey", "charcoal grey")),
    Color("navy", "ネイビー", ("navy blue", "dark navy")),
    Color("blue", "ブルー", ("blue",)),
    Color("light_blue", "水色", ("light blue", "sky blue")),
    Color("beige", "ベージュ", ("beige", "cream")),
    Color("brown", "ブラウン", ("brown",)),
    Color("khaki", "カーキ", ("khaki", "olive green")),
    Color("green", "グリーン", ("green",)),
    Color("red", "レッド", ("red",)),
    Color("burgundy", "ボルドー", ("burgundy", "maroon")),
    Color("pink", "ピンク", ("pink",)),
    Color("yellow", "イエロー", ("yellow", "mustard")),
    Color("purple", "パープル", ("purple", "lavender")),
    Color("orange", "オレンジ", ("orange",)),
)

GARMENT_BY_KEY = {g.key: g for g in GARMENTS}
COLOR_BY_KEY = {c.key: c for c in COLORS}


def validate() -> None:
    """タクソノミーの整合性を確認する（テストと書き出し時に使う）。"""
    for items in (GARMENTS, COLORS):
        keys = [i.key for i in items]
        if len(keys) != len(set(keys)):
            raise ValueError(f"duplicate keys: {keys}")
        for i in items:
            if not i.en:
                raise ValueError(f"{i.key}: no English names")
    for g in GARMENTS:
        if g.category not in CATEGORIES:
            raise ValueError(f"{g.key}: unknown category {g.category}")
        if not g.seasons or any(s not in SEASONS for s in g.seasons):
            raise ValueError(f"{g.key}: bad seasons {g.seasons}")
