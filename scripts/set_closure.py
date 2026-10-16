"""Update the closure flag and public shells for both Pages publishing modes."""
import json
import shutil
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2 or sys.argv[1] not in ('open', 'closed'):
    raise SystemExit('Usage: python3 scripts/set_closure.py open|closed (confirm client reopening first)')
closed = sys.argv[1] == 'closed'
p = ROOT / 'assets/data/settings.json'
settings = json.loads(p.read_text())
settings['closure']['enabled'] = closed
p.write_text(json.dumps(settings, ensure_ascii=False, indent=2) + '\n')
shutil.copy2(ROOT / ('closure.html' if closed else 'storefront.html'), ROOT / 'index.html')
for name in ('404.html', 'admin.html'):
    if closed:
        shutil.copy2(ROOT / ('closure.html' if name == '404.html' else 'storefront.html'), ROOT / name)
    else:
        (ROOT / name).unlink(missing_ok=True)
