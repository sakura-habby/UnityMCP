#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logger.js';
import { CodeAnalyzer } from './services/code-analyzer.js';
import { MermaidGenerator, DiagramType } from './services/mermaid-generator.js';
import * as fs from 'fs';
import * as path from 'path';

// 创建Mermaid生成器服务
const mermaidGenerator = new MermaidGenerator();
// 代码分析器将在构造函数中异步初始化
let codeAnalyzer: CodeAnalyzer;

class CodeDiagramsMCP_Server {
  private server: Server;
  private isShuttingDown = false;

  constructor() {
    // 初始化日志系统
    logger.initialize().catch(error => {
      console.error('[Code Diagrams MCP] 初始化日志系统失败:', error);
    });
    
    // 添加启动时间戳，便于调试
    const startTime = new Date().toISOString();
    console.log(`[Code Diagrams MCP] 服务器启动时间: ${startTime}`);
    logger.info(`代码图表MCP服务器启动，时间: ${startTime}`);
    
    // 初始化MCP服务器
    this.server = new Server(
      {
        name: 'code-diagrams-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        }
      }
    );

    // 初始化工具 - 移除重复调用
    this.setupTools();

    // 错误处理
    this.server.onerror = (error) => {
      logger.error('服务器错误', error);
      console.error('[Code Diagrams MCP] 服务器错误:', error);
    };

    // 添加进程退出处理
    this.setupProcessHandlers();

    // 处理进程终止信号
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        if (!this.isShuttingDown) {
          console.error(`[Code Diagrams MCP] 收到 ${signal}，正在清理资源...`);
          logger.warn(`收到信号 ${signal}，正在清理资源并退出`);
          await this.cleanup();
          process.exit(0);
        }
      });
    });

    // 处理未捕获的错误
    process.on('uncaughtException', async (error) => {
      console.error('[Code Diagrams MCP] 未捕获的异常:', error);
      logger.error('未捕获的异常', error);
      if (!this.isShuttingDown) {
        await this.cleanup();
        process.exit(1);
      }
    });

    process.on('unhandledRejection', async (reason) => {
      console.error('[Code Diagrams MCP] 未处理的Promise拒绝:', reason);
      logger.error('未处理的Promise拒绝', reason);
      if (!this.isShuttingDown) {
        await this.cleanup();
        process.exit(1);
      }
    });

    // 存储父进程PID以检测父进程是否终止
    const ppid = process.ppid;
    console.log(`[Code Diagrams MCP] 父进程 PID: ${ppid}`);
    logger.info(`父进程 PID: ${ppid}`);
    
    setInterval(() => {
      try {
        process.kill(ppid, 0);
      } catch (e) {
        if (!this.isShuttingDown) {
          console.error(`[Code Diagrams MCP] 父进程 ${ppid} 不再存在，正在启动关闭程序`);
          logger.warn(`父进程 ${ppid} 不存在，正在启动关闭程序`);
          this.cleanup().finally(() => process.exit(0));
        }
      }
    }, 5000);
  }

  private setupProcessHandlers() {
    // 处理进程退出信号
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    signals.forEach(signal => {
      process.on(signal, () => {
        this.shutdown(signal);
      });
    });

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常', { error: error.message, stack: error.stack });
      console.error('[Code Diagrams MCP] 未捕获的异常:', error);
      this.shutdown('uncaughtException');
    });

    // 处理未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的Promise拒绝', { reason });
      console.error('[Code Diagrams MCP] 未处理的Promise拒绝:', reason);
    });
  }

  private shutdown(signal: string) {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    logger.warn(`收到信号 ${signal}，正在清理资源并退出`);
    console.log(`[Code Diagrams MCP] 收到信号 ${signal}，正在清理资源并退出`);
    
    // 关闭服务器
    try {
      this.server.close();
      logger.info('服务器已关闭');
      console.log('[Code Diagrams MCP] 服务器已关闭');
    } catch (error) {
      logger.error('关闭服务器时出错', { error });
      console.error('[Code Diagrams MCP] 关闭服务器时出错:', error);
    }
    
    // 延迟一段时间后强制退出，确保日志写入
    setTimeout(() => {
      logger.info('进程退出');
      console.log('[Code Diagrams MCP] 进程退出');
      process.exit(0);
    }, 1000);
  }

  private setupTools() {
    // 列出可用工具，提供全面的文档
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.info('收到工具列表请求');
      console.log('[Code Diagrams MCP] 收到工具列表请求');
      
      return {
        tools: [
          {
            name: 'generate-code-diagram',
            description: '使用Tree-sitter解析代码并生成Mermaid图表',
            category: '代码分析',
            tags: ['code', 'diagram', 'mermaid', 'tree-sitter', 'analysis'],
            inputSchema: {
              type: 'object',
              required: ['outputPath', 'inputPath'],
              properties: {
                outputPath: {
                  type: 'string',
                  description: '图表导出目录的绝对路径'
                },
                inputPath: {
                  type: 'string',
                  description: '要分析的代码目录的绝对路径'
                },
                diagramType: {
                  type: 'string',
                  enum: ['class', 'flowchart', 'sequence', 'er'],
                  default: 'class',
                  description: '要生成的Mermaid图表类型'
                }
              },
            },
            returns: {
              type: 'object',
              description: '返回代码分析和图表生成结果',
              properties: {
                success: { type: 'boolean', description: '操作是否成功' },
                filePath: { type: 'string', description: '生成的Markdown文件路径' },
                mermaidCode: { type: 'string', description: 'Mermaid图表代码' },
                error: { type: 'string', description: '错误信息（如果有）' }
              },
            },
            examples: [
              {
                params: {
                  outputPath: 'D:\\Projects\\Output',
                  inputPath: 'D:\\Projects\\MyCode',
                  diagramType: 'class'
                },
                result: {
                  success: true,
                  filePath: 'D:\\Projects\\Output\\MyCode.md',
                  mermaidCode: 'classDiagram\n  class MyClass {\n    +myMethod()\n  }\n',
                  error: ''
                },
              }
            ],
          },
        ],
      };
    });

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      // 记录工具调用请求
      logger.info(`收到工具调用请求: ${name}`, { 
        toolName: name, 
        arguments: args 
      });
      console.log(`[Code Diagrams MCP] 收到工具调用请求: ${name}`, args);
      
      if (name === 'generate-code-diagram') {
        return await this.handleGenerateCodeDiagram(args);
      }
      
      // 如果工具名称不匹配，返回错误
      const error = new McpError(
        ErrorCode.InvalidParams,
        `未知的工具: ${name}`
      );
      logger.error(`工具调用失败: ${error.message}`, { 
        toolName: name, 
        arguments: args,
        error: error.message
      });
      
      // 打印传递给MCP的JSON数据和返回的错误信息
      console.error('[Code Diagrams MCP] 工具调用失败，参数：', JSON.stringify(args));
      console.error('[Code Diagrams MCP] 错误信息：', error.message);
      
      throw error;
    });
  }

  private async handleGenerateCodeDiagram(args: any) {
    try {
      // 验证参数
      if (!args.outputPath || !args.inputPath) {
        const error = new McpError(
          ErrorCode.InvalidParams,
          '缺少必要参数: outputPath 和 inputPath 是必需的'
        );
        logger.error('缺少必要参数', { arguments: args, error: error.message });
        
        // 打印传递给MCP的JSON数据和返回的错误信息
        console.error('MCP调用失败，参数：', JSON.stringify(args));
        console.error('错误信息：', error.message);
        
        throw error;
      }
      
      // 确保路径存在
      if (!fs.existsSync(args.inputPath)) {
        const error = new McpError(
          ErrorCode.InvalidParams,
          `输入路径不存在: ${args.inputPath}`
        );
        logger.error('输入路径不存在', { inputPath: args.inputPath, error: error.message });
        
        // 打印传递给MCP的JSON数据和返回的错误信息
        console.error('MCP调用失败，参数：', JSON.stringify(args));
        console.error('错误信息：', error.message);
        
        throw error;
      }
      
      // 获取图表类型，默认为类图
      const diagramType = (args.diagramType || 'class') as DiagramType;
      
      // 验证图表类型
      if (diagramType && !['class', 'flowchart', 'sequence', 'er'].includes(diagramType)) {
        const error = new McpError(
          ErrorCode.InvalidParams,
          `不支持的图表类型: ${diagramType}，支持的类型有: class, flowchart, sequence, er`
        );
        logger.error('不支持的图表类型', { diagramType, error: error.message });
        
        // 打印传递给MCP的JSON数据和返回的错误信息
        console.error('MCP调用失败，参数：', JSON.stringify(args));
        console.error('错误信息：', error.message);
        
        throw error;
      }
      
      logger.info('开始代码分析', { 
        inputPath: args.inputPath, 
        outputPath: args.outputPath,
        diagramType
      });
      
      // 分析代码
      const analysisResults = await codeAnalyzer.analyzeDirectory(args.inputPath);
      
      if (analysisResults.length === 0) {
        logger.warn('没有找到可分析的代码文件', { inputPath: args.inputPath });
        return {
          success: false,
          filePath: '',
          mermaidCode: '',
          error: '没有找到可分析的代码文件'
        };
      }
      
      // 根据图表类型生成相应的Mermaid代码
      let mermaidCode;
      try {
        mermaidCode = mermaidGenerator.generateDiagram(analysisResults, diagramType);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        logger.error('生成图表代码失败', { 
          error: errorMessage,
          stack: errorStack,
          diagramType,
          inputPath: args.inputPath
        });
        
        // 打印传递给MCP的JSON数据和返回的错误信息
        console.error('MCP生成图表代码失败，参数：', JSON.stringify(args));
        console.error('错误信息：', errorMessage);
        if (errorStack) {
          console.error('错误堆栈：', errorStack);
        }
        
        return {
          success: false,
          filePath: '',
          mermaidCode: '',
          error: `生成图表代码失败: ${errorMessage}`
        };
      }
      
      // 获取输入目录的最后一部分作为文件名
      const dirName = path.basename(args.inputPath);
      const fileName = `${dirName}-${diagramType}`;
      
      // 保存为Markdown文件
      let filePath;
      try {
        filePath = await mermaidGenerator.saveDiagramToMarkdown(
          mermaidCode,
          args.outputPath,
          diagramType
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        logger.error('保存图表到Markdown文件失败', { 
          error: errorMessage,
          stack: errorStack,
          outputPath: args.outputPath,
          fileName
        });
        
        // 打印传递给MCP的JSON数据和返回的错误信息
        console.error('MCP保存图表失败，参数：', JSON.stringify(args));
        console.error('错误信息：', errorMessage);
        if (errorStack) {
          console.error('错误堆栈：', errorStack);
        }
        
        return {
          success: false,
          filePath: '',
          mermaidCode,
          error: `保存图表到Markdown文件失败: ${errorMessage}`
        };
      }
      
      logger.info('图表生成成功', { 
        filePath, 
        diagramType,
        codeFileCount: analysisResults.length
      });
      
      return {
        success: true,
        filePath,
        mermaidCode,
        error: ''
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error('生成图表失败', { 
        error: errorMessage,
        arguments: args,
        stack: errorStack
      });
      
      // 打印传递给MCP的JSON数据和返回的错误信息
      console.error('MCP调用失败，参数：', JSON.stringify(args));
      console.error('错误信息：', errorMessage);
      if (errorStack) {
        console.error('错误堆栈：', errorStack);
      }
      
      return {
        success: false,
        filePath: '',
        mermaidCode: '',
        error: errorMessage
      };
    }
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    this.isShuttingDown = true;
    logger.info('服务器正在关闭，清理资源');
    console.log('[Code Diagrams MCP] 服务器正在关闭，清理资源');
    // 在此添加任何需要清理的资源
    await logger.close();
  }

  /**
   * 运行服务器
   * 初始化代码分析器并启动服务器
   */
  async run(): Promise<void> {
    try {
      // 初始化代码分析器
      logger.info('初始化代码分析器');
      console.log('[Code Diagrams MCP] 初始化代码分析器');
      
      // 使用静态创建方法初始化代码分析器
      codeAnalyzer = await CodeAnalyzer.create();
      logger.info('代码分析器初始化成功');
      console.log('[Code Diagrams MCP] 代码分析器初始化成功');
      
      // 启动服务器
      const transport = new StdioServerTransport();
      logger.info('正在连接到传输层');
      console.log('[Code Diagrams MCP] 正在连接到传输层');
      
      await this.server.connect(transport);
      logger.info('服务器已启动并连接到传输层');
      console.log('[Code Diagrams MCP] 服务器已启动并连接到传输层');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('服务器启动失败', { 
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      console.error('[Code Diagrams MCP] 服务器启动失败:', errorMessage);
      if (error instanceof Error && error.stack) {
        console.error('[Code Diagrams MCP] 错误堆栈:', error.stack);
      }
      throw error;
    }
  }
}

// 创建并运行服务器
const server = new CodeDiagramsMCP_Server();
server.run().catch(async (error) => {
  console.error('[Code Diagrams MCP] 运行服务器时出错:', error);
  logger.error('运行服务器时出错', error);
  
  // 打印错误详情
  if (error instanceof Error) {
    console.error('[Code Diagrams MCP] 错误堆栈:', error.stack);
  }
  
  process.exit(1);
});
