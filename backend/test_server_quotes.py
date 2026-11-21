import unittest
from unittest.mock import Mock, patch

import requests

from server import fetch_one


def chart_response(volumes=None):
    response = Mock()
    response.json.return_value = {
        "chart": {
            "result": [{
                "meta": {
                    "symbol": "AAPL",
                    "regularMarketPrice": 100,
                    "chartPreviousClose": 95,
                    "longName": "Apple Inc.",
                },
                "indicators": {
                    "quote": [{
                        "close": [95, 98, 100],
                        "volume": volumes if volumes is not None else [2_500_000] * 63,
                    }]
                },
            }]
        }
    }
    return response


def metric_result(metric, value, as_of="2026-11-19"):
    return {
        "meta": {"type": [metric]},
        metric: [{"asOfDate": as_of, "reportedValue": {"raw": value}}],
    }


def fundamentals_response(market_cap=3_000_000_000_000, pe=15.67, net_income=191_000_000_000):
    response = Mock()
    response.json.return_value = {
        "timeseries": {
            "result": [
                metric_result("trailingMarketCap", market_cap),
                metric_result("trailingPeRatio", pe),
                metric_result("trailingNetIncome", net_income),
            ],
            "error": None,
        }
    }
    return response


class QuoteFetchTests(unittest.TestCase):
    def test_fetches_quote_and_fundamentals_in_parallel_provider_calls(self):
        chart = chart_response()
        fundamentals = fundamentals_response()

        def fake_get(url, **kwargs):
            if "/chart/" in url:
                return chart
            if "/fundamentals-timeseries/" in url:
                return fundamentals
            raise AssertionError(f"Unexpected provider URL: {url}")

        with patch("server.req.get", side_effect=fake_get) as get:
            quote = fetch_one("AAPL")

        self.assertEqual(len(get.call_args_list), 2)
        chart_call = next(call for call in get.call_args_list if "/chart/" in call.args[0])
        facts_call = next(call for call in get.call_args_list if "/fundamentals-timeseries/" in call.args[0])
        self.assertEqual(
            chart_call.kwargs["params"],
            {"range": "3mo", "interval": "1d"},
        )
        self.assertEqual(facts_call.kwargs["params"]["symbol"], "AAPL")
        self.assertIn("trailingPeRatio", facts_call.kwargs["params"]["type"])
        self.assertEqual(chart_call.kwargs["timeout"], 8)
        self.assertEqual(facts_call.kwargs["timeout"], 8)

        self.assertEqual(quote["price"], 100)
        self.assertEqual(quote["change"], 5)
        self.assertEqual(quote["pct"], 5.26)
        self.assertEqual(quote["name"], "Apple Inc.")
        self.assertEqual(quote["mktCap"], "3.00T")
        self.assertEqual(quote["pe"], 15.67)
        self.assertEqual(quote["vol"], "2.50M")

    def test_calculates_pe_when_provider_ratio_is_missing(self):
        chart = chart_response()
        fundamentals = fundamentals_response(pe=None, net_income=200_000_000_000)

        def fake_get(url, **kwargs):
            return chart if "/chart/" in url else fundamentals

        with patch("server.req.get", side_effect=fake_get):
            quote = fetch_one("AAPL")

        self.assertEqual(quote["pe"], 15)

    def test_hides_pe_for_loss_making_company_even_if_provider_ratio_is_stale(self):
        chart = chart_response()
        fundamentals = fundamentals_response(
            pe=15.67,
            net_income=-1_000_000_000,
        )

        def fake_get(url, **kwargs):
            if "/chart/" in url:
                return chart
            response = fundamentals
            response.json.return_value["timeseries"]["result"][1] = metric_result(
                "trailingPeRatio", 15.67, "2026-07-29"
            )
            return response

        with patch("server.req.get", side_effect=fake_get):
            quote = fetch_one("AAPL")

        self.assertEqual(quote["mktCap"], "3.00T")
        self.assertEqual(quote["pe"], "N/A")

    def test_keeps_quote_and_chart_volume_when_fundamentals_are_unavailable(self):
        chart = chart_response(volumes=[1_230_000] * 63)

        def fake_get(url, **kwargs):
            if "/chart/" in url:
                return chart
            raise requests.RequestException("fundamentals unavailable")

        with patch("server.req.get", side_effect=fake_get):
            quote = fetch_one("AAPL")

        self.assertEqual(quote["price"], 100)
        self.assertEqual(quote["mktCap"], "N/A")
        self.assertEqual(quote["pe"], "N/A")
        self.assertEqual(quote["vol"], "1.23M")

    def test_returns_no_quote_when_chart_provider_fails(self):
        with patch(
            "server.req.get",
            side_effect=requests.RequestException("provider unavailable"),
        ):
            self.assertIsNone(fetch_one("AAPL"))


if __name__ == "__main__":
    unittest.main()
