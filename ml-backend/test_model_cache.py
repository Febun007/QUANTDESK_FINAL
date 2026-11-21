import unittest
from collections import OrderedDict
from unittest.mock import patch

import numpy as np

import ml_server


class ModelCacheTests(unittest.TestCase):
    def setUp(self):
        with ml_server._lock:
            self.original_cache = OrderedDict(ml_server._cache)
            ml_server._cache.clear()

    def tearDown(self):
        with ml_server._lock:
            ml_server._cache.clear()
            ml_server._cache.update(self.original_cache)

    def test_model_cache_evicts_least_recently_used_ensemble(self):
        features = np.zeros((300, ml_server.N_FEAT), dtype=np.float32)
        close = np.ones(300, dtype=np.float32)
        trained_models = {"model": object()}

        with patch.object(ml_server, "build_features", return_value=(features, close)), patch.object(
            ml_server,
            "train_ensemble",
            return_value=(trained_models, np.zeros(ml_server.N_FEAT), np.ones(ml_server.N_FEAT), None),
        ) as train:
            history = [None] * 300
            ml_server.get_or_train("AAPL", history)
            ml_server.get_or_train("MSFT", history)
            ml_server.get_or_train("AAPL", history)
            ml_server.get_or_train("NVDA", history)

        self.assertEqual(train.call_count, 3)
        self.assertEqual(list(ml_server._cache), ["AAPL", "NVDA"])


if __name__ == "__main__":
    unittest.main()
