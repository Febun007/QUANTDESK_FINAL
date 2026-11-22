import unittest

import numpy as np

from ml_server import HORIZON, classify_signal, cpu_baseline_predict


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

    def test_cpu_baseline_returns_bounded_fourteen_day_forecast(self):
        close = 100 * np.exp(np.arange(300, dtype=np.float64) * 0.001)

        for horizon in (14, 30, 60):
            with self.subTest(horizon=horizon):
                result = cpu_baseline_predict(close, horizon)

                self.assertEqual(len(result["forecast"]), horizon)
                self.assertEqual(result["horizon"], horizon)
                self.assertEqual(result["model"], "CPU trend baseline")
                self.assertGreaterEqual(result["validationSamples"], 1)
                self.assertGreater(result["targetPrice"], close[-1])
                self.assertAlmostEqual(result["forecast"][-1]["predicted"], result["targetPrice"])
                self.assertLessEqual(result["deltaPct"], horizon * 0.25)

    def test_cpu_baseline_rejects_insufficient_or_invalid_prices(self):
        with self.assertRaises(ValueError):
            cpu_baseline_predict(np.ones(20 + 60 - 1), 60)
        with self.assertRaises(ValueError):
            cpu_baseline_predict(np.array([1.0] * (20 + HORIZON - 1) + [np.nan]))


if __name__ == "__main__":
    unittest.main()
