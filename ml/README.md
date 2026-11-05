# outfit-ml

Outfit Suggester の機械学習部分です。いまは **服の写真から「種類・色・着る季節」を自動判定する機能** を担当しています。

## しくみ

```
          ┌──────────── Python（このディレクトリ）────────────┐
タクソノミー  │ 服の種類 28 / 色 16                                  │
(taxonomy.py)│   └ 英語の呼び方 × プロンプトテンプレート             │
            │        └ CLIP テキストエンコーダ → 正規化 → 平均      │ ← プロンプトアンサンブル
            │             └ model/tagger.json（float16, 約60KB）   │
            └──────────────────────────┬───────────────────────────┘
                                       │ GitHub Pages で配信
            ┌──────────── ブラウザ（スマホ）─────────▼─────────────┐
写真 ──────▶│ CLIP 画像エンコーダ（transformers.js / ONNX, 端末内）  │
            │   └ 画像埋め込み · クラス重み → softmax → 上位候補     │
            └──────────────────────────────────────────────────────┘
```

- **写真は端末の外に出ません。** 画像側の CLIP はブラウザ内（WebAssembly）で動きます。
- **サーバー不要。** テキスト側はあらかじめ Python で計算し、静的ファイルとして配信します。
- **具体的な服の種類を当ててから、種類・季節に変換。** CLIP は「アウター」のような抽象的な区分より「ダウンジャケット」の方が当てやすいため。
- ブラウザは同じ重みを ONNX に変換した `Xenova/clip-vit-base-patch32` を使います（Python は `openai/clip-vit-base-patch32`）。

## セットアップ

```bash
cd ml
uv sync --group dev                 # テストだけなら（モデル不要）
uv sync --group dev --extra clip --extra eval   # 書き出し・評価もするなら
```

## コマンド

```bash
uv run pytest                        # テスト（モデルのダウンロード不要）
uv run outfit-ml export              # model/tagger.json を作る
uv run outfit-ml evaluate --per-class 100   # 公開データセットで精度を測る → reports/
```

## 評価

`ashraq/fashion-product-images-small`（ファッション EC の商品画像、約 4.4 万枚）を使い、
- 服の種類の Top-1 / Top-3 正解率、種類（アウター/トップス/ボトムス）の正解率
- 色の Top-1 / Top-3 正解率
- 単一テンプレートとプロンプトアンサンブルの比較

を出します。データセットのラベルはこのアプリの分類と 1 対 1 ではないので、「正解とみなす候補の集合」に変換して評価しています（`evaluate.py` の `ARTICLE_TYPE_MAP`）。

## ファイル

| ファイル | 役割 |
|---|---|
| `taxonomy.py` | 服の種類・色の定義。アプリのキーと一致することをテストで確認 |
| `prompts.py` | プロンプトテンプレート |
| `classifier.py` | 埋め込み → 確率の計算（numpy のみ、ブラウザ側と同じ計算） |
| `clip.py` | Hugging Face transformers の CLIP ラッパー |
| `export.py` | `model/tagger.json` の書き出し |
| `evaluate.py` | 評価用のラベル変換と指標 |
| `cli.py` | `outfit-ml` コマンド |
