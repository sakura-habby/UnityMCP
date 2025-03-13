// 改进的日志记录器，用于记录MCP服务器的日志信息
import { createWriteStream, mkdirSync, existsSync, renameSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 日志级别枚举，按严重程度排序
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// 日志级别名称映射
const LogLevelName = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

// 日志配置接口
interface LoggerConfig {
  // 日志目录
  logDir?: string;
  // 日志文件名
  logFileName?: string;
  // 最小日志级别
  minLevel?: LogLevel;
  // 是否输出到控制台
  console?: boolean;
  // 是否输出到文件
  file?: boolean;
  // 日志文件最大大小（字节）
  maxFileSize?: number;
  // 保留的日志文件数量
  maxFiles?: number;
  // 时区，默认为 'Asia/Shanghai'
  timezone?: string;
}

/**
 * 使用Intl.DateTimeFormat格式化日期时间，支持指定时区
 * @param date 日期对象
 * @param timezone 时区，默认为 'Asia/Shanghai'（中国标准时间）
 * @returns 格式化后的日期时间字符串
 */
function formatDateTime(date: Date, timezone = 'Asia/Shanghai'): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(date).replace(/\//g, '.').replace(',', '');
}

/**
 * 改进的日志记录器类
 */
class Logger extends EventEmitter {
  private static instance: Logger | null = null;
  private logStream: NodeJS.WritableStream | null = null;
  private logDir: string;
  private logFile: string;
  private initialized = false;
  private initializing = false;
  private initPromise: Promise<void> | null = null;
  private config: LoggerConfig;
  private currentFileSize = 0;
  private timezone: string;

  /**
   * 私有构造函数，防止直接实例化
   */
  private constructor(config: LoggerConfig = {}) {
    super();
    
    // 默认配置
    this.config = {
      logDir: join(__dirname, '../logs'),
      logFileName: 'code-diagrams-mcp.log',
      minLevel: LogLevel.DEBUG,
      console: true,
      file: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      timezone: 'Asia/Shanghai',
      ...config
    };
    
    this.logDir = this.config.logDir!;
    this.logFile = join(this.logDir, this.config.logFileName!);
    this.timezone = this.config.timezone!;
    
    // 设置最大监听器数量，避免内存泄漏警告
    this.setMaxListeners(20);
    
    // 处理进程退出时的清理
    process.on('exit', () => {
      this.close().catch(console.error);
    });
    
    // 处理未捕获的异常和拒绝的Promise
    process.on('uncaughtException', (err) => {
      this.error('未捕获的异常', err);
      this.close().catch(console.error);
    });
    
    process.on('unhandledRejection', (reason) => {
      this.error('未处理的Promise拒绝', reason);
    });
  }

  /**
   * 获取Logger单例实例
   */
  public static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    } else if (config) {
      // 如果提供了新配置，更新现有实例的配置
      Logger.instance.updateConfig(config);
    }
    return Logger.instance;
  }

  /**
   * 更新日志配置
   */
  public updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logDir = this.config.logDir!;
    this.logFile = join(this.logDir, this.config.logFileName!);
    this.timezone = this.config.timezone!;
    
    // 如果已初始化，则重新初始化以应用新配置
    if (this.initialized) {
      this.close().then(() => this.initialize()).catch(console.error);
    }
  }

  /**
   * 初始化日志系统
   * 返回Promise以便调用者可以等待初始化完成
   */
  public async initialize(): Promise<void> {
    // 如果已经在初始化中，返回现有的Promise
    if (this.initializing && this.initPromise) {
      return this.initPromise;
    }
    
    // 如果已经初始化，直接返回
    if (this.initialized) {
      return Promise.resolve();
    }
    
    this.initializing = true;
    
    // 创建初始化Promise
    this.initPromise = new Promise<void>((resolve, reject) => {
      try {
        // 确保日志目录存在
        if (!existsSync(this.logDir)) {
          mkdirSync(this.logDir, { recursive: true });
        }
        
        // 检查现有日志文件大小
        if (existsSync(this.logFile)) {
          const stats = statSync(this.logFile);
          this.currentFileSize = stats.size;
          
          // 如果超过最大大小，执行日志轮转
          if (this.currentFileSize >= this.config.maxFileSize!) {
            this.rotateLogFiles();
          }
        }

        // 创建日志写入流
        this.logStream = createWriteStream(this.logFile, { flags: 'a' });
        
        // 监听流的错误事件
        this.logStream.on('error', (err) => {
          console.error('日志写入错误:', err);
          this.emit('error', err);
        });
        
        this.initialized = true;
        this.initializing = false;
        
        this.info('日志系统初始化成功', {
          config: {
            ...this.config,
            // 不记录可能敏感的环境变量
            env: undefined
          }
        });
        
        resolve();
      } catch (error) {
        this.initializing = false;
        console.error('初始化日志系统失败:', error);
        this.emit('error', error);
        reject(error);
      }
    });
    
    return this.initPromise;
  }

  /**
   * 执行日志文件轮转
   * 将当前日志文件重命名为带时间戳的文件，并删除超过最大数量的旧日志文件
   */
  private rotateLogFiles(): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newFileName = this.config.logFileName!.replace('.log', `-${timestamp}.log`);
      const newFilePath = join(this.logDir, newFileName);
      
      // 重命名当前日志文件
      if (existsSync(this.logFile)) {
        renameSync(this.logFile, newFilePath);
      }
      
      // 重置文件大小计数器
      this.currentFileSize = 0;
      
      // TODO: 实现删除超过最大数量的旧日志文件的逻辑
      // 这里需要列出目录中的所有日志文件，按修改时间排序，并删除最旧的文件
    } catch (error) {
      console.error('日志轮转失败:', error);
    }
  }

  /**
   * 写入日志
   * @param level 日志级别
   * @param message 日志消息
   * @param data 附加数据
   */
  private async log(level: LogLevel, message: string, data?: any): Promise<void> {
    // 如果日志级别低于最小级别，则不记录
    if (level < this.config.minLevel!) {
      return;
    }
    
    // 如果尚未初始化，尝试初始化
    if (!this.initialized && !this.initializing) {
      try {
        await this.initialize();
      } catch (error) {
        // 初始化失败，只输出到控制台
        console.error('日志初始化失败，只输出到控制台:', error);
      }
    }
    
    const now = new Date();
    const timestamp = formatDateTime(now, this.timezone);
    const levelName = LogLevelName[level];
    
    // 构建日志条目
    const logEntry = {
      timestamp,
      level: levelName,
      message,
      data: data || null,
    };
    
    // 序列化为JSON
    const logString = JSON.stringify(logEntry);
    
    // 输出到控制台
    if (this.config.console) {
      const consoleMethod = level === LogLevel.ERROR ? console.error :
                           level === LogLevel.WARN ? console.warn :
                           level === LogLevel.INFO ? console.info :
                           console.debug;
      
      consoleMethod(`[${timestamp}] [${levelName}] ${message}`, data ? data : '');
    }
    
    // 写入日志文件
    if (this.config.file && this.logStream && this.initialized) {
      const logLine = logString + '\n';
      this.logStream.write(logLine);
      
      // 更新当前文件大小
      this.currentFileSize += Buffer.byteLength(logLine);
      
      // 检查是否需要轮转日志文件
      if (this.currentFileSize >= this.config.maxFileSize!) {
        // 关闭当前流
        await this.close();
        
        // 执行日志轮转
        this.rotateLogFiles();
        
        // 创建新的日志流
        this.logStream = createWriteStream(this.logFile, { flags: 'a' });
        this.initialized = true;
      }
    }
  }

  /**
   * 记录调试信息
   * @param message 日志消息
   * @param data 附加数据
   */
  public debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * 记录普通信息
   * @param message 日志消息
   * @param data 附加数据
   */
  public info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * 记录警告信息
   * @param message 日志消息
   * @param data 附加数据
   */
  public warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * 记录错误信息
   * @param message 日志消息
   * @param data 附加数据
   */
  public error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  /**
   * 关闭日志系统
   */
  public async close(): Promise<void> {
    if (!this.logStream) {
      return Promise.resolve();
    }
    
    return new Promise<void>((resolve) => {
      if (this.logStream) {
        this.logStream.end(() => {
          this.logStream = null;
          this.initialized = false;
          this.initializing = false;
          this.initPromise = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// 导出单例实例和类型
export const logger = Logger.getInstance();
export { LogLevel, LoggerConfig };
