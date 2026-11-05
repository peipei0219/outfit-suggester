"""相性モデルの学習・評価・書き出し（`outfit-ml compat-train`）。

手順: train で学習 → valid でハイパーパラメータとモデルを選ぶ → test で最終評価 → 選んだモデルを model/compat.json に書き出す。
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .. import __version__
from ..export import encode_f16
from . import models, polyvore, train
from .embed import load_cache

REPO_ROOT = Path(__file__).resolve().parents[4]
REPORT = REPO_ROOT / "ml" / "reports" / "compat_eval.md"
OUT = REPO_ROOT / "model" / "compat.json"


def evaluate_all(scorer, embed, fitb, compat) -> dict:
    return {"fitb": train.fitb_accuracy(scorer, fitb, embed), "auc": train.compatibility_auc(scorer, compat, embed)}


def run(negatives: int = 2, seed: int = 0) -> dict:
    cache = load_cache()
    embed = cache.__getitem__
    t0 = time.time()
    pairs = train.make_pairs(polyvore.load_split("train"), embed, negatives=negatives, seed=seed)
    n_pairs = {"/".join(pt): int(len(y)) for pt, (_, _, y) in pairs.items()}
    data = {s: (polyvore.load_fitb(s), polyvore.load_compatibility(s)) for s in ("valid", "test")}
    print(
        "pairs:",
        n_pairs,
        "| fitb/compat valid:",
        [len(x) for x in data["valid"]],
        "test:",
        [len(x) for x in data["test"]],
    )

    # valid でハイパーパラメータを選ぶ
    candidates = {
        **{f"logistic C={c}": models.PairLogistic(C=c) for c in (0.1, 1.0, 10.0)},
        **{f"mlp h={h} a={a}": models.PairMLP(hidden=h, alpha=a, seed=seed) for h in (64, 128) for a in (1e-4, 1e-2)},
    }
    valid = {}
    for name, m in candidates.items():
        m.fit(pairs)
        valid[name] = evaluate_all(m, embed, *data["valid"])
        print(f"  valid {name}: {valid[name]}", flush=True)
    best_logistic = max((n for n in valid if n.startswith("logistic")), key=lambda n: valid[n]["fitb"])
    best_mlp = max((n for n in valid if n.startswith("mlp")), key=lambda n: valid[n]["fitb"])
    chosen = max((best_logistic, best_mlp), key=lambda n: valid[n]["fitb"])

    # test で最終評価
    final = {
        models.RandomScorer.name: models.RandomScorer(seed),
        models.CosineScorer.name: models.CosineScorer(),
        f"{models.PairLogistic.name}（{best_logistic.split(' ', 1)[1]}）": candidates[best_logistic],
        f"{models.PairMLP.name}（{best_mlp.split(' ', 1)[1]}）": candidates[best_mlp],
    }
    test = {name: evaluate_all(m, embed, *data["test"]) for name, m in final.items()}
    for name, r in test.items():
        print(f"  test {name}: {r}")

    # UI の「相性 ◎/○/△」の基準: valid の正例・負例コーデのスコアの中央値
    model = candidates[chosen]
    scored = [
        (y, model.score_outfit([embed(i) for i in ids], [polyvore.app_category(i) for i in ids]))
        for y, ids in data["valid"][1]
    ]
    pos = np.array([s for y, s in scored if y == 1])
    neg = np.array([s for y, s in scored if y == 0])
    levels = {"good": float(np.median(pos)), "poor": float(np.median(neg))}

    export(model, levels)
    meta = {
        "negatives": negatives,
        "seed": seed,
        "pairs": n_pairs,
        "chosen": chosen,
        "levels": levels,
        "n_valid": [len(x) for x in data["valid"]],
        "n_test": [len(x) for x in data["test"]],
        "seconds": round(time.time() - t0),
    }
    write_report(valid, test, meta)
    return {"valid": valid, "test": test, "meta": meta}


def export(model, levels: dict, path: Path = OUT) -> None:
    out = {
        "format": 1,
        "generator": f"outfit-ml {__version__}",
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "image_model": "Xenova/clip-vit-base-patch32",
        "pair_types": [list(p) for p in polyvore.PAIR_TYPES],
        "levels": levels,
    }
    if isinstance(model, models.PairLogistic):
        out["type"] = "logistic"
        out["logistic"] = {
            "/".join(pt): {"w_f16": encode_f16(w), "dim": int(len(w)), "b": b} for pt, (w, b) in model.coef.items()
        }
    else:
        out["type"] = "mlp"
        out["mlp"] = [
            {"w_f16": encode_f16(w), "shape": list(w.shape), "b": [round(float(x), 6) for x in b]}
            for w, b in model.layers
        ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB, {out['type']})")


def write_report(valid: dict, test: dict, meta: dict) -> None:
    lines = [
        "# コーデ相性モデルの評価（Polyvore Outfits, disjoint）",
        "",
        "- データ: Polyvore Outfits（Vasileva et al., ECCV 2018）の disjoint 分割。train / valid / test でアイテムが重ならない",
        "- 対象: アプリの種類に入るアイテム（アウター・トップス・ボトムス）だけ。靴・バッグ・ワンピースなどは除外",
        f"- 入力: CLIP の画像埋め込み（ブラウザと同じ量子化 ONNX）。学習の組: {meta['pairs']}（負例は正例の {meta['negatives']} 倍）",
        f"- 問題数: valid FITB {meta['n_valid'][0]} / 相性判定 {meta['n_valid'][1]}、test FITB {meta['n_test'][0]} / 相性判定 {meta['n_test'][1]}",
        "- **FITB**: コーデの空欄に入るアイテムを 4 択で当てる（ランダムなら 25%）",
        "- **相性判定 AUC**: 本物のコーデと、アイテムをランダムに入れ替えたコーデを見分ける（ランダムなら 0.5）",
        "- 公式の数値（全カテゴリを使う）とは問題の範囲が違うので直接は比べられない",
        "",
        "## 結果（test）",
        "",
        "| モデル | FITB 正解率（95% 信頼区間） | 相性判定 AUC |",
        "|---|---:|---:|",
    ]
    n_fitb = meta["n_test"][0]
    for n, r in test.items():
        half = 1.96 * (r["fitb"] * (1 - r["fitb"]) / n_fitb) ** 0.5  # 二項分布の正規近似
        lines.append(f"| {n} | {r['fitb']:.1%}（±{half:.1%}） | {r['auc']:.3f} |")
    lines += [
        "",
        f"アプリに採用: **{meta['chosen']}**（valid の FITB で選択）",
        "",
        "## ハイパーパラメータの選択（valid）",
        "",
        "| 設定 | FITB | AUC |",
        "|---|---:|---:|",
    ]
    lines += [f"| {n} | {r['fitb']:.1%} | {r['auc']:.3f} |" for n, r in valid.items()]
    lines += [
        "",
        "## アプリでの「相性」の表示基準",
        "",
        f"valid の本物のコーデのスコア中央値（{meta['levels']['good']:.3f}）以上を「◎」、"
        f"入れ替えたコーデの中央値（{meta['levels']['poor']:.3f}）未満を「△」、その間を「○」とする。",
    ]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    REPORT.with_suffix(".json").write_text(
        json.dumps({"valid": valid, "test": test, "meta": meta}, ensure_ascii=False, indent=2) + "\n"
    )
