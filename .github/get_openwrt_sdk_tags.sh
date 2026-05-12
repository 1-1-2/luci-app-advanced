#!/bin/bash
# 用法: ./fetch_tags.sh [-v]

set -euo pipefail

# ---------- 参数解析 ----------
VERBOSE=false
if [[ "${1:-}" == "-v" ]]; then
    VERBOSE=true
    shift
fi

# ---------- 配置 ----------
REPO="openwrt/sdk"
TOKEN_URL="https://ghcr.io/token?service=ghcr.io&scope=repository:${REPO}:pull"
BASE_URL="https://ghcr.io/v2/${REPO}/tags/list"
OUTPUT_FILE="openwrt_sdk_tags.json"

# ---------- 辅助函数 ----------
log() {
    if $VERBOSE; then
        echo "[DEBUG] $*" >&2
    fi
}

error_exit() {
    echo "❌ 错误: $*" >&2
    exit 1
}

# 检查依赖
for cmd in curl jq; do
    if ! command -v $cmd &>/dev/null; then
        error_exit "缺少命令 '$cmd'，请先安装: sudo apt install $cmd"
    fi
done

# ---------- 1. 获取 Token ----------
echo "🔑 正在获取 token ..."
log "请求 URL: $TOKEN_URL"
TOKEN_JSON=$(curl -s "$TOKEN_URL")
log "Token 接口原始返回: $TOKEN_JSON"
TOKEN=$(echo "$TOKEN_JSON" | jq -r '.token')
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    error_exit "无法从响应中提取 token，请检查仓库名或网络。响应内容: $TOKEN_JSON"
fi
log "获取到 token (前16字符): ${TOKEN:0:16}..."

# ---------- 2. 分页获取标签 ----------
ALL_TAGS=()
NEXT_URL="${BASE_URL}?n=1000"
PAGE=0

while [[ -n "$NEXT_URL" ]]; do
    PAGE=$((PAGE + 1))
    echo "📄 获取第 $PAGE 页"
    log "请求 URL: $NEXT_URL"

    # 临时文件
    HEADERS_FILE=$(mktemp)
    BODY_FILE=$(mktemp)
    log "临时文件: headers=$HEADERS_FILE  body=$BODY_FILE"

    # 发起请求，捕获 HTTP 状态码
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$BODY_FILE" -D "$HEADERS_FILE" \
        -H "Authorization: Bearer $TOKEN" \
        "$NEXT_URL")
    log "HTTP 状态码: $HTTP_CODE"

    if [[ "$HTTP_CODE" != "200" ]]; then
        echo "❌ 第 $PAGE 页请求失败 (HTTP $HTTP_CODE)" >&2
        echo "响应头:" >&2
        cat "$HEADERS_FILE" >&2
        echo "响应体:" >&2
        cat "$BODY_FILE" >&2
        rm -f "$HEADERS_FILE" "$BODY_FILE"
        error_exit "终止执行，请检查上方输出。"
    fi

    # 打印响应头（verbose 时）
    if $VERBOSE; then
        echo "[DEBUG] 响应头:" >&2
        cat "$HEADERS_FILE" >&2
        echo "[DEBUG] 响应体前 500 字符:" >&2
        head -c 500 "$BODY_FILE" >&2
        echo >&2
    fi

    # 提取标签
    PAGE_TAGS=$(jq -r '.tags[]?' "$BODY_FILE")
    if [[ -z "$PAGE_TAGS" ]]; then
        echo "⚠️  第 $PAGE 页没有返回任何标签（可能已到末尾或仓库无标签）。"
    else
        TAG_COUNT=$(echo "$PAGE_TAGS" | wc -l)
        echo "   本页获取到 $TAG_COUNT 个标签"
        while IFS= read -r tag; do
            ALL_TAGS+=("$tag")
        done <<< "$PAGE_TAGS"
    fi

    # 提取下一页链接（相对路径补全）
    NEXT_URL=$(grep -i '^link:' "$HEADERS_FILE" | \
               grep -o '<[^>]*>; rel="next"' | \
               head -1 | \
               sed 's/.*<\(.*\)>; rel="next".*/\1/' || true)

    # ---------- 修复点：补全相对路径 ----------
    if [[ -n "$NEXT_URL" && "$NEXT_URL" != http* ]]; then
        NEXT_URL="https://ghcr.io${NEXT_URL}"
    fi

    log "解析出的下一页链接: ${NEXT_URL:-无}"

    rm -f "$HEADERS_FILE" "$BODY_FILE"
done

TOTAL=${#ALL_TAGS[@]}
echo "✅ 共获取到 $TOTAL 个标签"

if [[ $TOTAL -eq 0 ]]; then
    error_exit "标签列表为空，未生成输出文件。"
fi

# ---------- 3. 生成 JSON ----------
printf '%s\n' "${ALL_TAGS[@]}" \
    | jq -R . \
    | jq -s --arg name "$REPO" '{name: $name, tags: .}' \
    > "$OUTPUT_FILE"

echo "💾 已保存至: $OUTPUT_FILE ($TOTAL 个标签)"
log "前 10 个标签:"
if $VERBOSE; then
    head -n 10 "$OUTPUT_FILE"
fi