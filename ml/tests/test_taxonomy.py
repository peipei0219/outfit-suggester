import re
from pathlib import Path

from outfit_ml import taxonomy

APP_CLOSET_JS = Path(__file__).resolve().parents[2] / "src" / "closet.js"


def js_object_keys(source: str, name: str) -> set[str]:
    body = re.search(rf"export const {name} = \{{(.*?)\}};", source, re.S).group(1)
    return set(re.findall(r"(\w+):", body))


def test_taxonomy_is_valid():
    taxonomy.validate()


def test_keys_match_web_app():
    """Python の分類とアプリ（src/closet.js）の種類・季節のキーがずれていないこと。"""
    src = APP_CLOSET_JS.read_text(encoding="utf-8")
    assert js_object_keys(src, "CATEGORIES") == set(taxonomy.CATEGORIES)
    assert js_object_keys(src, "SEASONS") == set(taxonomy.SEASONS)


def test_every_category_has_garments():
    cats = {g.category for g in taxonomy.GARMENTS}
    assert cats == set(taxonomy.CATEGORIES)
