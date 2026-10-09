"""Read literal table declarations from a named module using an HCL2 parser."""
import sys
from pathlib import Path

import hcl2
from lark.exceptions import LarkError


def table_names(path: Path, module_name: str) -> list[str]:
    with path.open(encoding="utf-8") as source:
        document = hcl2.load(source)
    modules = [module[module_name] for module in document.get("module", []) if module_name in module]
    if len(modules) != 1:
        raise ValueError("Expected one regional DynamoDB module")
    tables = modules[0].get("tables")
    if not isinstance(tables, list) or len(tables) != 1 or not isinstance(tables[0], dict):
        raise ValueError("Expected a literal tables map")
    names = list(tables[0])
    if not names or any(not isinstance(tables[0][name], dict) for name in names):
        raise ValueError("Expected literal table definitions")
    return sorted(names)

if __name__ == "__main__":
    try:
        names = table_names(Path(sys.argv[1]), sys.argv[2])
    except (ValueError, KeyError, IndexError, OSError, LarkError):
        print("Invalid DynamoDB declaration source", file=sys.stderr)
        sys.exit(1)
    print("\n".join(names))
