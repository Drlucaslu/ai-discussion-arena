#!/bin/bash

# AI 讨论竞技场 - 安装脚本
# 使用方法: curl -fsSL https://raw.githubusercontent.com/your-repo/ai-discussion-arena/main/install.sh | bash

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        return 1
    fi
    return 0
}

# 主安装流程
main() {
    echo ""
    echo "=================================================="
    echo "    AI 讨论竞技场 - 本地安装程序"
    echo "    AI Discussion Arena - Local Installer"
    echo "=================================================="
    echo ""

    # 检查 Node.js
    print_info "检查 Node.js 环境..."
    if ! check_command node; then
        print_error "未检测到 Node.js，请先安装 Node.js 18.0.0 或更高版本"
        print_info "安装指南: https://nodejs.org/"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js 版本过低，需要 18.0.0 或更高版本"
        print_info "当前版本: $(node -v)"
        exit 1
    fi
    print_success "Node.js 版本: $(node -v)"

    # 检查 npm 或 pnpm
    print_info "检查包管理器..."
    if check_command pnpm; then
        PKG_MANAGER="pnpm"
        print_success "使用 pnpm 作为包管理器"
    elif check_command npm; then
        PKG_MANAGER="npm"
        print_success "使用 npm 作为包管理器"
    else
        print_error "未检测到 npm 或 pnpm"
        exit 1
    fi

    # 检查 git
    print_info "检查 Git..."
    if ! check_command git; then
        print_error "未检测到 Git，请先安装 Git"
        exit 1
    fi
    print_success "Git 已安装"

    # 设置安装目录
    INSTALL_DIR="${HOME}/ai-discussion-arena"
    
    if [ -d "$INSTALL_DIR" ]; then
        print_warning "目录 $INSTALL_DIR 已存在"
        read -p "是否覆盖安装? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "安装已取消"
            exit 0
        fi
        rm -rf "$INSTALL_DIR"
    fi

    # 克隆仓库
    print_info "下载项目代码..."
    git clone https://github.com/your-username/ai-discussion-arena.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    print_success "代码下载完成"

    # 安装依赖
    print_info "安装项目依赖（这可能需要几分钟）..."
    if [ "$PKG_MANAGER" = "pnpm" ]; then
        pnpm install
    else
        npm install
    fi
    print_success "依赖安装完成"

    # 创建数据目录
    print_info "初始化数据目录..."
    mkdir -p "$INSTALL_DIR/data"
    print_success "数据目录已创建"

    # 构建项目
    print_info "构建项目..."
    if [ "$PKG_MANAGER" = "pnpm" ]; then
        pnpm run build
    else
        npm run build
    fi
    print_success "项目构建完成"

    # 创建启动脚本的符号链接
    chmod +x "$INSTALL_DIR/start.sh"
    chmod +x "$INSTALL_DIR/stop.sh"

    echo ""
    echo "=================================================="
    print_success "安装完成！"
    echo "=================================================="
    echo ""
    echo "使用方法:"
    echo "  启动服务: cd $INSTALL_DIR && ./start.sh"
    echo "  停止服务: cd $INSTALL_DIR && ./stop.sh"
    echo ""
    echo "服务启动后，请在浏览器中访问:"
    echo "  http://localhost:7788"
    echo ""
    echo "数据存储位置: $INSTALL_DIR/data/"
    echo ""
}

main "$@"
