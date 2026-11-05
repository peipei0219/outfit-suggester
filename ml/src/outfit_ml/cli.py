"""コマンドライン: `outfit-ml evaluate` / `outfit-ml export`

評価の手順:
  1. dev 側でキャリブレーション（平均画像埋め込み）と自動入力の基準を決める
  2. その設定のまま test 側で精度を測ってレポートにする（dev の数値は報告しない）
  3. export は 1 の設定を読んで model/tagger.json に書き込む
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import export, prompts

REPO_ROOT = Path(__file__).resolve().parents[3]
REPORT = REPO_ROOT / "ml" / "reports" / "zeroshot_eval.md"
CALIBRATION = REPO_ROOT / "ml" / "reports" / "calibration.json"
CALIBRATION_ALPHA = 0.5  # dev で 0 / 0.5 / 1.0 を比べて決めた値（README 参照）


def _encode(enc, evaluate, per_class: int, seed: int, split: str):
    ds = evaluate.load_samples(per_class, seed, split)
    print(f"[{split}] encoding {len(ds)} images…")
    embeds = enc.encode_images(img.convert("RGB") for img in ds["image"])
    garment_gold = [(t, evaluate.ARTICLE_TYPE_MAP[t]) for t in ds["articleType"]]
    colours = ds["baseColour"]
    color_rows = [i for i, c in enumerate(colours) if c in evaluate.BASE_COLOUR_MAP]
    color_gold = [(colours[i], evaluate.BASE_COLOUR_MAP[colours[i]]) for i in color_rows]
    return embeds, garment_gold, color_rows, color_gold


def cmd_evaluate(args: argparse.Namespace) -> None:
    from . import evaluate
    from .classifier import l2_normalize
    from .clip import VISION_FILE, ClipEncoder

    enc = ClipEncoder(args.model)

    # 1. dev: キャリブレーションと自動入力の基準を決める
    dev_e, dev_gg, _, _ = _encode(enc, evaluate, args.per_class, args.seed, "dev")
    mean = l2_normalize(dev_e.mean(axis=0))
    calibration = {"alpha": args.alpha, "mean_image_embed": [round(float(x), 6) for x in mean]}
    final = export.apply_calibration(export.build_heads(enc.encode_text), calibration)
    dev_coverage = evaluate.coverage_table(final["garment"], dev_e, dev_gg)
    confidence = evaluate.recommend_confidence(dev_coverage, args.target_accuracy)

    # 2. test: 決めた設定のまま測る
    test_e, gg, color_rows, cg = _encode(enc, evaluate, args.per_class, args.seed, "test")
    variants = {
        "単一テンプレート": export.build_heads(
            enc.encode_text, prompts.SINGLE_GARMENT_TEMPLATE, prompts.SINGLE_COLOR_TEMPLATE
        ),
        "アンサンブル": export.build_heads(enc.encode_text),
        "アンサンブル＋キャリブレーション": final,
    }
    results: dict = {"服の種類": {}, "色": {}}
    for name, heads in variants.items():
        results["服の種類"][name] = evaluate.score(heads["garment"], test_e, gg, with_category=True)
        results["色"][name] = evaluate.score(heads["color"], test_e[color_rows], cg)
    test_coverage = evaluate.coverage_table(final["garment"], test_e, gg)

    meta = {
        "dataset": "ashraq/fashion-product-images-small",
        "per_class": args.per_class,
        "seed": args.seed,
        "split": "test",
        "model": f"{args.model}（画像: {VISION_FILE}）",
        "target_accuracy": args.target_accuracy,
        "alpha": args.alpha,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(evaluate.report_markdown(results, meta, test_coverage, confidence), encoding="utf-8")
    summary = {t: {v: m.as_dict() for v, m in by.items()} for t, by in results.items()}
    out.with_suffix(".json").write_text(
        json.dumps(
            {
                "meta": meta,
                "results": summary,
                "coverage_test": test_coverage,
                "coverage_dev": dev_coverage,
                "confidence": confidence,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    CALIBRATION.write_text(json.dumps({**calibration, "confidence": confidence}) + "\n", encoding="utf-8")
    print(json.dumps({"results": summary, "confidence": confidence}, ensure_ascii=False, indent=2))


def cmd_export(args: argparse.Namespace) -> None:
    from .clip import TEXT_FILE, ClipEncoder

    enc = ClipEncoder(args.model)
    calibration = json.loads(Path(args.calibration).read_text()) if Path(args.calibration).exists() else None
    heads = export.apply_calibration(export.build_heads(enc.encode_text), calibration)
    confidence = calibration.get("confidence") if calibration else None
    data = export.to_json(heads, f"{args.model}/{TEXT_FILE}", args.model, confidence)
    export.write(Path(args.out), data)
    print(
        f"wrote {args.out}（キャリブレーション: {'あり' if calibration else 'なし'}、"
        f"自動入力の基準: {data['confidence']}）"
    )


def main(argv: list[str] | None = None) -> None:
    from .clip import MODEL_ID

    p = argparse.ArgumentParser(prog="outfit-ml")
    sub = p.add_subparsers(required=True)

    v = sub.add_parser("evaluate", help="dev で設定を決め、test で精度を測る")
    v.add_argument("--model", default=MODEL_ID)
    v.add_argument("--per-class", type=int, default=100)
    v.add_argument("--seed", type=int, default=0)
    v.add_argument("--alpha", type=float, default=CALIBRATION_ALPHA, help="キャリブレーションの強さ（0 で無効）")
    v.add_argument("--target-accuracy", type=float, default=0.85, help="自動入力するときに保ちたい正解率")
    v.add_argument("--out", default=str(REPORT))
    v.set_defaults(func=cmd_evaluate)

    e = sub.add_parser("export", help="ブラウザ用の分類器 model/tagger.json を作る")
    e.add_argument("--model", default=MODEL_ID)
    e.add_argument("--out", default=str(REPO_ROOT / "model" / "tagger.json"))
    e.add_argument("--calibration", default=str(CALIBRATION), help="evaluate が出力したキャリブレーション設定")
    e.set_defaults(func=cmd_export)

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
