import fetch from 'node-fetch';
import { logger } from '../logger.js';

/**
 * URL文本读取服务
 * 负责从指定URL获取网页文本内容
 */
export class UrlTextReader {
  /**
   * 从指定URL读取文本内容
   * @param url 要读取的URL
   * @returns 网页文本内容
   */
  async readUrlText(url: string): Promise<string> {
    try {
      logger.info(`开始读取URL: ${url}`);
      
      // 构建r.jina.ai的URL
      const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
      
      // 发送请求
      const response = await fetch(jinaUrl);
      
      // 检查响应状态
      if (!response.ok) {
        const errorMessage = `获取URL内容失败: ${response.status} ${response.statusText}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }
      
      // 读取响应文本
      const text = await response.text();
      
      logger.info(`成功读取URL: ${url}`, { contentLength: text.length });
      
      return text;
    } catch (error) {
      // 记录详细错误信息
      logger.error(`读取URL失败: ${url}`, error);
      
      // 重新抛出错误，以便上层处理
      throw error;
    }
  }
}
