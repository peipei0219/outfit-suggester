"""アイテム 2 つの相性スコア。入力はブラウザと同じ CLIP の画像埋め込み（L2 正規化済み）。

- RandomScorer: 下限
- CosineScorer: 学習なし。見た目が似ているほど高い（相性 ≠ 類似 なので弱いはず）
- PairLogistic: 種類の組ごとのロジスティック回帰。特徴は [a⊙b, |a−b|]
- PairMLP: 小さなニューラルネット（特徴 + 種類の組の one-hot）

コーデ全体のスコアは、別の種類どうしの組のスコアの平均。
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from .polyvore import PAIR_TYPES, pair_type


def pair_features(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """順序によらない組の特徴（a, b を入れ替えても同じ）。"""
    return np.concatenate([a * b, np.abs(a - b)], axis=-1)


class Scorer:
    name = "base"

    def score_pairs(self, a: np.ndarray, b: np.ndarray, ptype: tuple[str, str]) -> np.ndarray:
        raise NotImplementedError

    def score_outfit(self, embeds: Sequence[np.ndarray], cats: Sequence[str]) -> float:
        scores = []
        for i in range(len(embeds)):
            for j in range(i + 1, len(embeds)):
                pt = pair_type(cats[i], cats[j])
                if pt:
                    scores.append(float(self.score_pairs(embeds[i][None], embeds[j][None], pt)[0]))
        return float(np.mean(scores)) if scores else 0.0


class RandomScorer(Scorer):
    name = "ランダム"

    def __init__(self, seed: int = 0):
        self.rng = np.random.default_rng(seed)

    def score_pairs(self, a, b, ptype):
        return self.rng.random(len(a))


class CosineScorer(Scorer):
    name = "CLIP の類似度（学習なし）"

    def score_pairs(self, a, b, ptype):
        return np.sum(a * b, axis=-1)


class PairLogistic(Scorer):
    name = "ロジスティック回帰（種類の組ごと）"

    def __init__(self, C: float = 1.0):
        self.C = C
        self.coef: dict[tuple[str, str], tuple[np.ndarray, float]] = {}

    def fit(self, pairs: dict[tuple[str, str], tuple[np.ndarray, np.ndarray, np.ndarray]]):
        from sklearn.linear_model import LogisticRegression

        for pt, (a, b, y) in pairs.items():
            clf = LogisticRegression(C=self.C, max_iter=2000).fit(pair_features(a, b), y)
            self.coef[pt] = (clf.coef_[0].astype(np.float32), float(clf.intercept_[0]))
        return self

    def score_pairs(self, a, b, ptype):
        w, c = self.coef[ptype]
        return pair_features(a, b) @ w + c


class PairMLP(Scorer):
    name = "ニューラルネット（MLP）"

    def __init__(self, hidden: int = 128, alpha: float = 1e-3, seed: int = 0):
        self.hidden, self.alpha, self.seed = hidden, alpha, seed
        self.layers: list[tuple[np.ndarray, np.ndarray]] = []

    @staticmethod
    def _x(a, b, ptype):
        onehot = np.zeros((len(a), len(PAIR_TYPES)), dtype=np.float32)
        onehot[:, PAIR_TYPES.index(ptype)] = 1
        return np.concatenate([pair_features(a, b), onehot], axis=-1)

    def fit(self, pairs):
        from sklearn.neural_network import MLPClassifier

        X = np.concatenate([self._x(a, b, pt) for pt, (a, b, _) in pairs.items()])
        y = np.concatenate([y for (_, _, y) in pairs.values()])
        clf = MLPClassifier(
            hidden_layer_sizes=(self.hidden,),
            alpha=self.alpha,
            early_stopping=True,
            validation_fraction=0.1,
            max_iter=200,
            random_state=self.seed,
        ).fit(X, y)
        self.layers = [
            (w.astype(np.float32), b.astype(np.float32)) for w, b in zip(clf.coefs_, clf.intercepts_, strict=True)
        ]
        return self

    def score_pairs(self, a, b, ptype):
        h = self._x(a, b, ptype)
        for k, (w, bias) in enumerate(self.layers):
            h = h @ w + bias
            if k < len(self.layers) - 1:
                h = np.maximum(h, 0)  # ReLU（sklearn の既定）
        return h[:, 0]  # ロジット（シグモイド前）
