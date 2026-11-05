import hashlib

import numpy as np
import pytest


def fake_encode(texts, dim=16):
    """文字列から決まった乱数ベクトルを作る偽のテキストエンコーダ（モデル不要）。"""
    out = []
    for t in texts:
        seed = int.from_bytes(hashlib.sha256(t.encode()).digest()[:8], "little")
        out.append(np.random.default_rng(seed).standard_normal(dim))
    return np.asarray(out, dtype=np.float32)


@pytest.fixture
def encode_text():
    return fake_encode
