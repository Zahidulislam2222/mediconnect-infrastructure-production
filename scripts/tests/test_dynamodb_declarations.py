"""CI tests for semantic regional Terraform declaration discovery."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from read_dynamodb_declarations import table_names


class DynamoDeclarationsTest(unittest.TestCase):
    def parse(self, text, module="dynamodb_us"):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tables.tf"
            path.write_text(text,encoding="utf-8")
            return table_names(path,module)

    def test_real_map_only(self):
        self.assertEqual(self.parse('module "dynamodb_us" { tables = { "test-table" = { hash_key = "id" } } }'),["test-table"])

    def test_comments_and_unrelated_maps_cannot_declare_tables(self):
        text = '''/*
module "dynamodb_us" { tables = { "test-comment" = { hash_key = "id" } } }
*/
module "dynamodb_us" {
  # "test-line-comment" = {
  tables = { "test-real" = { hash_key = "id" } }
  tags = { "test-unrelated" = "value" }
  description = <<TEXT
  "test-heredoc" = { hash_key = "id" }
TEXT
}
'''
        self.assertEqual(self.parse(text),["test-real"])

    def test_longer_name_is_not_shorter_name(self):
        self.assertNotIn("test-table",self.parse('module "dynamodb_us" { tables = { "test-table-extra" = { hash_key = "id" } } }'))

    def test_missing_duplicate_or_nonliteral_maps_fail_closed(self):
        for text in ('module "other" { tables = {} }',
                     'module "dynamodb_us" { tables = var.tables }',
                     'module "dynamodb_us" { tables = {} }',
                     'module "dynamodb_us" { tables = {} }\nmodule "dynamodb_us" { tables = {} }'):
            with self.subTest(text=text),self.assertRaises(ValueError):
                self.parse(text)

if __name__ == "__main__":
    unittest.main()
