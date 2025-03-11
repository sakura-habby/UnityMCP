// 简单的日志记录器，用于记录MCP服务器的日志信息
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 日志级别
enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

class Logger {
  private logStream: NodeJS.WritableStream | null = null;
  private logDir: string;
  private logFile: string;
  private initialized = false;

  constructor() {
    // 默认日志目录和文件
    this.logDir = join(__dirname, '../logs');
    this.logFile = join(this.logDir, 'url-text-reader-mcp.log');
  }

  /**
   * 初始化日志系统
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 确保日志目录存在
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }

      // 创建日志写入流
      this.logStream = createWriteStream(this.logFile, { flags: 'a' });
      this.initialized = true;
      
      this.info('日志系统初始化成功');
    } catch (error) {
      console.error('初始化日志系统失败:', error);
      // 如果无法创建日志文件，仍然允许程序继续运行，只是不会写入日志
    }
  }

  /**
   * 写入日志
   * @param level 日志级别
   * @param message 日志消息
   * @param data 附加数据
   */
  private log(level: LogLevel, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data: data || null,
    };

    const logString = JSON.stringify(logEntry);

    // 同时输出到控制台和日志文件
    console.log(`[${timestamp}] [${level}] ${message}`, data ? data : '');

    // 写入日志文件（如果已初始化）
    if (this.logStream && this.initialized) {
      this.logStream.write(logString + '\n');
    }
  }

  /**
   * 记录调试信息
   * @param message 日志消息
   * @param data 附加数据
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * 记录普通信息
   * @param message 日志消息
   * @param data 附加数据
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * 记录警告信息
   * @param message 日志消息
   * @param data 附加数据
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * 记录错误信息
   * @param message 日志消息
   * @param data 附加数据
   */
  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  /**
   * 关闭日志系统
   */
  async close(): Promise<void> {
    if (this.logStream) {
      return new Promise<void>((resolve) => {
        if (this.logStream) {
          this.logStream.end(() => {
            this.logStream = null;
            this.initialized = false;
            resolve();
          });
        } else {
          resolve();
        }
      });
    }
  }
}

// 导出单例实例
export const logger = new Logger();
