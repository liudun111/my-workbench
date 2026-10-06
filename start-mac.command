#!/bin/bash
# 我的工作台 - macOS 启动脚本（双击运行）
cd "$(dirname "$0")" || exit 1

echo ""
echo "  我的工作台 正在启动 ..."
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  [错误] 未检测到 Node.js。"
  echo "  请先安装 Node.js 22.5 或更高版本：https://nodejs.org/"
  echo ""
  read -p "  按回车键退出 ..." _
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "  [警告] 检测到 Node.js 版本较低（$(node -v)），建议升级到 22.5 或更高版本。"
  echo ""
fi

node server.js
echo ""
read -p "  已停止，按回车键关闭窗口 ..." _
