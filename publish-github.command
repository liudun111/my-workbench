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

# ---------- 2. 创建仓库 ----------
echo "  → 创建仓库 ..."
HTTP=$(curl -s -o /tmp/wb_gh.json -w "%{http_code}" -X POST "$API/user/repos" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"name\":\"$REPO\",\"description\":\"$DESC\",\"private\":false,\"has_issues\":true,\"has_wiki\":false}")

if [ "$HTTP" = "201" ]; then
  echo "  ✓ 仓库已创建"
elif [ "$HTTP" = "422" ]; then
  echo "  ✓ 仓库已存在，直接推送"
else
  echo "  [失败] 创建仓库返回 HTTP $HTTP"
  cat /tmp/wb_gh.json
  echo ""
  read -p "  按回车键关闭 ..." _
  exit 1
fi

# ---------- 3. 推送 ----------
git remote remove origin 2>/dev/null
git remote add origin "https://github.com/$USER_NAME/$REPO.git"

echo "  → 推送代码 ..."
if git push "https://oauth2:$TOKEN@github.com/$USER_NAME/$REPO.git" main:main 2>&1 | sed "s/$TOKEN/****/g"; then
  git branch --set-upstream-to=origin/main main 2>/dev/null
else
  echo "  [失败] 推送失败"
  echo ""
  read -p "  按回车键关闭 ..." _
  exit 1
fi

# ---------- 4. 记住凭据（可选） ----------
if printf "protocol=https\nhost=github.com\nusername=%s\npassword=%s\n" "$USER_NAME" "$TOKEN" | git credential-osxkeychain store 2>/dev/null; then
  git config --global credential.helper osxkeychain 2>/dev/null
  echo "  ✓ 凭据已存入 macOS 钥匙串，以后 git push 不用再输 Token"
fi

echo ""
echo "  ============================================================"
echo "    ✅ 发布完成"
echo "    https://github.com/$USER_NAME/$REPO"
echo "  ============================================================"
echo ""
read -p "  按回车键关闭 ..." _
