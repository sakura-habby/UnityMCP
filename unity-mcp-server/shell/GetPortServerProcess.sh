#!/bin/bash

# 设置端口号
PORT=28080

# 获取使用指定端口的进程 ID
PIDS=$(lsof -i :$PORT -t)

# 如果没有找到相关进程，退出
if [ -z "$PIDS" ]; then
    echo "No process found using port: $PORT"
    exit 1
fi

# 遍历每个进程 ID
for PID in $PIDS; do
    # 获取进程详细信息
    PROCESS_NAME=$(ps -p $PID -o comm=)
    PROCESS_PATH=$(ps -p $PID -o command=)
    PROCESS_START_TIME=$(ps -p $PID -o start=)
    PROCESS_SESSION_ID=$(ps -p $PID -o sess=)
    PROCESS_COMMAND=$(ps -p $PID -o command=)

    # 输出进程信息
    echo "----------------------------------"
    echo "PID: $PID"
    echo "CommandLine: $PROCESS_COMMAND"
    echo "ProcessName: $PROCESS_NAME"
    echo "Path: $PROCESS_PATH"
    echo "StartTime: $PROCESS_START_TIME"
    echo "SessionID: $PROCESS_SESSION_ID"
    echo "----------------------------------"
done

# 按回车键退出
read -p "Press Enter to exit..."
