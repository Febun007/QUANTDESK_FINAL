import unittest

from ml_server import classify_signal


class SignalPolicyTests(unittest.TestCase):
    def test_holds_without_holdout_evidence(self):
        self.assertEqual(classify_signal(8, "bull", 1.0, None, 8), "HOLD")

    def test_holds_when_holdout_accuracy_is_below_threshold(self):
        self.assertEqual(classify_signal(8, "bull", 1.0, 0.59, 8), "HOLD")

    def test_holds_when_models_disagree(self):
        self.assertEqual(classify_signal(8, "bull", 1 / 3, 0.75, 8), "HOLD")

    def test_buy_requires_holdout_accuracy_and_model_agreement(self):
        self.assertEqual(classify_signal(5, "bull", 1.0, 0.65, 8), "BUY")

    def test_sell_requires_holdout_accuracy_and_model_agreement(self):
        self.assertEqual(classify_signal(-5, "bear", 1.0, 0.65, 8), "SELL")

    def test_holds_with_too_few_non_overlapping_holdout_samples(self):
        self.assertEqual(classify_signal(8, "bull", 1.0, 0.75, 7), "HOLD")


if __name__ == "__main__":
    unittest.main()
