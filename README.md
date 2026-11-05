# Outfit Suggester（服装サジェストアプリ）

現在地の天気と **手持ちの服** から、その日に合った服装の候補を提案してくれる Web アプリです。

🌐 **アプリ: https://peipei0219.github.io/outfit-suggester/**

## 機能

- 📍 **現在地の天気を自動取得**（[Open-Meteo](https://open-meteo.com/) を利用、APIキー不要）
  - 位置情報が使えないときは地名で検索
  - 前回の場所を覚えていて、次回開いたときに自動で取得
- 🌡️ 気温に応じたアウター／トップス／ボトムスの提案
- ☔ 天気・降水確率に応じた小物の提案（傘、レインブーツなど）
- 💡 寒暖差が大きい日は重ね着をアドバイス
- 👕 **クローゼット機能**: 手持ちの服を「種類・季節・シーン」付きで登録すると、その中から優先して提案（「手持ち」と表示）。合う服がない部分は一般的な「おすすめ」で補完
- ✨ **写真から服の種類・色・季節を自動入力**（CLIP を端末内で実行。写真は外部に送信しません。初回のみ約 89MB のモデルをダウンロード）。自信があるときだけ自動入力し、迷うときは上位 3 候補から選べます。精度と評価方法は [ml/README.md](ml/README.md)
- 📷 **服の写真を登録**（スマホのカメラ・写真から選択。自動で縮小して保存し、提案にも写真を表示）
- 🛍️ **手持ちにない服をユニクロ／ZOZOTOWN で検索**（「おすすめ」の服から各サイトの検索結果へ移動）
- 💾 クローゼットのバックアップ（写真ごと JSON で書き出し／読み込み）
- 📱 スマホ対応。ホーム画面に追加するとアプリのように使えます
- 🎲 「別の候補」ボタンで候補をシャッフル

> 服のデータは端末のブラウザ（localStorage／写真は IndexedDB）に保存され、サーバーには送信されません。
> iPhone の Safari では、しばらく開かないとデータが消えることがあるため、ホーム画面に追加して使うか、定期的にバックアップしてください。

## ローカルで動かす

ビルド不要の静的サイトです。位置情報 API は `localhost` か HTTPS でしか動かないため、ローカルサーバー経由で開いてください。

```bash
npx serve .
# または
python3 -m http.server 8000
```

## テスト

```bash
npm test                              # Web アプリ（node --test、依存パッケージなし）
cd ml && uv sync --group dev && uv run pytest   # ML（モデルのダウンロード不要）
```

GitHub Actions で push / Pull Request ごとに両方を実行します（`.github/workflows/ci.yml`）。

## 機械学習

`ml/` に Python パッケージ `outfit-ml` があります。CLIP のゼロショット分類で服の写真を判定する仕組み、評価、ブラウザ用ファイルの書き出しを担当します。詳しくは [ml/README.md](ml/README.md)。

## GitHub Pages での公開

`main` ブランチのルートをそのまま公開しています（Settings → Pages → Source: *Deploy from a branch* / `main` / `/ (root)`）。

## ディレクトリ構成

```
.
├── index.html            # 画面
├── manifest.webmanifest  # ホーム画面に追加するための設定
├── icon.svg / icon-*.png # アプリアイコン
├── model/tagger.json     # 分類器（ml/ で生成）
├── tests/                # Web アプリのテスト
├── ml/                   # 機械学習（Python）
└── src/
    ├── app.js            # UI ロジック
    ├── rules.js          # 服装の候補データと提案ルール
    ├── weather.js        # Open-Meteo からの天気取得
    ├── closet.js         # 手持ちの服の保存・読み込み
    ├── photos.js         # 服の写真の縮小・保存（IndexedDB）
    ├── tagger.js         # 端末内 CLIP の読み込みと写真の判定
    ├── tagger-core.js    # 埋め込み → 確率の計算（Python と同じ計算）
    ├── shops.js          # ユニクロ／ZOZOTOWN の検索リンク
    └── style.css         # スタイル
```

## 今後のアイデア

- [ ] 過去に着た服の履歴を保存し、かぶりを避ける
- [ ] 1週間分の天気からコーデを計画
- [ ] AI による自然言語でのコーデ提案

## ライセンス

MIT
