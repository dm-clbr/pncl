"""Emit a self-contained edge-function package (source only, no env files)."""
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
entry = sys.argv[2]
seen = {}

def visit(path):
    path = path.resolve()
    name = path.relative_to(root).as_posix()
    if name in seen:
        return
    text = path.read_text()
    seen[name] = text
    for spec in re.findall(r'''(?:from\s*|import\s*)["'](\.[^"']+)["']''', text):
        visit(path.parent / spec)

visit(root / entry)
for name in ('deno.json', 'deno.jsonc'):
    if (root / name).exists():
        seen[name] = (root / name).read_text()
print(json.dumps({'entrypoint_path': entry, 'files': [{'name': k, 'content': v} for k, v in seen.items()]}))
