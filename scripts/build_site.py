"""Assemble the public artifact without modifying the original storefront."""
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]

def build(destination, settings=None):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    for name in ('404.html', 'admin.html'):
        (destination / name).unlink(missing_ok=True)
    for name in ('index.html', 'main.js', 'logo.png', 'banner.png', 'CNAME', '_headers'):
        shutil.copy2(ROOT / name, destination / name)
    shutil.copytree(ROOT / 'assets', destination / 'assets', dirs_exist_ok=True)
    if settings is None:
        settings = json.loads((ROOT / 'assets/data/settings.json').read_text())
    if settings.get('closure', {}).get('enabled') is True:
        # The existing portal retains all its original authentication and tools.
        shutil.copy2(ROOT / 'index.html', destination / 'admin.html')
        notice = (ROOT / 'closure.html').read_text()
        for name in ('index.html', '404.html'):
            (destination / name).write_text(notice)
    (destination / '.nojekyll').touch()

if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else '_site')
