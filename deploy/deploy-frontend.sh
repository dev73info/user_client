#!/usr/bin/env bash
# 73Info 前端零停机部署（在 GitHub Actions runner 上跑）
#
# 做四件事，任何一步失败都会把线上切回上一版：
#   1. rsync 产物到站点目录下的 releases/.staging-<版本>
#   2. 写 .complete 标记，把 staging 改名成 releases/<版本>
#   3. 调服务器上的白名单脚本原子切换 <站点>/index 符号链接
#   4. 探活：确认线上真的换成了新版本，而不是缓存或旧版本
#
# 必需环境变量：
#   SSH_HOST SSH_USER SSH_PORT SSH_KEY_FILE  部署账号与密钥
#   SITE                                     站点目录名，如 support.73info.cn
#   PUBLIC_URL                               探活用的公开地址，如 https://support.73info.cn
#   RELEASE                                  版本号（tag），如 v1.0.1-20261019
# 可选：
#   DIST_DIR        默认 dist
#   SITES_ROOT      默认 /opt/1panel/www/sites
#   SKIP_VERIFY     设为 1 跳过探活（只用于排查）
set -Eeuo pipefail

: "${SSH_HOST:?缺少 SSH_HOST}"
: "${SSH_USER:?缺少 SSH_USER}"
: "${SSH_PORT:=22}"
: "${SSH_KEY_FILE:?缺少 SSH_KEY_FILE}"
: "${SITE:?缺少 SITE}"
: "${PUBLIC_URL:?缺少 PUBLIC_URL}"
: "${RELEASE:?缺少 RELEASE}"
DIST_DIR=${DIST_DIR:-dist}
SITES_ROOT=${SITES_ROOT:-/opt/1panel/www/sites}
SKIP_VERIFY=${SKIP_VERIFY:-0}

die() {
    printf '错误：%s\n' "$*" >&2
    exit 1
}

log() {
    printf '\n[deploy] %s\n' "$*"
}

# 版本号会进远端路径与 rm -rf，先收窄字符集
[[ "$RELEASE" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9]{8})?$ ]] ||
    die "版本号必须形如 v1.0.1-20261019，收到：$RELEASE"

[[ -f "$DIST_DIR/index.html" ]] || die "构建产物缺少 $DIST_DIR/index.html"

ssh_opts=(-i "$SSH_KEY_FILE" -p "$SSH_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes)
remote() {
    ssh "${ssh_opts[@]}" "$SSH_USER@$SSH_HOST" "$@"
}
rsync_ssh="ssh -i $SSH_KEY_FILE -p $SSH_PORT -o BatchMode=yes -o StrictHostKeyChecking=yes"

site_dir="$SITES_ROOT/$SITE"
staging="$site_dir/releases/.staging-$RELEASE"
target="$site_dir/releases/$RELEASE"

# ---------------------------------------------------------------- 0. 前置检查
log "目标站点 $SITE，版本 $RELEASE"
remote "test -d '$site_dir/releases'" ||
    die "远端没有 $site_dir/releases。服务器 bootstrap 没跑完？"

previous=$(remote "readlink '$site_dir/index' 2>/dev/null || echo ''")
if [[ "$previous" == "releases/$RELEASE" ]]; then
    die "$RELEASE 已经是在线版本，拒绝重复发布。换一个新 tag。"
fi
printf '当前在线：%s\n' "${previous:-(未知)}"

# 记下新版本首页引用的资源文件名，切换后用它判断线上是否真的换了版本
probe_asset=$(grep -oE '/assets/[A-Za-z0-9._~-]+\.(js|css)' "$DIST_DIR/index.html" | head -1 || true)
[[ -n "$probe_asset" ]] || log "警告：首页没找到 /assets/ 引用，探活将只校验状态码"

# ---------------------------------------------------------------- 1. 传产物
log "上传产物到 $staging"
remote "rm -rf '$staging' && mkdir -p '$staging'"
rsync -az --delete -e "$rsync_ssh" "$DIST_DIR/" "$SSH_USER@$SSH_HOST:$staging/"
# .complete 最后写：切换脚本只认带标记的目录，判断产物是否传完整
remote "test -f '$staging/index.html' && touch '$staging/.complete'"

# ---------------------------------------------------------------- 2. 落成正式版本目录
log "提交为 releases/$RELEASE"
remote "set -e
    if [ -d '$target' ]; then rm -rf '$target'; fi
    mv -T '$staging' '$target'
"

# ---------------------------------------------------------------- 3. 原子切换
rollback() {
    local reason=$1
    printf '\n[deploy] 探活失败：%s\n' "$reason" >&2
    if [[ -n "$previous" ]]; then
        printf '[deploy] 回滚到 %s\n' "$previous" >&2
        if remote "sudo -n /usr/local/bin/73info-switch-frontend '$SITE' '${previous#releases/}'"; then
            printf '[deploy] 已回滚。线上仍是 %s\n' "$previous" >&2
        else
            printf '[deploy] 回滚命令本身失败，请立刻人工检查！\n' >&2
        fi
    else
        printf '[deploy] 没有可回滚的上一版，请人工检查！\n' >&2
    fi
    exit 1
}

log "原子切换 index -> releases/$RELEASE"
remote "sudo -n /usr/local/bin/73info-switch-frontend '$SITE' '$RELEASE'" ||
    rollback "切换命令返回失败"

# ---------------------------------------------------------------- 4. 探活
if [[ "$SKIP_VERIFY" == 1 ]]; then
    log "已按 SKIP_VERIFY 跳过探活"
    exit 0
fi

log "探活 $PUBLIC_URL"
http_code=$(curl -sS -o /tmp/deploy-index.html -w '%{http_code}' --max-time 20 "$PUBLIC_URL/") ||
    rollback "首页请求失败"
[[ "$http_code" == 200 ]] || rollback "首页返回 $http_code"

if [[ -n "$probe_asset" ]]; then
    grep -qF "$probe_asset" /tmp/deploy-index.html ||
        rollback "首页没有引用新版本的 $probe_asset，线上可能还是旧版本"

    # 只看状态码是不够的：nginx 的 SPA 兜底会把任何未命中的路径返回一份首页副本
    # （200 + text/html），"资源不存在" 和 "资源正常" 在状态码上完全没法区分。
    # 2026-10-20 的故障演练里，产物引用了一个根本不存在的 /assets/*.js，
    # 这一句把它判成了 200，部署照常"成功"——最该拦住的坏产物一个都没拦住。
    asset_meta=$(curl -sS -o /tmp/deploy-asset -w '%{http_code} %{content_type}' --max-time 20 \
        "$PUBLIC_URL$probe_asset") || rollback "资源 $probe_asset 请求失败"
    asset_code=${asset_meta%% *}
    asset_type=${asset_meta#* }
    [[ "$asset_code" == 200 ]] || rollback "资源 $probe_asset 返回 $asset_code"
    [[ "$asset_type" == *javascript* || "$asset_type" == *css* ]] ||
        rollback "资源 $probe_asset 的 content-type 是 ${asset_type:-空}（疑似软 404：nginx 兜底返回了首页副本）"
    index_sum=$(sha256sum /tmp/deploy-index.html | cut -d' ' -f1)
    asset_sum=$(sha256sum /tmp/deploy-asset | cut -d' ' -f1)
    [[ "$index_sum" != "$asset_sum" ]] ||
        rollback "资源 $probe_asset 的内容与首页完全相同（软 404）"
    printf '资源 %s -> 200 (%s)\n' "$probe_asset" "$asset_type"
fi

# 连打几次，确认不是偶发命中
for _ in 1 2 3; do
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$PUBLIC_URL/")
    [[ "$code" == 200 ]] || rollback "连续探活里出现 $code"
done

log "部署完成：$SITE -> $RELEASE"
