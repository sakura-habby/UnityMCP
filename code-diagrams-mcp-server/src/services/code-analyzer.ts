import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger.js';
import Parser from 'tree-sitter';
import { promisify } from 'util';
import { analyzeFile as analyzeFileImpl, AnalysisResult as FileAnalysisResult } from './code-analyzer-impl.js';

// 支持的语言和对应的文件扩展名
interface SupportedLanguage {
  extensions: string[];
  parser: any;
  name: string;
}

// 代码元素类型
enum ElementType {
  Class,
  Interface,
  Enum,
  Method,
  Property,
  Field
}

// 代码元素可见性
enum Visibility {
  Public,
  Private,
  Protected,
  Internal,
  Default
}

// 代码元素信息
interface CodeElement {
  type: ElementType;
  name: string;
  visibility: Visibility;
  parentName?: string;
  methods?: MethodInfo[];
  properties?: PropertyInfo[];
  implementsInterfaces?: string[];
  extendsClass?: string;
}

// 方法信息
interface MethodInfo {
  name: string;
  visibility: Visibility;
  returnType?: string;
  parameters?: ParameterInfo[];
}

// 属性信息
interface PropertyInfo {
  name: string;
  visibility: Visibility;
  type?: string;
}

// 参数信息
interface ParameterInfo {
  name: string;
  type?: string;
}

// 代码分析结果
interface AnalysisResult {
  filePath: string;
  language: string;
  elements: CodeElement[];
}

/**
 * 代码分析器服务
 * 使用Tree-sitter解析代码文件并提取类、接口、方法等信息
 */
export class CodeAnalyzer {
  private parser: Parser;
  private supportedLanguages: Map<string, SupportedLanguage>;
  private initialized = false;

  /**
   * 静态工厂方法，创建并初始化CodeAnalyzer实例
   * @returns 初始化完成的CodeAnalyzer实例
   */
  static async create(): Promise<CodeAnalyzer> {
    const analyzer = new CodeAnalyzer();
    await analyzer.initializeParsers();
    analyzer.initialized = true;
    return analyzer;
  }

  /**
   * 私有构造函数，应通过静态create方法创建实例
   */
  constructor() {
    this.parser = new Parser();
    this.supportedLanguages = new Map();
    this.initialized = false;
    // 不再在构造函数中调用initializeParsers，而是在create方法中调用
  }

  /**
   * 初始化各语言的解析器
   */
  private async initializeParsers(): Promise<void> {
    try {
      // 初始化C#解析器
      const csharp = await import('tree-sitter-c-sharp');
      this.supportedLanguages.set('csharp', {
        extensions: ['.cs'],
        parser: csharp,
        name: 'C#'
      });

      // 初始化TypeScript解析器
      const typescript = await import('tree-sitter-typescript');
      this.supportedLanguages.set('typescript', {
        extensions: ['.ts', '.tsx'],
        parser: typescript.typescript,
        name: 'TypeScript'
      });

      // 初始化JavaScript解析器
      const javascript = await import('tree-sitter-javascript');
      this.supportedLanguages.set('javascript', {
        extensions: ['.js', '.jsx'],
        parser: javascript,
        name: 'JavaScript'
      });

      // 初始化Python解析器
      const python = await import('tree-sitter-python');
      this.supportedLanguages.set('python', {
        extensions: ['.py'],
        parser: python,
        name: 'Python'
      });

      // 初始化Java解析器
      const java = await import('tree-sitter-java');
      this.supportedLanguages.set('java', {
        extensions: ['.java'],
        parser: java,
        name: 'Java'
      });

      logger.info('初始化解析器成功', {
        supportedLanguages: Array.from(this.supportedLanguages.keys())
      });
    } catch (error) {
      logger.error('初始化解析器失败', error);
      throw error;
    }
  }

  /**
   * 分析指定目录下的代码文件
   * @param directoryPath 要分析的目录路径
   * @returns 分析结果
   */
  async analyzeDirectory(directoryPath: string): Promise<FileAnalysisResult[]> {
    try {
      // 检查是否已初始化
      if (!this.initialized) {
        logger.warn('代码分析器尚未初始化，正在尝试初始化');
        await this.initializeParsers();
        this.initialized = true;
      }
      
      logger.info(`开始分析目录: ${directoryPath}`);
      
      // 获取目录下所有支持的代码文件
      const files = await this.findCodeFiles(directoryPath);
      logger.info(`找到 ${files.length} 个代码文件`);
      
      // 分析每个文件
      const results: FileAnalysisResult[] = [];
      for (const file of files) {
        try {
          const result = await this.analyzeFile(file);
          if (result) {
            results.push(result);
          }
        } catch (error) {
          logger.error(`分析文件失败: ${file}`, error);
        }
      }
      
      logger.info(`完成目录分析, 共分析 ${results.length} 个文件`);
      return results;
    } catch (error) {
      logger.error(`分析目录失败: ${directoryPath}`, error);
      throw error;
    }
  }

  /**
   * 分析单个代码文件
   * @param filePath 文件路径
   * @returns 分析结果
   */
  async analyzeFile(filePath: string): Promise<FileAnalysisResult | null> {
    try {
      // 检查是否已初始化
      if (!this.initialized) {
        logger.warn('代码分析器尚未初始化，正在尝试初始化');
        await this.initializeParsers();
        this.initialized = true;
      }
      
      logger.info(`开始分析文件: ${filePath}`);
      
      // 获取文件对应的语言
      const language = this.getLanguageForFile(filePath);
      if (!language) {
        logger.warn(`不支持的文件类型: ${filePath}`);
        return null;
      }
      
      // 调用实现文件中的分析方法
      const result = await analyzeFileImpl(filePath, this.parser);
      
      if (result) {
        logger.info(`文件分析完成: ${filePath}, 找到 ${result.elements.length} 个代码元素`);
      }
      
      return result;
    } catch (error) {
      logger.error(`分析文件失败: ${filePath}`, error);
      return null;
    }
  }

  /**
   * 查找目录下所有支持的代码文件
   * @param directoryPath 目录路径
   * @returns 文件路径列表
   */
  private async findCodeFiles(directoryPath: string): Promise<string[]> {
    const readdir = promisify(fs.readdir);
    const stat = promisify(fs.stat);
    
    try {
      const entries = await readdir(directoryPath, { withFileTypes: true });
      const files: string[] = [];
      
      for (const entry of entries) {
        const fullPath = path.join(directoryPath, entry.name);
        
        if (entry.isDirectory()) {
          // 递归处理子目录
          const subFiles = await this.findCodeFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // 检查文件是否为支持的代码文件
          if (this.getLanguageForFile(fullPath)) {
            files.push(fullPath);
          }
        }
      }
      
      return files;
    } catch (error) {
      logger.error(`查找代码文件失败: ${directoryPath}`, error);
      return [];
    }
  }

  /**
   * 根据文件路径获取对应的语言
   * @param filePath 文件路径
   * @returns 语言名称或null
   */
  private getLanguageForFile(filePath: string): string | null {
    const extension = path.extname(filePath).toLowerCase();
    
    for (const [language, info] of this.supportedLanguages.entries()) {
      if (info.extensions.includes(extension)) {
        return language;
      }
    }
    
    return null;
  }
}
