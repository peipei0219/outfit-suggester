"""Hugging Face transformers の CLIP で埋め込みを計算する。

ブラウザでは同じモデルの ONNX 版（Xenova/clip-vit-base-patch32）の画像側だけを動かし、
ここで計算したテキスト側の重みと掛け合わせる。両者は同じ重みから変換されているので
埋め込み空間は一致する（量子化による小さな誤差はある）。
"""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np

DEFAULT_MODEL = "openai/clip-vit-base-patch32"
# ブラウザ（transformers.js）で使う同じモデルの ONNX 版
BROWSER_MODEL = "Xenova/clip-vit-base-patch32"


class ClipEncoder:
    def __init__(self, model_id: str = DEFAULT_MODEL, device: str | None = None, batch_size: int = 64):
        import torch
        from transformers import CLIPModel, CLIPProcessor

        self.torch = torch
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = CLIPModel.from_pretrained(model_id).to(self.device).eval()
        self.processor = CLIPProcessor.from_pretrained(model_id)
        self.batch_size = batch_size
        self.model_id = model_id

    def encode_text(self, texts: list[str]) -> np.ndarray:
        out = []
        with self.torch.no_grad():
            for i in range(0, len(texts), self.batch_size):
                batch = self.processor(text=texts[i : i + self.batch_size], return_tensors="pt", padding=True)
                feats = self.model.get_text_features(**{k: v.to(self.device) for k, v in batch.items()})
                out.append(feats.cpu().numpy())
        return np.concatenate(out).astype(np.float32)

    def encode_images(self, images: Iterable) -> np.ndarray:
        images = list(images)
        out = []
        with self.torch.no_grad():
            for i in range(0, len(images), self.batch_size):
                batch = self.processor(images=images[i : i + self.batch_size], return_tensors="pt")
                feats = self.model.get_image_features(pixel_values=batch["pixel_values"].to(self.device))
                out.append(feats.cpu().numpy())
        return np.concatenate(out).astype(np.float32)
