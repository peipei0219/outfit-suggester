"""相性モデルのテスト。Polyvore のファイルは使わず、合成データで仕組みを確かめる。"""

import numpy as np
import pytest

from outfit_ml.compat import models, polyvore, train


def test_pair_type_is_order_free_and_skips_same_category():
    assert polyvore.pair_type("bottoms", "tops") == ("tops", "bottoms")
    assert polyvore.pair_type("tops", "outer") == ("outer", "tops")
    assert polyvore.pair_type("tops", "tops") is None


def test_pair_features_are_symmetric():
    rng = np.random.default_rng(0)
    a, b = rng.standard_normal((2, 4, 8))
    np.testing.assert_allclose(models.pair_features(a, b), models.pair_features(b, a))


def test_roc_auc():
    assert train.roc_auc(np.array([0, 0, 1, 1]), np.array([0.1, 0.2, 0.8, 0.9])) == 1.0
    assert train.roc_auc(np.array([0, 1]), np.array([0.5, 0.5])) == 0.5


@pytest.fixture
def toy(monkeypatch):
    """「同じスタイル（ベクトルの向き）のアイテムが同じコーデに入る」合成データ。"""
    rng = np.random.default_rng(0)
    dim, styles = 16, 4
    centers = rng.standard_normal((styles, dim))
    cats = {}
    emb = {}
    outfits = []
    for o in range(300):
        s = o % styles
        ids = []
        for cat in ("outer", "tops", "bottoms"):
            iid = f"{cat}{o}"
            cats[iid] = cat
            v = centers[s] + 0.3 * rng.standard_normal(dim)
            # 種類ごとに別の方向を足して「見た目の類似」と「相性」を分ける
            v += {"outer": 2, "tops": -2, "bottoms": 0}[cat] * np.eye(dim)[0]
            emb[iid] = v / np.linalg.norm(v)
            ids.append(iid)
        outfits.append(ids)
    monkeypatch.setattr(polyvore, "app_category", lambda i: cats[i])
    monkeypatch.setattr(train, "app_category", lambda i: cats[i])
    split = polyvore.Split("toy", outfits, {})
    return split, emb.__getitem__, cats


def test_make_pairs_balances_positives_and_negatives(toy):
    split, embed, _ = toy
    pairs = train.make_pairs(split, embed, negatives=1)
    assert set(pairs) == set(polyvore.PAIR_TYPES)
    for a, b, y in pairs.values():
        assert len(a) == len(b) == len(y) and y.mean() == pytest.approx(0.5)


def test_trained_models_beat_random_on_toy_fitb(toy):
    split, embed, cats = toy
    pairs = train.make_pairs(split, embed, negatives=2)
    rng = np.random.default_rng(1)
    questions = []
    for o in split.outfits[:100]:
        wrong = [f"bottoms{int(x)}" for x in rng.choice(np.arange(300), 3) if f"bottoms{int(x)}" != o[2]]
        questions.append(polyvore.FitbQuestion(context=o[:2], candidates=[o[2], *wrong[:3]], answer=0))
    questions = [q for q in questions if len(q.candidates) == 4]
    random_acc = train.fitb_accuracy(models.RandomScorer(), questions, embed)
    logit_acc = train.fitb_accuracy(models.PairLogistic().fit(pairs), questions, embed)
    mlp_acc = train.fitb_accuracy(models.PairMLP(hidden=16).fit(pairs), questions, embed)
    assert logit_acc > random_acc + 0.3
    assert mlp_acc > random_acc + 0.3
