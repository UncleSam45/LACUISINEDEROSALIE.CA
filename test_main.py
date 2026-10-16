import json
import sys
import unittest

import main


class OrjsonFallbackTests(unittest.TestCase):
    def tearDown(self) -> None:
        sys.modules.pop("orjson", None)

    def test_fallback_exposes_compatible_json_api(self) -> None:
        main.install_orjson_fallback()
        import orjson

        encoded = orjson.dumps(
            {"café": 2, "answer": 42},
            option=orjson.OPT_SORT_KEYS | orjson.OPT_APPEND_NEWLINE,
        )

        self.assertIsInstance(encoded, bytes)
        self.assertTrue(encoded.endswith(b"\n"))
        self.assertEqual(orjson.loads(encoded), {"answer": 42, "café": 2})
        self.assertIsNotNone(orjson.__spec__)

    def test_fallback_supports_default_serializer(self) -> None:
        main.install_orjson_fallback()
        import orjson

        encoded = orjson.dumps({"values": {1, 2}}, default=sorted)

        self.assertEqual(json.loads(encoded), {"values": [1, 2]})


class PublicPreviewTests(unittest.TestCase):
    def test_launcher_serves_the_public_document(self) -> None:
        import types
        from unittest.mock import patch
        try:
            from fastapi import FastAPI
            from fastapi.staticfiles import StaticFiles
            from fastapi.testclient import TestClient
        except ImportError:
            self.skipTest("Preview dependencies are not installed")

        class PreviewApp(FastAPI):
            def add_static_files(self, url, path):
                self.mount(url, StaticFiles(directory=path))

        app = PreviewApp()
        ui = types.SimpleNamespace(run=lambda **kwargs: None)
        with patch.dict(sys.modules, {"nicegui": types.SimpleNamespace(app=app, ui=ui)}):
            main.build_ui(8888)
        with TestClient(app) as client:
            for url in ["/", "/index.html"]:
                response = client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.content, (main.BASE_DIR / "index.html").read_bytes())
                self.assertEqual(response.headers["cache-control"], "no-store")
            for url in ["/logo.png", "/assets/closure.css"]:
                self.assertEqual(client.get(url).status_code, 200)


if __name__ == "__main__":
    unittest.main()
