import os
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

import bcrypt

sys.path.insert(0, str(Path(__file__).resolve().parent))

with patch.dict(os.environ, {
    "JWT_SECRET": "test-auth-secret-that-is-long-enough-for-jwt",
    "ADMIN_PASSWORD": "test-admin-password",
    "ADMIN_EMAIL": "admin@quantdesk.test",
    "MONGO_URI": "",
    "TRUSTED_PROXY_COUNT": "0",
    "SMTP_HOST": "",
    "SMTP_USERNAME": "",
    "SMTP_PASSWORD": "",
    "SMTP_FROM": "",
}):
    import auth_server


class LoginAlertTests(unittest.TestCase):
    def setUp(self):
        auth_server.LOGIN_EVENTS.clear()
        auth_server.USERS.clear()
        auth_server.USERS["admin@quantdesk.test"] = {
            "email": "admin@quantdesk.test",
            "name": "Admin",
            "password_hash": bcrypt.hashpw(b"test-admin-password", bcrypt.gensalt()),
        }
        auth_server.USERS["trader@example.test"] = {
            "email": "trader@example.test",
            "name": "Trader",
            "password_hash": bcrypt.hashpw(b"trader-password", bcrypt.gensalt()),
        }
        self.client = auth_server.app.test_client()

    def test_successful_login_records_event_and_notifies_admin(self):
        with patch.object(auth_server, "_lookup_ip_location", return_value={
            "city": "Example City", "country": "Example Country"
        }), patch.object(auth_server, "_send_login_alert") as send_alert:
            response = self.client.post(
                "/auth/login",
                json={"email": "trader@example.test", "password": "trader-password"},
                environ_overrides={"REMOTE_ADDR": "8.8.8.8"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(auth_server.LOGIN_EVENTS), 1)
        event = auth_server.LOGIN_EVENTS[0]
        self.assertEqual(event["email"], "trader@example.test")
        self.assertEqual(event["ip"], "8.8.8.8")
        self.assertEqual(event["city"], "Example City")
        send_alert.assert_called_once_with(event)

    def test_failed_login_does_not_record_or_send_alert(self):
        with patch.object(auth_server, "_send_login_alert") as send_alert:
            response = self.client.post(
                "/auth/login",
                json={"email": "trader@example.test", "password": "incorrect"},
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(auth_server.LOGIN_EVENTS, [])
        send_alert.assert_not_called()

    def test_login_history_is_only_available_to_admin(self):
        admin_token = auth_server.generate_token("admin@quantdesk.test", "Admin")
        user_token = auth_server.generate_token("trader@example.test", "Trader")

        missing_token = self.client.get("/auth/admin/login-alerts")
        user_response = self.client.get(
            "/auth/admin/login-alerts",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        admin_response = self.client.get(
            "/auth/admin/login-alerts",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        self.assertEqual(missing_token.status_code, 401)
        self.assertEqual(user_response.status_code, 403)
        self.assertEqual(admin_response.status_code, 200)
        self.assertIn("email_alerts_enabled", admin_response.get_json())

    def test_admin_can_page_through_all_login_history(self):
        created_at = auth_server.datetime.now(auth_server.timezone.utc)
        auth_server.LOGIN_EVENTS.extend([
            {
                "email": f"user-{index}@example.test",
                "created_at": created_at - auth_server.timedelta(minutes=index),
                "ip": f"8.8.8.{index + 1}",
                "city": None,
                "country": None,
            }
            for index in range(5)
        ])
        token = auth_server.generate_token("admin@quantdesk.test", "Admin")
        headers = {"Authorization": f"Bearer {token}"}

        first_page = self.client.get(
            "/auth/admin/login-alerts?limit=2&offset=0", headers=headers
        ).get_json()
        second_page = self.client.get(
            "/auth/admin/login-alerts?limit=2&offset=2", headers=headers
        ).get_json()
        third_page = self.client.get(
            "/auth/admin/login-alerts?limit=2&offset=4", headers=headers
        ).get_json()

        self.assertEqual(len(first_page["events"]), 2)
        self.assertTrue(first_page["has_more"])
        self.assertEqual(first_page["next_offset"], 2)
        self.assertEqual(len(second_page["events"]), 2)
        self.assertTrue(second_page["has_more"])
        self.assertEqual(len(third_page["events"]), 1)
        self.assertFalse(third_page["has_more"])

    def test_ip_lookup_skips_private_addresses_and_uses_https_for_public(self):
        with patch.object(auth_server.requests, "get") as get:
            self.assertEqual(auth_server._lookup_ip_location("127.0.0.1"), {})
            get.assert_not_called()

            response = Mock()
            response.json.return_value = {
                "success": True, "city": "Example City", "country": "Example Country"
            }
            get.return_value = response
            location = auth_server._lookup_ip_location("8.8.8.8")

        self.assertEqual(location["city"], "Example City")
        self.assertEqual(get.call_args.args[0], "https://ipwho.is/8.8.8.8")
        self.assertEqual(get.call_args.kwargs["timeout"], 3)


if __name__ == "__main__":
    unittest.main()
