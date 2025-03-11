import fetch from 'node-fetch';
import { logger } from '../logger.js';
import { JSDOM } from 'jsdom';
import { URL } from 'url';
import * as fs from 'fs';
import * as path from 'path';

/**
 * URL文本读取服务
 * 负责从指定URL获取网页文本内容
 */
export class UrlTextReader {
  /**
   * 从指定URL读取文本内容
   * @param url 要读取的URL
   * @param depth 递归获取链接的深度（默认为0，不获取链接）
   * @param outputPath 输出文件路径
   * @returns 网页文本内容
   */
  async readUrlText(url: string, depth: number = 0, outputPath?: string): Promise<string> {
    try {
      logger.info(`开始读取URL: ${url}, 深度: ${depth}${outputPath ? `, 输出路径: ${outputPath}` : ''}`);
      
      // 构建r.jina.ai的URL
      const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
      
      // 设置超时时间（毫秒）
      const timeout = 15000; // 15秒
      
      // 创建一个带超时的fetch请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        // 发送请求，添加超时控制
        const response = await fetch(jinaUrl, { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        // 清除超时计时器
        clearTimeout(timeoutId);
        
        // 检查响应状态
        if (!response.ok) {
          const errorMessage = `获取URL内容失败: ${response.status} ${response.statusText}`;
          logger.error(errorMessage);
          throw new Error(errorMessage);
        }
        
        // 读取响应文本
        const text = await response.text();
        
        logger.info(`成功读取URL: ${url}`, { contentLength: text.length });
        
        // 检查内容是否完整（简单检查，可能需要根据具体网站调整）
        if (text.includes('</html>') === false) {
          logger.warn(`页面可能未完全加载: ${url}`);
        }
        
        // 如果深度大于0，则获取链接并递归读取
        if (depth > 0) {
          return await this.processLinksAndGetContent(url, text, depth, outputPath);
        }
        
        // 如果提供了输出路径，则保存内容
        if (outputPath) {
          // 检查outputPath是否是目录路径
          const isDirectory = !path.extname(outputPath) || outputPath.endsWith('/') || outputPath.endsWith('\\');
          
          if (isDirectory) {
            // 如果是目录路径，自动生成文件名
            const fileName = `url-content-${url.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)}.md`;
            const fullPath = path.join(outputPath, fileName);
            this.saveContentToFile(text, fullPath);
          } else {
            // 如果已包含文件名，直接使用
            this.saveContentToFile(text, outputPath);
          }
        }
        
        return text;
      } catch (error) {
        // 清除超时计时器
        clearTimeout(timeoutId);
        
        // 检查是否为超时错误
        if (error instanceof Error && error.name === 'AbortError') {
          const errorMessage = `获取URL内容超时: ${url}，超时时间: ${timeout}ms`;
          logger.error(errorMessage);
          throw new Error(errorMessage);
        }
        
        // 重新抛出其他错误
        throw error;
      }
    } catch (error) {
      // 记录详细错误信息
      logger.error(`读取URL失败: ${url}`, error);
      
      // 重新抛出错误，以便上层处理
      throw error;
    }
  }

  /**
   * 处理文档中的链接并获取内容
   * @param baseUrl 基础URL
   * @param content 当前文档内容
   * @param depth 递归深度
   * @param outputPath 可选的输出文件路径
   * @returns 合并后的内容
   */
  private async processLinksAndGetContent(baseUrl: string, content: string, depth: number, outputPath?: string): Promise<string> {
    try {
      // 提取链接的函数
      const extractLinks = (text: string): string[] => {
        const links: string[] = [];
        
        // 尝试判断内容类型
        const isHtml = text.includes('<!DOCTYPE html>') || text.includes('<html') || text.includes('<body');
        
        if (isHtml) {
          // 如果是HTML内容，使用JSDOM解析
          try {
            const dom = new JSDOM(text);
            const document = dom.window.document;
            
            // 获取所有链接
            const htmlLinks = Array.from(document.querySelectorAll('a[href]'))
              .map(a => (a as HTMLAnchorElement).href)
              .filter(href => {
                try {
                  // 过滤非HTTP链接
                  if (!href.startsWith('http://') && !href.startsWith('https://')) {
                    return false;
                  }
                  
                  // 解析链接URL
                  new URL(href);
                  
                  // 过滤掉指向同一页面不同部分的链接（锚点链接）
                  const baseUrlWithoutHash = baseUrl.split('#')[0];
                  const hrefWithoutHash = href.split('#')[0];
                  
                  // 如果链接（不含锚点）与当前页面相同，则跳过
                  if (hrefWithoutHash === baseUrlWithoutHash) {
                    return false;
                  }
                  
                  return true;
                } catch (e) {
                  // 忽略无效URL
                  return false;
                }
              });
            
            links.push(...htmlLinks);
          } catch (e) {
            logger.error(`HTML解析失败: ${baseUrl}`, e);
          }
        } else {
          // 如果是Markdown或纯文本，使用正则表达式提取链接
          
          // 提取Markdown风格的链接 [text](url)
          const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
          let match;
          while ((match = markdownLinkRegex.exec(text)) !== null) {
            const url = match[2];
            if (url.startsWith('http://') || url.startsWith('https://')) {
              try {
                new URL(url);
                
                // 过滤掉指向同一页面不同部分的链接（锚点链接）
                const baseUrlWithoutHash = baseUrl.split('#')[0];
                const urlWithoutHash = url.split('#')[0];
                
                // 如果链接（不含锚点）与当前页面相同，则跳过
                if (urlWithoutHash !== baseUrlWithoutHash) {
                  links.push(url);
                }
              } catch (e) {
                // 忽略无效URL
              }
            }
          }
          
          // 提取纯文本URL
          const urlRegex = /(https?:\/\/[^\s"'<>()[\]{}]+)/g;
          while ((match = urlRegex.exec(text)) !== null) {
            const url = match[1];
            try {
              new URL(url);
              
              // 过滤掉指向同一页面不同部分的链接（锚点链接）
              const baseUrlWithoutHash = baseUrl.split('#')[0];
              const urlWithoutHash = url.split('#')[0];
              
              // 如果链接（不含锚点）与当前页面相同，则跳过
              if (urlWithoutHash !== baseUrlWithoutHash) {
                links.push(url);
              }
            } catch (e) {
              // 忽略无效URL
            }
          }
        }
        
        // 去重
        return [...new Set(links)];
      };
      
      // 提取链接
      const links = extractLinks(content)
        // 限制链接数量，避免过多请求
        .slice(0, 10);
      
      // 记录找到的链接
      logger.info(`   在URL ${baseUrl} 中找到 ${links.length} 个有效链接`);
      
      // 保存当前URL内容
      let mainContent = `# ${baseUrl}\n\n${content}\n\n`;
      
      // 如果提供了输出路径，则保存到指定路径
      if (outputPath) {
        // 检查outputPath是否是目录路径
        const isDirectory = !path.extname(outputPath) || outputPath.endsWith('/') || outputPath.endsWith('\\');
        
        if (isDirectory) {
          // 如果是目录路径，自动生成文件名
          const fileName = `url-content-${baseUrl.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)}.md`;
          const fullPath = path.join(outputPath, fileName);
          this.saveContentToFile(mainContent, fullPath);
        } else {
          // 如果已包含文件名，直接使用
          this.saveContentToFile(mainContent, outputPath);
        }
      } else {
        // 否则保存到默认的logs目录
        // 创建时间戳文件名（年月日时分秒）
        const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
        const fileName = `url-content-${baseUrl.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)}-${timestamp}.md`;
        
        // 确保logs目录存在
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // 保存内容到文件
        const filePath = path.join(logsDir, fileName);
        fs.writeFileSync(filePath, mainContent, 'utf8');
        logger.info(`内容已保存到文件: ${filePath}`);
      }
      
      // 递归获取链接内容
      if (links.length > 0 && depth > 0) {
        // 并行获取所有链接内容
        await Promise.all(
          links.map(async (link: string) => {
            try {
              // 递归调用，深度减1
              // 为每个链接创建单独的文件名
              const linkFileName = `url-content-${link.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)}.md`;
              
              let linkFilePath;
              if (outputPath) {
                // 如果提供了输出路径，则使用该路径的目录部分
                const isDirectory = !path.extname(outputPath) || outputPath.endsWith('/') || outputPath.endsWith('\\');
                if (isDirectory) {
                  // 如果是目录路径，直接使用
                  linkFilePath = path.join(outputPath, linkFileName);
                } else {
                  // 如果包含文件名，使用其目录部分
                  linkFilePath = path.join(path.dirname(outputPath), linkFileName);
                }
              } else {
                // 否则使用默认的logs目录
                linkFilePath = path.join(process.cwd(), 'logs', linkFileName);
              }
              
              // 递归调用，深度减1，并指定输出路径
              await this.readUrlText(link, depth - 1, linkFilePath);
              logger.info(`链接内容已保存到单独文件: ${linkFilePath}`);
            } catch (error: any) {
              logger.error(`    获取链接内容失败: ${link}`, error);
            }
          })
        );
      }
      
      // 计算合并后的内容大小（KB）并记录日志
      const contentSizeKB = (mainContent.length / 1024).toFixed(2);
      logger.info(`URL ${baseUrl} 的内容大小: ${contentSizeKB} KB`);
      
      return mainContent;
    } catch (error: any) {
      logger.error(`    处理链接失败: ${baseUrl}`, error);
      // 如果处理链接失败，至少返回原始内容
      return content;
    }
  }

  /**
   * 保存内容到指定文件
   * @param content 要保存的内容
   * @param outputPath 输出文件路径
   */
  private saveContentToFile(content: string, outputPath: string): void {
    try {
      // 检查outputPath是否是目录路径
      const isDirectory = !path.extname(outputPath) || outputPath.endsWith('/') || outputPath.endsWith('\\');
      
      let finalPath = outputPath;
      if (isDirectory) {
        // 如果是目录路径，自动生成文件名，不使用时间戳
        const fileName = `url-content.md`;
        finalPath = path.join(outputPath, fileName);
      }
      
      // 确保输出目录存在
      const outputDir = path.dirname(finalPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // 如果文件已存在，先删除
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
        logger.info(`已删除现有文件: ${finalPath}`);
      }
      
      // 保存内容到文件
      fs.writeFileSync(finalPath, content, 'utf8');
      logger.info(`内容已保存到指定路径: ${finalPath}`);
    } catch (error) {
      logger.error(`保存内容到文件失败: ${outputPath}`, error);
      throw new Error(`保存内容到文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
}
