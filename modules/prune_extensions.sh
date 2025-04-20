#!/usr/bin/env bash

RECOMMENDATIONS=$(jq -r '.recommendations[]' .vscode/extensions.json)

for ext in $(code --list-extensions); do
    # 推奨リストに含まれないものをアンインストール
    if ! echo "$RECOMMENDATIONS" | grep -Fxq "$ext"; then
        code --uninstall-extension "$ext" --force
    fi
done
