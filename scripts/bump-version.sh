#!/usr/bin/env bash
# 每次發布前執行：把 index.html 和 version.json 裡的版本號換成現在的時間。
# 手機上的舊版本打開時會發現版本不同，自動重新載入最新版。
set -euo pipefail
cd "$(dirname "$0")/.."
v=$(date -u +%Y%m%d%H%M)
sed -i -E "s/\?v=[0-9]+/?v=$v/g; s/(name=\"app-version\" content=\")[0-9]+/\1$v/" index.html
printf '{ "version": "%s" }\n' "$v" > version.json
echo "version → $v"
