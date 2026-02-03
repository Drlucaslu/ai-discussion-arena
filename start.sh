#!/bin/bash

# AI 讨论竞技场 - 启动脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=${PORT:-7788}
PID_FILE="$SCRIPT_DIR/data/server.pid"

# 检查是否已经在运行
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo -e "${BLUE}[INFO]${NC} 服务已在运行 (PID: $OLD_PID)"
        echo "访问地址: http://localhost:$PORT"
        exit 0
    else
        rm -f "$PID_FILE"
    fi
fi

# 确保数据目录存在
mkdir -p "$SCRIPT_DIR/data"

echo ""
echo "=================================================="
echo "    AI 讨论竞技场 - 启动中..."
echo "=================================================="
echo ""

# 检查是否已构建
if [ ! -d "$SCRIPT_DIR/dist" ]; then
    echo -e "${BLUE}[INFO]${NC} 首次运行，正在构建项目..."
    if command -v pnpm &> /dev/null; then
        pnpm run build
    else
        npm run build
    fi
fi

# 启动服务
echo -e "${BLUE}[INFO]${NC} 启动服务器..."
PORT=$PORT NODE_ENV=production nohup node dist/index.js > "$SCRIPT_DIR/data/server.log" 2>&1 &
echo $! > "$PID_FILE"

# 等待服务启动
sleep 2

if ps -p $(cat "$PID_FILE") > /dev/null 2>&1; then
    echo -e "${GREEN}[SUCCESS]${NC} 服务启动成功！"
    echo ""
    echo "访问地址: http://localhost:$PORT"
    echo "日志文件: $SCRIPT_DIR/data/server.log"
    echo ""
    echo "使用 ./stop.sh 停止服务"
else
    echo "服务启动失败，请查看日志:"
    cat "$SCRIPT_DIR/data/server.log"
    exit 1
fi
