#!/bin/bash

# デプロイスクリプト：バージョンを自動インクリメントしてプッシュ

MARKER_FILE="submission_backup_2026_03_31/marker_debug.html"
CAMERA_FILE="submission_backup_2026_03_31/camera_debug.html"

# 現在のバージョンを取得（marker_debug から）
CURRENT_VERSION=$(grep "const VERSION = " "$MARKER_FILE" | sed "s/.*VERSION = '//;s/'.*//" | head -1)
echo "現在のバージョン: $CURRENT_VERSION"

# 今日の日付を取得（YYYYMMDD形式）
TODAY=$(date +%Y%m%d)

# 前回のバージョンから日付と番号を抽出
IFS='-' read -r OLD_DATE NUM <<< "$CURRENT_VERSION"

# 日付が変わってたら001にリセット、同じ日なら番号をインクリメント
if [ "$OLD_DATE" = "$TODAY" ]; then
  NUM=$((10#${NUM} + 1))
  echo "本日の継続デプロイ: 番号を${NUM}に更新"
else
  NUM=1
  echo "新しい日付: ${OLD_DATE} → ${TODAY}"
fi

NEW_VERSION="${TODAY}-$(printf '%03d' $NUM)"
echo "新しいバージョン: $NEW_VERSION"

# marker_debug を更新
sed -i.bak "s/const VERSION = '.*'/const VERSION = '$NEW_VERSION'/" "$MARKER_FILE"
rm "${MARKER_FILE}.bak"

# camera_debug を更新
sed -i.bak "s/const VERSION = '.*'/const VERSION = '$NEW_VERSION'/" "$CAMERA_FILE"
rm "${CAMERA_FILE}.bak"

# コミット
git add "$MARKER_FILE" "$CAMERA_FILE"
git commit -m "Bump version to $NEW_VERSION" 2>/dev/null

# プッシュ
git push origin main

echo "✅ デプロイ完了: $NEW_VERSION"
