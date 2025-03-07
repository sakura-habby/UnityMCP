#!/bin/bash

# 设置端口号
PORT=28080

# 获取使用指定端口的进程 ID
PIDS=$(netstat -tuln | grep ":$PORT" | awk '{print $7}' | cut -d'/' -f1 | sort -u)

# 如果没有找到相关进程，退出
if [ -z "$PIDS" ]; then
    echo "do not find any process using port: $PORT"
    exit 1
fi

# 遍历每个进程 ID
for PID in $PIDS; do
    # 获取进程详细信息
    PROCESS_NAME=$(ps -p $PID -o comm=)
    PROCESS_PATH=$(readlink -f /proc/$PID/exe)
    PROCESS_START_TIME=$(ps -p $PID -o lstart=)
    PROCESS_SESSION_ID=$(ps -p $PID -o sid=)
    PROCESS_COMMAND=$(cat /proc/$PID/cmdline | tr '\0' ' ')

    # 输出进程信息
    echo "----------------------------------"
    echo "Id: $PID"
    echo "CommandLine: $PROCESS_COMMAND"
    echo "ProcessName: $PROCESS_NAME"
    echo "Path: $PROCESS_PATH"
    echo "StartTime: $PROCESS_START_TIME"
    echo "SessionId: $PROCESS_SESSION_ID"
    echo "----------------------------------"
done

# 按回车键退出
read -p "Press Enter to exit..."
