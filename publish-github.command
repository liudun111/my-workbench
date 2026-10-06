#!/bin/bash
# ============================================================
#  我的工作台 · 一键发布到 GitHub
#  仓库：https://github.com/liudun111/my-workbench
# ============================================================
cd "$(dirname "$0")" || exit 1

USER_NAME="liudun111"
REPO="my-workbench"
DESC="我的工作台 · 个人项目工作台（Node.js + 内置 SQLite，零依赖）"
API="https://api.github.com"

echo ""
echo "  ============================================================"
echo "    发布到  https://github.com/$USER_NAME/$REPO"
echo "  ============================================================"
echo ""
echo "  需要一个 GitHub Personal Access Token（权限勾选 repo）"
echo ""
echo "  点下面这个链接可以一键创建（已预选 repo 权限）："
echo "  https://github.com/settings/tokens/new?scopes=repo&description=$REPO"
echo ""
echo "  创建后复制那串 ghp_... 粘贴到下面（输入时不会显示）"
echo ""

read -r -s -p "  Token: " TOKEN
echo ""
echo ""

if [ -z "$TOKEN" ]; then
  echo "  [取消] 没有输入 Token"
  echo ""
  read -p "  按回车键关闭 ..." _
  exit 1
fi

# ---------- 1. 校验 Token ----------
echo "  → 校验 Token ..."
WHO=$(curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$API/user" | sed -n 's/.*"login"[ ]*:[ ]*"\([^"]*\)".*/\1/p')
if [ -z "$WHO" ]; then
  echo "  [失败] Token 无效或已过期"
  echo ""
  read -p "  按回车键关闭 ..." _
  exit 1
fi
echo "  ✓ 已登录为：$WHO"

# ---------- 2. 创建仓库（已存在则跳过） ----------
echo "  → 检查 / 创建仓库 ..."
HTTP=$(curl -s -o /tmp/wb_gh.json -w "%{http_code}" -X POST "$API/user/repos" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"name\":\"$REPO\",\"description\":\"$DESC\",\"private\":false,\"has_issues\":true,\"has_wiki\":false}")

if [ "$HTTP" = "201" ]; then
  echo "  ✓ 仓库已创建"
elif [ "$HTTP" = "422" ]; then
  echo "  ✓ 仓库已存在，继续推送"
else
  echo "  [失败] 创建仓库返回 HTTP $HTTP"
  cat /tmp/wb_gh.json
  echo ""
  read -p "  按回车键关闭 ..." _
  exit 1
fi

git remote remove origin 2>/dev/null
git remote add origin "https://github.com/$USER_NAME/$REPO.git"

# ---------- 3. 凭据存入 macOS 钥匙串 ----------
echo "  → 保存凭据到钥匙串 ..."
git config --global credential.helper osxkeychain 2>/dev/null
if printf "protocol=https\nhost=github.com\nusername=%s\npassword=%s\n\n" "$USER_NAME" "$TOKEN" | git credential-osxkeychain store 2>/dev/null; then
  echo "  ✓ 已保存（以后推送不用再输）"
else
  echo "  ! 未能保存，推送时可能还会提示输入"
fi

# ---------- 4. 推送 ----------
echo "  → 推送代码 ..."
if git push -u origin main; then
  echo "  ✓ 推送成功"
else
  echo ""
  echo "  [失败] 推送被拒绝"
  echo "  常见原因：Token 未勾选 repo 权限 / Token 已过期 / 无该仓库写权限"
  echo ""
  read -p "  按回车键关闭 ..." _
  exit 1
fi

echo ""
echo "  ============================================================"
echo "    ✅ 发布完成"
echo "    https://github.com/$USER_NAME/$REPO"
echo "  ============================================================"
echo ""
read -p "  按回车键关闭 ..." _
