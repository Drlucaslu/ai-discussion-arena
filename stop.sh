#!/bin/bash

# AI 讨论竞技场 - 停止脚本

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/data/server.pid"

echo ""
echo "=================================================="
echo "    AI 讨论竞技场 - 停止服务"
echo "=================================================="
echo ""

if [ ! -f "$PID_FILE" ]; then
    echo -e "${YELLOW}[WARNING]${NC} 未找到运行中的服务"
    exit 0
fi

PID=$(cat "$PID_FILE")

if ps -p "$PID" > /dev/null 2>&1; then
    echo -e "${BLUE}[INFO]${NC} 正在停止服务 (PID: $PID)..."
    kill "$PID"
    
    # 等待进程结束
    for i in {1..10}; do
        if ! ps -p "$PID" > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    
    # 如果还在运行，强制终止
    if ps -p "$PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}[WARNING]${NC} 服务未响应，强制终止..."
        kill -9 "$PID" 2>/dev/null
    fi
    
    rm -f "$PID_FILE"
    echo -e "${GREEN}[SUCCESS]${NC} 服务已停止"
else
    echo -e "${YELLOW}[WARNING]${NC} 服务进程不存在"
    rm -f "$PID_FILE"
fi

echo ""
