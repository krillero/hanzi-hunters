#!/usr/bin/env bash
# Download a fresh CC-CEDICT snapshot for vocabulary research (not committed: see .gitignore).
# Usage: bash docs/vocabulary-toolkit/tools/fetch-cedict.sh [url]
# License: CC BY-SA 4.0, CC-CEDICT contributors, published by MDBG (see reference/SOURCE-NOTES.txt).
# Record the printed date and SHA-256 in the batch's source notes.
set -euo pipefail
url="${1:-https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz}"
out="$(cd "$(dirname "$0")/.." && pwd)/reference/cedict.gz"
tmp="$out.part"
curl -fsSL --retry 3 -o "$tmp" "$url"
gzip -t "$tmp"
mv "$tmp" "$out"
echo "saved:   $out"
echo "date:    $(gzip -dc "$out" | grep -m1 '^#! date=' | cut -d= -f2)"
echo "entries: $(gzip -dc "$out" | grep -m1 '^#! entries=' | cut -d= -f2)"
echo "sha256:  $(sha256sum "$out" | cut -d' ' -f1)"
