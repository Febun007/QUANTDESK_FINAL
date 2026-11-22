import os
import time
import unittest
from unittest.mock import Mock, patch

import jwt

import agent_server


class AgentProviderTests(unittest.TestCase):
    def test_claude_uses_current_haiku_model(self):
        response = Mock()
        response.status_code = 200
        response.json.return_value = {"content": [{"text": "OK"}]}
        with patch.object(agent_server, "ANTHROPIC_KEY", "test-key"), patch.object(
            agent_server.requests, "post", return_value=response
        ) as post:
            text, ok = agent_server.ask_claude("system", [{"role": "user", "content": "Hi"}])

        self.assertTrue(ok)
        self.assertEqual(text, "OK")
        self.assertEqual(post.call_args.kwargs["json"]["model"], "claude-haiku-5-5")

    def test_ai_router_reports_successful_fallback(self):
        with patch.object(agent_server, "ask_claude", return_value=(None, False)), patch.object(
            agent_server, "ask_groq", return_value=("OK", True)
        ):
            result = agent_server.ask_ai("system", [{"role": "user", "content": "Hi"}])

        self.assertEqual(result, ("OK", "groq", True))

    def test_ai_router_reports_when_all_providers_fail(self):
        with patch.object(agent_server, "ask_claude", return_value=(None, False)), patch.object(
            agent_server, "ask_groq", return_value=("provider error", False)
        ):
            result = agent_server.ask_ai("system", [{"role": "user", "content": "Hi"}])

        self.assertEqual(result, ("provider error", "groq", False))

    def test_analyze_returns_error_status_when_all_providers_fail(self):
        secret = "agent-test-secret-with-at-least-32-bytes"
        token = jwt.encode(
            {"sub": "test", "exp": int(time.time()) + 60},
            secret,
            algorithm="HS256",
        )
        with patch.dict(os.environ, {"JWT_SECRET": secret}), patch.object(
            agent_server, "get_full_stock_data", return_value={"ticker": "NVDA"}
        ), patch.object(
            agent_server, "ask_ai", return_value=("provider error", "groq", False)
        ):
            response = agent_server.app.test_client().post(
                "/agent/analyze",
                headers={"Authorization": f"Bearer {token}"},
                json={"ticker": "NVDA", "question": "Test"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("AI providers are unavailable", response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()
