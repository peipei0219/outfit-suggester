"""コマンドライン: `outfit-ml export` / `outfit-ml evaluate`"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import export, prompts

REPO_ROOT = Path(__file__).resolve().parents[3]


def cmd_export(args: argparse.Namespace) -> None:
    from .clip import BROWSER_MODEL, ClipEncoder

    enc = ClipEncoder(args.model)
    heads = export.build_heads(enc.encode_text)
    data = export.to_json(heads, args.model, BROWSER_MODEL)
    export.write(Path(args.out), data)
    print(f"wrote {args.out}")


def cmd_evaluate(args: argparse.Namespace) -> None:
    from . import evaluate
    from .clip import ClipEncoder

    enc = ClipEncoder(args.model)
    ds = evaluate.load_samples(args.per_class, args.seed)
    print(f"encoding {len(ds)} images…")
    image_embeds = enc.encode_images(img.convert("RGB") for img in ds["image"])

    garment_gold = [(t, evaluate.ARTICLE_TYPE_MAP[t]) for t in ds["articleType"]]
    color_rows = [i for i, c in enumerate(ds["baseColour"]) if c in evaluate.BASE_COLOUR_MAP]
    color_gold = [(ds["baseColour"][i], evaluate.BASE_COLOUR_MAP[ds["baseColour"][i]]) for i in color_rows]

    variants = {
        "single": (prompts.SINGLE_GARMENT_TEMPLATE, prompts.SINGLE_COLOR_TEMPLATE),
        "ensemble": (prompts.GARMENT_TEMPLATES, prompts.COLOR_TEMPLATES),
    }
    results: dict = {"服の種類": {}, "色": {}}
    for name, (gt, ct) in variants.items():
        heads = export.build_heads(enc.encode_text, gt, ct)
        results["服の種類"][name] = evaluate.score(heads["garment"], image_embeds, garment_gold, with_category=True)
        results["色"][name] = evaluate.score(heads["color"], image_embeds[color_rows], color_gold)

    meta = {
        "dataset": "ashraq/fashion-product-images-small",
        "per_class": args.per_class,
        "seed": args.seed,
        "model": args.model,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    heads = export.build_heads(enc.encode_text)
    coverage = evaluate.coverage_table(heads["garment"], image_embeds, garment_gold)
    out.write_text(evaluate.report_markdown(results, meta, coverage), encoding="utf-8")
    summary = {t: {v: m.as_dict() for v, m in by.items()} for t, by in results.items()}
    out.with_suffix(".json").write_text(json.dumps({"meta": meta, "results": summary}, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def main(argv: list[str] | None = None) -> None:
    from .clip import DEFAULT_MODEL

    p = argparse.ArgumentParser(prog="outfit-ml")
    sub = p.add_subparsers(required=True)

    e = sub.add_parser("export", help="ブラウザ用の分類器 model/tagger.json を作る")
    e.add_argument("--model", default=DEFAULT_MODEL)
    e.add_argument("--out", default=str(REPO_ROOT / "model" / "tagger.json"))
    e.set_defaults(func=cmd_export)

    v = sub.add_parser("evaluate", help="公開データセットで精度を測る")
    v.add_argument("--model", default=DEFAULT_MODEL)
    v.add_argument("--per-class", type=int, default=100)
    v.add_argument("--seed", type=int, default=0)
    v.add_argument("--out", default=str(REPO_ROOT / "ml" / "reports" / "zeroshot_eval.md"))
    v.set_defaults(func=cmd_evaluate)

    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
