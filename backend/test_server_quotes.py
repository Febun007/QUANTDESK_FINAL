import unittest
from unittest.mock import Mock, patch

import requests

from server import fetch_one


class QuoteFetchTests(unittest.TestCase):
    def test_fetches_quote_from_bounded_chart_request(self):
        response = Mock()
        response.json.return_value = {
            "chart": {
                "result": [{
                    "meta": {
                        "symbol": "AAPL",
                        "regularMarketPrice": 100,
                        "chartPreviousClose": 95,
                        "longName": "Apple Inc.",
                        "averageDailyVolume3Month": 1230000,
                    },
                    "indicators": {"quote": [{"close": [95, 98, 100]}]},
                }]
            }
        }

        info = Mock()
        info.get_info.return_value = {
            "marketCap": 3_000_000_000_000,
            "trailingPE": 15.67,
            "averageVolume": 2_500_000,
        }
        with patch("server.req.get", return_value=response) as get, patch(
            "server.yf.Ticker", return_value=info
        ):
            quote = fetch_one("AAPL")

        get.assert_called_once_with(
            "https://query1.finance.yahoo.com/v8/finance/chart/AAPL",
            params={"range": "5d", "interval": "1d"},
            headers={"User-Agent": "Mozilla/5.0 QuantDesk/1.0"},
            timeout=8,
        )
        self.assertEqual(quote["price"], 100)
        self.assertEqual(quote["change"], 5)
        self.assertEqual(quote["pct"], 5.26)
        self.assertEqual(quote["name"], "Apple Inc.")
        self.assertEqual(quote["mktCap"], "3.00T")
        self.assertEqual(quote["pe"], 15.67)
        self.assertEqual(quote["vol"], "2.50M")

    def test_keeps_quote_when_fundamentals_are_unavailable(self):
        response = Mock()
        response.json.return_value = {
            "chart": {
                "result": [{
                    "meta": {
                        "regularMarketPrice": 100,
                        "chartPreviousClose": 95,
                        "averageDailyVolume3Month": 1230000,
                    },
                    "indicators": {"quote": [{"close": [95, 98, 100]}]},
                }]
            }
        }

        with patch("server.req.get", return_value=response), patch(
            "server.yf.Ticker", side_effect=RuntimeError("fundamentals unavailable")
        ):
            quote = fetch_one("AAPL")

        self.assertEqual(quote["price"], 100)
        self.assertEqual(quote["mktCap"], "N/A")
        self.assertEqual(quote["pe"], "N/A")
        self.assertEqual(quote["vol"], "1.23M")

    def test_returns_no_quote_when_provider_fails(self):
        with patch(
            "server.req.get",
            side_effect=requests.RequestException("provider unavailable"),
        ):
            self.assertIsNone(fetch_one("AAPL"))


if __name__ == "__main__":
    unittest.main()
