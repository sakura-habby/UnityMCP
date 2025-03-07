#!/bin/bash

# 彩色输出定义
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
NC='\033[0m'

read -p "${YELLOW}Enter port to kill:${NC} " port

# 查找TCP/UDP进程
pids=$(lsof -ti tcp:$port,udp:$port | tr '\n' ' ')

if [ -z "$pids" ]; then
    echo -e "${YELLOW}No process found using port $port${NC}"
else
    echo -e "${RED}Terminating processes: $pids${NC}"
    kill -9 $pids
    echo -e "${GREEN}Port $port released${NC}"
fi
