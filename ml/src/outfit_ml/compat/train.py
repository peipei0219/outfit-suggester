"""学習データ（正例・負例の組）と評価（FITB・相性判定 AUC）。"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable

import numpy as np

from .models import Scorer
from .polyvore import FitbQuestion, Split, app_category, pair_type


def make_pairs(
    split: Split, embed: Callable[[str], np.ndarray], negatives: int = 1, seed: int = 0
) -> dict[tuple[str, str], tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """同じコーデに入っている別の種類の組を正例、片方を同じ種類のランダムなアイテムに替えたものを負例にする。"""
    rng = np.random.default_rng(seed)
    by_cat: dict[str, list[str]] = defaultdict(list)
    for i in sorted(split.items()):
        by_cat[app_category(i)].append(i)
    rows: dict[tuple[str, str], list[tuple[str, str, int]]] = defaultdict(list)
    for outfit in split.outfits:
        for x in range(len(outfit)):
            for y in range(x + 1, len(outfit)):
                a, b = outfit[x], outfit[y]
                pt = pair_type(app_category(a), app_category(b))
                if not pt:
                    continue
                if app_category(a) != pt[0]:
                    a, b = b, a
                rows[pt].append((a, b, 1))
                for _ in range(negatives):
                    # どちらを差し替えるかもランダム（片側だけ偏らないように）
                    if rng.random() < 0.5:
                        rows[pt].append((a, by_cat[pt[1]][rng.integers(len(by_cat[pt[1]]))], 0))
                    else:
                        rows[pt].append((by_cat[pt[0]][rng.integers(len(by_cat[pt[0]]))], b, 0))
    out = {}
    for pt, r in rows.items():
        out[pt] = (
            np.stack([embed(a) for a, _, _ in r]),
            np.stack([embed(b) for _, b, _ in r]),
            np.array([y for _, _, y in r]),
        )
    return out


def fitb_accuracy(scorer: Scorer, questions: list[FitbQuestion], embed: Callable[[str], np.ndarray]) -> float:
    """4 択の空欄補充。各候補を手がかりのアイテムとの組のスコアの平均で比べる。"""
    hits = 0
    for q in questions:
        scores = []
        for c in q.candidates:
            items = [*q.context, c]
            scores.append(scorer.score_outfit([embed(i) for i in items], [app_category(i) for i in items]))
        hits += int(np.argmax(scores) == q.answer)
    return hits / len(questions)


def roc_auc(labels: np.ndarray, scores: np.ndarray) -> float:
    """順位にもとづく AUC（同点は平均順位）。"""
    from scipy.stats import rankdata

    ranks = rankdata(scores)
    pos = labels == 1
    n_pos, n_neg = pos.sum(), (~pos).sum()
    return float((ranks[pos].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def compatibility_auc(scorer: Scorer, outfits: list[tuple[int, list[str]]], embed) -> float:
    labels = np.array([y for y, _ in outfits])
    scores = np.array(
        [scorer.score_outfit([embed(i) for i in ids], [app_category(i) for i in ids]) for _, ids in outfits]
    )
    return roc_auc(labels, scores)
