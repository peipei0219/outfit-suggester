import json

import numpy as np

from outfit_ml import export, taxonomy


def test_f16_roundtrip():
    x = np.array([[0.0, 1.0, -0.5], [0.25, 3.140625, -2.0]], dtype=np.float32)
    np.testing.assert_array_equal(export.decode_f16(export.encode_f16(x), x.shape), x)


def test_known_f16_encoding_shared_with_js():
    """src/tagger-core.test.js と同じ値。JS 側のデコーダと形式が一致していることを保証する。"""
    assert export.encode_f16(np.array([1.0, -2.0, 0.5, 0.0])) == "ADwAwAA4AAA="


def test_tagger_json_structure(tmp_path, encode_text):
    heads = export.build_heads(encode_text)
    data = export.to_json(heads, "text-model", "image-model")
    path = tmp_path / "tagger.json"
    export.write(path, data)
    loaded = json.loads(path.read_text(encoding="utf-8"))

    assert loaded["format"] == export.FORMAT_VERSION
    assert loaded["heads"]["garment"]["labels"] == [g.key for g in taxonomy.GARMENTS]
    assert loaded["heads"]["color"]["labels"] == [c.key for c in taxonomy.COLORS]
    for key, g in loaded["garments"].items():
        assert g["category"] in taxonomy.CATEGORIES
        assert set(g["seasons"]) <= set(taxonomy.SEASONS)
        assert g["ja"] == taxonomy.GARMENT_BY_KEY[key].ja

    head = export.head_from_json(loaded["heads"]["garment"])
    np.testing.assert_allclose(head.weights, heads["garment"].weights, atol=1e-3)
