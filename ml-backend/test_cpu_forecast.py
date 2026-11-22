import os
import time
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import jwt
import numpy as np
import pandas as pd

import ml_server


class CpuForecastRouteTests(unittest.TestCase):
    def test_cpu_prediction_uses_bounded_baseline_without_training_models(self):
        secret = "cpu-forecast-test-secret-with-at-least-32-bytes"
        token = jwt.encode(
            {"sub": "test", "exp": int(time.time()) + 60},
            secret,
            algorithm="HS256",
        )
        ticker = Mock()
        ticker.history.return_value = pd.DataFrame({
            "Close": 100 * np.exp(np.arange(300, dtype=np.float64) * 0.001)
        })

        with patch.dict(os.environ, {"JWT_SECRET": secret}), patch.object(
            ml_server, "DEVICE", SimpleNamespace(type="cpu")
        ), patch("yfinance.Ticker", return_value=ticker), patch.object(
            ml_server, "get_or_train", side_effect=AssertionError("CPU route must not train")
        ):
            response = ml_server.app.test_client().get(
                "/api/predict/NVDA",
                headers={"Authorization": f"Bearer {token}"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["symbol"], "NVDA")
        self.assertEqual(payload["model"], "CPU trend baseline")
        self.assertEqual(len(payload["forecast"]), ml_server.HORIZON)
        ticker.history.assert_called_once_with(period="1y")


if __name__ == "__main__":
    unittest.main()
