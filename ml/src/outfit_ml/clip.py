"""CLIP の埋め込みを ONNX Runtime で計算する。

ブラウザ（transformers.js）と **同じ ONNX ファイル** を使う。
- テキスト側: onnx/text_model.onnx（float32）… tagger.json のクラス重みを作る
- 画像側: onnx/vision_model_quantized.onnx（8bit 量子化）… ブラウザが実際に動かすもの
これにより、評価の数値がそのまま「アプリで出る精度」になる。PyTorch も不要。
"""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np

MODEL_ID = "Xenova/clip-vit-base-patch32"
TEXT_FILE = "onnx/text_model.onnx"
# ブラウザ側 src/tagger.js の dtype: "q8" と同じファイル
VISION_FILE = "onnx/vision_model_quantized.onnx"


class ClipEncoder:
    def __init__(
        self,
        model_id: str = MODEL_ID,
        text_file: str = TEXT_FILE,
        vision_file: str = VISION_FILE,
        batch_size: int = 32,
    ):
        from huggingface_hub import hf_hub_download
        from transformers import CLIPImageProcessor, CLIPTokenizerFast

        self.model_id = model_id
        self.batch_size = batch_size
        self.tokenizer = CLIPTokenizerFast.from_pretrained(model_id)
        self.image_processor = CLIPImageProcessor.from_pretrained(model_id)
        self._paths = {
            "text": lambda: hf_hub_download(model_id, text_file),
            "vision": lambda: hf_hub_download(model_id, vision_file),
        }
        self._sessions: dict = {}

    def _session(self, kind: str):
        if kind not in self._sessions:
            import onnxruntime as ort

            self._sessions[kind] = ort.InferenceSession(self._paths[kind](), providers=["CPUExecutionProvider"])
        return self._sessions[kind]

    def encode_text(self, texts: list[str]) -> np.ndarray:
        sess = self._session("text")
        names = {i.name for i in sess.get_inputs()}
        out = []
        for i in range(0, len(texts), self.batch_size):
            tok = self.tokenizer(
                texts[i : i + self.batch_size],
                padding="max_length",
                max_length=77,
                truncation=True,
                return_tensors="np",
            )
            feeds = {k: v.astype(np.int64) for k, v in tok.items() if k in names}
            out.append(sess.run(["text_embeds"], feeds)[0])
        return np.concatenate(out).astype(np.float32)

    def encode_images(self, images: Iterable) -> np.ndarray:
        sess = self._session("vision")
        images = list(images)
        out = []
        for i in range(0, len(images), self.batch_size):
            pixels = self.image_processor(images=images[i : i + self.batch_size], return_tensors="np")["pixel_values"]
            out.append(sess.run(["image_embeds"], {"pixel_values": pixels.astype(np.float32)})[0])
        return np.concatenate(out).astype(np.float32)
