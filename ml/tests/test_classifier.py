import numpy as np
import pytest

from outfit_ml.classifier import Head, build_zeroshot_head, l2_normalize, softmax, topk


def test_softmax_sums_to_one():
    p = softmax(np.array([[1.0, 2.0, 3.0], [1000.0, 1000.0, 0.0]]))
    np.testing.assert_allclose(p.sum(axis=1), 1.0)
    assert np.isfinite(p).all()


def test_zeroshot_head_rows_are_unit_norm(encode_text):
    head = build_zeroshot_head(["a", "b"], [["x", "y"], ["z"]], encode_text)
    np.testing.assert_allclose(np.linalg.norm(head.weights, axis=1), 1.0, rtol=1e-5)


def test_ensemble_is_mean_of_normalized_prompts(encode_text):
    head = build_zeroshot_head(["a"], [["p1", "p2", "p3"]], encode_text)
    expected = l2_normalize(l2_normalize(encode_text(["p1", "p2", "p3"])).mean(axis=0))
    np.testing.assert_allclose(head.weights[0], expected, rtol=1e-5)


def test_head_predicts_closest_class():
    w = l2_normalize(np.eye(3, dtype=np.float32))
    head = Head(labels=["x", "y", "z"], weights=w)
    img = np.array([[0.1, 0.9, 0.0]], dtype=np.float32) * 7  # スケールに依存しない
    assert topk(head.predict_proba(img)[0], head.labels, k=1)[0][0] == "y"


def test_mismatched_lengths_raise(encode_text):
    with pytest.raises(ValueError):
        build_zeroshot_head(["a", "b"], [["x"]], encode_text)


def test_is_confident_needs_margin():
    from outfit_ml.classifier import is_confident

    proba = np.array([[0.9, 0.05, 0.05], [0.51, 0.49, 0.0], [0.4, 0.3, 0.3]])
    assert is_confident(proba, 0.5, 0.25).tolist() == [True, False, False]
