import io
import json
import unittest
import urllib.error

import reference_fixture as rf

GOOD = {"source": rf.SOURCE, "sha256": rf.SHA, "sizeBytes": rf.SIZE,
        "url": "https://project.example.invalid/storage/v1/object/sign/b/o.dem?token=synthetic"}


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class ReferenceFixtureTests(unittest.TestCase):
    def test_accepts_only_the_authorized_identity(self):
        self.assertEqual(rf.validate(dict(GOOD)), GOOD["url"])
        for change, code in (({"source": "A91_DEMO_URL"}, "SOURCE_MISMATCH"),
                             ({"sha256": "f" * 64}, "IDENTITY_MISMATCH"),
                             ({"sizeBytes": rf.SIZE - 1}, "IDENTITY_MISMATCH"),
                             ({"sizeBytes": str(rf.SIZE)}, "IDENTITY_MISMATCH"),
                             ({"url": "http://insecure.invalid/x"}, "URL_INVALID"),
                             ({"url": "https://user:pw@host.invalid/x"}, "URL_INVALID"),
                             ({"url": "https://host.invalid/x\nInjected: 1"}, "URL_INVALID"),
                             ({"url": None}, "URL_INVALID")):
            with self.assertRaisesRegex(ValueError, code):
                rf.validate({**GOOD, **change})
        with self.assertRaisesRegex(ValueError, "RESPONSE_INVALID"):
            rf.validate([GOOD])

    def test_resolve_sends_the_transport_secret_and_never_returns_errors_with_the_url(self):
        seen = {}

        def opener(request, timeout):
            seen["auth"] = request.headers.get("Authorization")
            seen["method"] = request.get_method()
            return Response(json.dumps(GOOD).encode())

        self.assertEqual(rf.resolve("s" * 40, opener=opener), GOOD["url"])
        self.assertEqual((seen["auth"], seen["method"]), ("Bearer " + "s" * 40, "POST"))
        with self.assertRaisesRegex(ValueError, "TRANSPORT_MISSING"):
            rf.resolve("short", opener=opener)

        def refused(request, timeout):
            raise urllib.error.HTTPError(rf.ENDPOINT, 409, "conflict", {}, None)

        with self.assertRaises(ValueError) as caught:
            rf.resolve("s" * 40, opener=refused)
        self.assertEqual(str(caught.exception), "REFERENCE_FIXTURE_HTTP_409")


if __name__ == "__main__":
    unittest.main()
