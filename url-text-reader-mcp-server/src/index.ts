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
import { UrlTextReader } from './services/url-text-reader.js';
import * as fs from 'fs';
import * as path from 'path';


// 创建URL文本读取服务
const urlTextService = new UrlTextReader();

class UrlTextReaderMCP_Server {
  private server: Server;
  private isShuttingDown = false;

  constructor() {
    // 初始化日志系统
    logger.initialize().catch(error => {
      console.error('[URL Text Reader MCP] 初始化日志系统失败:', error);
    });
    
    logger.info('URL文本阅读器MCP服务器启动');
    
    // 初始化MCP服务器
    this.server = new Server(
      {
        name: 'url-text-reader',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();

    // 错误处理
    this.server.onerror = (error) => {
      console.error('[URL Text Reader MCP Error]', error);
      logger.error('MCP服务器错误', error);
    };
    
    // 处理进程终止信号
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        if (!this.isShuttingDown) {
          console.error(`[URL Text Reader MCP] 收到 ${signal}，正在清理资源...`);
          logger.warn(`收到信号 ${signal}，正在清理资源并退出`);
          await this.cleanup();
          process.exit(0);
        }
      });
    });

    // 处理未捕获的错误
    process.on('uncaughtException', async (error) => {
      console.error('[URL Text Reader MCP] 未捕获的异常:', error);
      logger.error('未捕获的异常', error);
      if (!this.isShuttingDown) {
        await this.cleanup();
        process.exit(1);
      }
    });

    process.on('unhandledRejection', async (reason) => {
      console.error('[URL Text Reader MCP] 未处理的Promise拒绝:', reason);
      logger.error('未处理的Promise拒绝', reason);
      if (!this.isShuttingDown) {
        await this.cleanup();
        process.exit(1);
      }
    });

    // 存储父进程PID以检测父进程是否终止
    const ppid = process.ppid;
    setInterval(() => {
      try {
        process.kill(ppid, 0);
      } catch (e) {
        if (!this.isShuttingDown) {
          console.error(`[URL Text Reader MCP] 父进程 ${ppid} 不再存在，正在启动关闭程序`);
          logger.warn(`父进程 ${ppid} 不存在，正在启动关闭程序`);
          this.cleanup().finally(() => process.exit(0));
        }
      }
    }, 5000);
  }

  private setupTools() {
    // 列出可用工具，提供全面的文档
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.info('收到工具列表请求');
      return {
        tools: [
          {
            name: 'read-url-text',
            description: 'read-url-text',
            category: 'Web',
            tags: ['url', 'text', 'web', 'content', 'read-url-text', 'r.jina.ai'],
            inputSchema: {
              type: 'object',
              required: ['url', 'outputPath'],
              properties: {
                url: {
                  type: 'string',
                  format: 'uri',
                  description: '要读取内容的URL',
                  examples: [
                    'https://example.com',
                    'https://news.ycombinator.com',
                    'https://github.com'
                  ]
                },
                depth: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 5,
                  default: 0,
                  description: 'Recursive link retrieval depth (default 0 - no links), maximum 5. When set to 2 or higher, will fetch links from current document and continue retrieving their content.'
                },
                outputPath: {
                  type: 'string',
                  description: 'outputPath to save the url content, suggested to be project root path. Example: "d:\\UGit\\UnityMCP"'
                }
              },
            },
            returns: {
              type: 'object',
              description: 'read-url-text',
              properties: {
                content: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['text'] },
                      result: {
                        type: 'object',
                        properties: {
                          success: { type: 'boolean' },
                          error: { type: 'string', description: '错误信息' }
                        }
                      }
                    }
                  }
                }
              },
            },
            examples: [
              {
                params: {
                  url: 'https://example.com',
                  depth: 0,
                  outputPath: './output'
                },
                result: {
                  content: [
                    {
                      type: 'text',
                      result: {
                        success: false,
                        error: '错误信息'
                      }
                    }
                  ]
                },
              },
              {
                params: {
                  url: 'https://example.com',
                  depth: 2,
                  outputPath: './output'
                },
                result: {
                  content: [
                    {
                      type: 'text',
                      result: {
                        success: true
                      }
                    }
                  ]
                },
              },
              {
                params: {
                  url: 'https://example.com',
                  depth: 1,
                  outputPath: './output'
                },
                result: {
                  content: [
                    {
                      type: 'text',
                      result: {
                        success: true
                      }
                    }
                  ]
                },
              },
            ],
          },
        ],
      };
    });

    // 处理工具调用，增强验证和错误处理
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      // 记录工具调用请求
      logger.info(`收到工具调用请求: ${name}`, { 
        toolName: name, 
        arguments: args 
      });

      // 验证工具是否存在，并提供有用的错误消息
      const availableTools = ['read-url-text'];
      if (!availableTools.includes(name)) {
        const errorMsg = `未知工具: ${name}. 可用工具: ${availableTools.join(', ')}`;
        logger.error(errorMsg);
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}. Available tools are: ${availableTools.join(', ')}`
        );
      }

      // 根据工具模式验证参数
      switch (name) {
        case 'read-url-text': {
          // 如果args未定义或为null，抛出错误
          if (!args) {
            const errorMsg = '参数不能为空';
            logger.error(errorMsg);
            throw new McpError(
              ErrorCode.InvalidParams,
              'params cannot be empty'
            );
          }
          
          // 验证必需参数
          if (!args?.url || typeof args.url !== 'string' || args.url.trim().length === 0) {
            const errorMsg = 'url参数必须是非空字符串';
            logger.error(errorMsg);
            throw new McpError(
              ErrorCode.InvalidParams,
              'The url parameter must be a non-empty string'
            );
          }

          try {
            // 记录传递给MCP的JSON数据，用于调试
            logger.info(`收到工具调用请求: read-url-text`, {
              toolName: 'read-url-text',
              arguments: args
            });
            
            logger.info(`开始处理URL文本读取请求`, {
              url: args.url,
              depth: args.depth,
              outputPath: args.outputPath
            });
            
            // 检查outputPath是否为文件夹或文件，如果是文件则获取其所在文件夹
            let outputPath = args.outputPath as string;
            if (outputPath) {
              try {
                // 检查路径是否存在
                if (fs.existsSync(outputPath)) {
                  // 检查是否是目录
                  const stats = fs.statSync(outputPath);
                  if (!stats.isDirectory()) {
                    // 如果是文件，获取其所在目录
                    outputPath = path.dirname(outputPath);
                    logger.info(`输出路径是文件，使用其所在目录: ${outputPath}`);
                  }
                } else {
                  // 路径不存在，检查是否有扩展名来判断是否为文件
                  if (path.extname(outputPath) !== '') {
                    // 有扩展名，认为是文件路径，获取其所在目录
                    outputPath = path.dirname(outputPath);
                    logger.info(`输出路径不存在且有扩展名，使用其所在目录: ${outputPath}`);
                  }
                  // 否则认为是目录路径，直接使用
                }
              } catch (error) {
                logger.error(`处理输出路径时出错: ${outputPath}`, error);
                // 出错时仍然使用原始路径
              }
            }
            
            // 使用URL文本读取服务获取内容
            const text = await urlTextService.readUrlText(args.url as string, args.depth as number, outputPath);
            
            logger.info(`URL文本读取成功`, { 
              url: args.url,
              contentLength: text.length
            });
            
            return {
              content: [
                {
                  type: 'text',
                  result: {
                    success: true,
                    text: text,
                  },
                },
              ],
            };
          } catch (error) {
            // 当MCP工具调用失败时，打印错误信息以便调试
            logger.error(`URL文本读取失败`, error);
            console.error("MCP工具调用失败:", error);
            console.error("传递的参数:", JSON.stringify(args, null, 2));
            
            if (error instanceof Error) {
              // 检查常见错误
              if (error.message.includes('获取URL内容失败')) {
                throw new McpError(
                  ErrorCode.InternalError, // 使用InternalError替代不存在的ExternalServiceError
                  `Failed to fetch URL content: ${error.message}`
                );
              }
            }

            // 通用错误回退
            return {
              content: [
                {
                  type: 'text',
                  result: {
                    success: false,
                    error: `Failed to read URL text: ${error instanceof Error ? error.message : 'Unknown error'}`
                  },
                },
              ],
            };
          }
        }

        default:
          const errorMsg = `未知工具: ${name}`;
          logger.error(errorMsg);
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );      }
    });
  }

  public async cleanup() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.error('[URL Text Reader MCP] 开始清理资源...');
    logger.info('开始清理资源');

    try {
      await this.server.close();
      console.error('[URL Text Reader MCP] MCP服务器已关闭');
      logger.info('MCP服务器已关闭');
    } catch (error) {
      console.error('[URL Text Reader MCP] 关闭MCP服务器时出错:', error);
      logger.error('关闭MCP服务器时出错', error);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('URL文本阅读器MCP服务器在stdio上运行');
    logger.info('URL文本阅读器MCP服务器在stdio上运行');
  }
}

const server = new UrlTextReaderMCP_Server();
server.run().catch(async (error) => {
  console.error('[URL Text Reader MCP] 运行服务器时出错:', error);
  logger.error('运行服务器时出错', error);
  await server.cleanup();
  process.exit(1);
});

export { urlTextService as UrlTextService };
