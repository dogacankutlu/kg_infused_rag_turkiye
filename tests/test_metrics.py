from src.eval.metrics import accuracy, em, f1


def test_em_exact():
    assert em("İstanbul", "İstanbul") == 1.0
    assert em("istanbul ", "İstanbul") == 1.0  # normalize lower + strip
    assert em("Ankara", "İstanbul") == 0.0


def test_accuracy_substring():
    assert accuracy("Cevap İstanbul'dur", "İstanbul") == 1.0
    assert accuracy("İstanbul", "Paris") == 0.0


def test_f1_partial_overlap():
    score = f1("İstanbul Türkiye", "İstanbul")
    assert 0.0 < score <= 1.0


def test_f1_no_overlap():
    assert f1("Paris", "İstanbul") == 0.0
