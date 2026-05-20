#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$ROOT_DIR/vendor/sdk"
DEFAULT_SDK_DIR="/Users/mpl/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_jsoxolvw307z12_cbf0/msg/file/2026-04/sdk/client_sdk/springboot2.x/jar"
SDK_DIR="${TDT_UCS_SDK_DIR:-$DEFAULT_SDK_DIR}"

mkdir -p "$TARGET_DIR"

cp "$SDK_DIR/cas-client-integration-support-springboot2-1.1.0.0.jar" "$TARGET_DIR/"
cp "$SDK_DIR/cas-client-integration-support-springboot2-1.1.0.0.pom" "$TARGET_DIR/" || true

echo "[prepare-sdk] Copied Spring Boot 2 SDK into $TARGET_DIR"
