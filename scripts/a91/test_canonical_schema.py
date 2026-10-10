"""Shared-vector conformance for the Python canonicalizer.

Runs the SAME canonical/vectors.json as canonical_schema.check.mjs. Inputs are
decoded into this runtime's native carriers (Python int for 64-bit ids, where
JavaScript receives decimal strings), and every expected text, class, error
and table digest must match byte for byte.
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canonical_schema as canonical  # noqa: E402

VECTORS = json.loads((Path(__file__).resolve().parent / "canonical" / "vectors.json").read_text(encoding="utf-8"))
ABSENT = object()


class NAType:  # same type name pandas uses for pd.NA
    pass


def decode(value):
    if isinstance(value, list):
        return [decode(item) for item in value]
    if isinstance(value, dict):
        tag = value.get("$")
        if isinstance(tag, str):
            if tag in ("u64", "bigint"):
                return int(value["v"])  # numpy uint64 / Python int carrier
            if tag == "f64":
                return float(value["v"])
            if tag == "lossy_u64":
                return float(int(value["v"]))
            if tag == "undefined":
                return NAType()
            if tag == "absent":
                return ABSENT
            raise AssertionError(f"unknown vector tag {tag}")
        decoded = {key: decode(item) for key, item in value.items()}
        return {key: item for key, item in decoded.items() if item is not ABSENT}
    return value


class CanonicalVectorTests(unittest.TestCase):
    def test_contract_version_matches_vectors(self):
        self.assertEqual(VECTORS["canonicalContractVersion"], canonical.CANONICAL_CONTRACT_VERSION)

    def test_value_vectors(self):
        for vector in VECTORS["values"]:
            with self.subTest(vector["name"]):
                value = decode(vector["input"])
                if "error" in vector:
                    with self.assertRaises(canonical.CanonicalError) as caught:
                        canonical.canonicalize_value(value, vector["field"])
                    self.assertEqual(caught.exception.code, vector["error"])
                else:
                    self.assertEqual(
                        canonical.canonicalize_value(value, vector["field"]),
                        (vector["text"], vector["cls"]),
                    )

    def test_table_vectors(self):
        for vector in VECTORS["tables"]:
            with self.subTest(vector["name"]):
                options = {"block_rows": vector["blockRows"]} if "blockRows" in vector else {}
                result = canonical.summarize_rows(vector["table"], [decode(row) for row in vector["rows"]], **options)
                self.assertEqual(result["summary"], vector["expected"])

    def test_python_cannot_silently_round_a_steam_id(self):
        exact = 76561198012345679
        self.assertNotEqual(int(float(exact)), exact)  # the double really is lossy
        self.assertEqual(canonical.canonical_text(exact, "steamid"), '"76561198012345679"')
        with self.assertRaises(canonical.CanonicalError) as caught:
            canonical.canonical_text(float(exact), "steamid")
        self.assertEqual(caught.exception.code, "U64_PRECISION_LOST")

    def test_null_is_never_zero_false_or_empty(self):
        texts = {canonical.canonical_text(value, "x") for value in (None, 0, False, "", [])}
        self.assertEqual(len(texts), 5)


if __name__ == "__main__":
    unittest.main()
