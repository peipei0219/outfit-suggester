"""コマンドライン: `outfit-ml evaluate` / `outfit-ml export`"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import export, prompts

REPO_ROOT = Path(__file__).resolve().parents[3]
REPORT = REPO_ROOT / "ml" / "reports" / "zeroshot_eval.md"


def cmd_evaluate(args: argparse.Namespace) -> None:
    from . import evaluate
    from .clip import VISION_FILE, ClipEncoder

    enc = ClipEncoder(args.model)
    ds = evaluate.load_samples(args.per_class, args.seed)
    print(f"encoding {len(ds)} images…")
    image_embeds = enc.encode_images(img.convert("RGB") for img in ds["image"])

    garment_gold = [(t, evaluate.ARTICLE_TYPE_MAP[t]) for t in ds["articleType"]]
    colours = ds["baseColour"]
    color_rows = [i for i, c in enumerate(colours) if c in evaluate.BASE_COLOUR_MAP]
    color_gold = [(colours[i], evaluate.BASE_COLOUR_MAP[colours[i]]) for i in color_rows]

    variants = {
        "single": (prompts.SINGLE_GARMENT_TEMPLATE, prompts.SINGLE_COLOR_TEMPLATE),
        "ensemble": (prompts.GARMENT_TEMPLATES, prompts.COLOR_TEMPLATES),
    }
    results: dict = {"服の種類": {}, "色": {}}
    for name, (gt, ct) in variants.items():
        heads = export.build_heads(enc.encode_text, gt, ct)
        results["服の種類"][name] = evaluate.score(heads["garment"], image_embeds, garment_gold, with_category=True)
        results["色"][name] = evaluate.score(heads["color"], image_embeds[color_rows], color_gold)

    coverage = evaluate.coverage_table(heads["garment"], image_embeds, garment_gold)
    confidence = evaluate.recommend_confidence(coverage, args.target_accuracy)
    meta = {
        "dataset": "ashraq/fashion-product-images-small",
        "per_class": args.per_class,
        "seed": args.seed,
        "model": f"{args.model}（画像: {VISION_FILE}）",
        "target_accuracy": args.target_accuracy,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(evaluate.report_markdown(results, meta, coverage, confidence), encoding="utf-8")
    summary = {t: {v: m.as_dict() for v, m in by.items()} for t, by in results.items()}
    out.with_suffix(".json").write_text(
        json.dumps(
            {"meta": meta, "results": summary, "coverage": coverage, "confidence": confidence},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"results": summary, "confidence": confidence}, ensure_ascii=False, indent=2))


def cmd_export(args: argparse.Namespace) -> None:
    from .clip import TEXT_FILE, ClipEncoder

    enc = ClipEncoder(args.model)
    heads = export.build_heads(enc.encode_text)
    confidence = None
    if args.confidence and Path(args.confidence).exists():
        confidence = json.loads(Path(args.confidence).read_text(encoding="utf-8"))["confidence"]
    data = export.to_json(heads, f"{args.model}/{TEXT_FILE}", args.model, confidence)
    export.write(Path(args.out), data)
    print(f"wrote {args.out}（自動入力の基準: {data['confidence']}）")


def main(argv: list[str] | None = None) -> None:
    from .clip import MODEL_ID

    p = argparse.ArgumentParser(prog="outfit-ml")
    sub = p.add_subparsers(required=True)

    v = sub.add_parser("evaluate", help="公開データセットで精度を測り、自動入力の基準を決める")
    v.add_argument("--model", default=MODEL_ID)
    v.add_argument("--per-class", type=int, default=100)
    v.add_argument("--seed", type=int, default=0)
    v.add_argument("--target-accuracy", type=float, default=0.85, help="自動入力するときに保ちたい正解率")
    v.add_argument("--out", default=str(REPORT))
    v.set_defaults(func=cmd_evaluate)

    e = sub.add_parser("export", help="ブラウザ用の分類器 model/tagger.json を作る")
    e.add_argument("--model", default=MODEL_ID)
    e.add_argument("--out", default=str(REPO_ROOT / "model" / "tagger.json"))
    e.add_argument(
        "--confidence",
        default=str(REPORT.with_suffix(".json")),
        help="evaluate が出力した JSON（自動入力の基準）。なければ既定値",
    )
    e.set_defaults(func=cmd_export)

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
