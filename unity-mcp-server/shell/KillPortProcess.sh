#!/bin/bash

# 检查是否支持颜色
if [ -t 1 ]; then
    # 启用颜色支持
    RED=$(tput setaf 1)
    GREEN=$(tput setaf 2)
    YELLOW=$(tput setaf 3)
    NC=$(tput sgr0) # 重置颜色
else
    # 如果不支持颜色，设置为空
    RED=""
    GREEN=""
    YELLOW=""
    NC=""
fi

# 提示用户输入端口号
read -p "${YELLOW}Enter port to kill:${NC} " port

# 查找使用指定端口的进程（分别查询 TCP 和 UDP）
tcp_pids=$(lsof -ti tcp:$port)
udp_pids=$(lsof -ti udp:$port)
pids=$(echo "$tcp_pids $udp_pids" | tr '\n' ' ' | xargs)

if [ -z "$pids" ]; then
    echo -e "${YELLOW}No process found using port $port${NC}"
else
    echo -e "${RED}Terminating processes:${NC}"
    for pid in $pids; do
        # 获取进程的命令名称
        command=$(ps -p $pid -o comm=)
        if [ -z "$command" ]; then
            command="unknown"
        fi
        echo -e "${RED}Killing PID $pid ($command)${NC}"
        kill -9 $pid
    done
    echo -e "${GREEN}Port $port released${NC}"
fi

# 按回车键退出
read -p "Press Enter to exit..."
