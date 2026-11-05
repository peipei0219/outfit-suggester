import numpy as np

from outfit_ml import evaluate, taxonomy
from outfit_ml.classifier import Head


def test_label_maps_point_to_known_keys():
    for keys in evaluate.ARTICLE_TYPE_MAP.values():
        assert keys and all(k in taxonomy.GARMENT_BY_KEY for k in keys)
    for keys in evaluate.BASE_COLOUR_MAP.values():
        assert keys and all(k in taxonomy.COLOR_BY_KEY for k in keys)


def test_score_counts_set_valued_gold():
    labels = ["tshirt", "jeans", "down_jacket"]
    head = Head(labels=labels, weights=np.eye(3, dtype=np.float32))
    embeds = np.eye(3, dtype=np.float32)  # それぞれ tshirt, jeans, down_jacket と予測される
    gold = [
        ("Tshirts", ("tshirt",)),  # 正解
        ("Shorts", ("shorts",)),  # 不正解（jeans と予測）、種類はボトムスで一致
        ("Jackets", ("blazer", "down_jacket")),  # 候補のどれかなので正解
    ]
    m = evaluate.score(head, embeds, gold, with_category=True)
    assert (m.n, m.top1, m.top3, m.category) == (3, 2, 2, 3)  # shorts はラベルにないので Top-3 でも外れ
    assert m.confusions[("Shorts", "jeans")] == 1


def test_coverage_table_is_monotonic():
    rng = np.random.default_rng(0)
    labels = ["tshirt", "jeans", "down_jacket"]
    head = Head(labels=labels, weights=np.eye(3, dtype=np.float32), scale=10)
    embeds = rng.standard_normal((50, 3)).astype(np.float32)
    gold = [("x", (labels[i % 3],)) for i in range(50)]
    rows = evaluate.coverage_table(head, embeds, gold, min_margins=(0.0, 0.5))
    by = {(r["min_p"], r["min_margin"]): r["coverage"] for r in rows}
    assert by[(0.3, 0.0)] >= by[(0.5, 0.0)] >= by[(0.7, 0.0)]
    assert by[(0.3, 0.0)] >= by[(0.3, 0.5)]
