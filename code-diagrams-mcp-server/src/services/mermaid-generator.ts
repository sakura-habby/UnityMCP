import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger.js';
import { CodeElement, ElementType, Visibility, AnalysisResult, MethodInfo, PropertyInfo } from './code-analyzer-impl.js';

/**
 * Mermaid图表类型
 */
export type DiagramType = 'class' | 'flowchart' | 'sequence' | 'er';

/**
 * Mermaid图表生成器
 * 用于将代码分析结果转换为Mermaid图表
 */
export class MermaidGenerator {
  /**
   * 生成类图
   * @param analysisResults 代码分析结果
   * @returns Mermaid类图代码
   */
  generateClassDiagram(analysisResults: AnalysisResult[]): string {
    logger.info('开始生成类图');
    try {
      // 合并所有文件中的代码元素
      const allElements: CodeElement[] = [];
      for (const result of analysisResults) {
        allElements.push(...result.elements);
      }
      
      let mermaidCode = 'classDiagram\n';
      
      // 添加所有类和接口的定义
      for (const element of allElements) {
        if (element.type === ElementType.Class || element.type === ElementType.Interface) {
          // 生成类名或接口名
          const typeName = element.name;
          
          // 创建类或接口
          if (element.type === ElementType.Interface) {
            mermaidCode += `  class ${typeName} {\n    <<interface>>\n`;
          } else {
            mermaidCode += `  class ${typeName} {\n`;
          }
          
          // 添加属性
          if (element.properties && element.properties.length > 0) {
            for (const property of element.properties) {
              const visibilitySymbol = this.getVisibilitySymbol(property.visibility);
              mermaidCode += `    ${visibilitySymbol}${property.name}${property.type ? ' : ' + property.type : ''}\n`;
            }
          }
          
          // 添加方法
          if (element.methods && element.methods.length > 0) {
            for (const method of element.methods) {
              const visibilitySymbol = this.getVisibilitySymbol(method.visibility);
              const paramString = method.parameters && method.parameters.length > 0
                ? method.parameters.map(p => `${p.name}${p.type ? ': ' + p.type : ''}`).join(', ')
                : '';
              
              mermaidCode += `    ${visibilitySymbol}${method.name}(${paramString})${method.returnType ? ' : ' + method.returnType : ''}\n`;
            }
          }
          
          mermaidCode += '  }\n';
        }
      }
      
      // 添加继承和实现关系
      for (const element of allElements) {
        if (element.type === ElementType.Class) {
          // 继承关系
          if (element.extendsClass) {
            mermaidCode += `  ${element.extendsClass} <|-- ${element.name}\n`;
          }
          
          // 实现关系
          if (element.implementsInterfaces && element.implementsInterfaces.length > 0) {
            for (const interfaceName of element.implementsInterfaces) {
              mermaidCode += `  ${interfaceName} <|.. ${element.name}\n`;
            }
          }
        }
      }
      
      logger.info('类图生成成功');
      return mermaidCode;
    } catch (error) {
      logger.error('生成类图失败', error);
      throw error;
    }
  }
  
  /**
   * 生成ER图
   * @param analysisResults 代码分析结果
   * @returns Mermaid ER图代码
   */
  generateErDiagram(analysisResults: AnalysisResult[]): string {
    logger.info('开始生成ER图');
    try {
      // 合并所有文件中的代码元素
      const allElements: CodeElement[] = [];
      for (const result of analysisResults) {
        allElements.push(...result.elements);
      }
      
      let mermaidCode = 'erDiagram\n';
      
      // 添加所有类的定义
      for (const element of allElements) {
        if (element.type === ElementType.Class) {
          // 生成实体名
          const entityName = element.name;
          
          // 添加实体
          mermaidCode += `  ${entityName} {\n`;
          
          // 添加属性
          if (element.properties && element.properties.length > 0) {
            for (const property of element.properties) {
              const type = property.type || 'string';
              mermaidCode += `    ${type} ${property.name}\n`;
            }
          }
          
          mermaidCode += '  }\n';
        }
      }
      
      // 添加关系
      for (const element of allElements) {
        if (element.type === ElementType.Class && element.extendsClass) {
          // 只有类才有继承关系
          mermaidCode += `  ${element.extendsClass} ||--|| ${element.name} : "extends"\n`;
        }
      }
      
      logger.info('ER图生成成功');
      return mermaidCode;
    } catch (error) {
      logger.error('生成ER图失败', error);
      throw error;
    }
  }
  
  /**
   * 生成流程图
   * @param analysisResults 代码分析结果
   * @returns Mermaid流程图代码
   */
  generateFlowchart(analysisResults: AnalysisResult[]): string {
    logger.info('开始生成流程图');
    try {
      // 合并所有文件中的代码元素
      const allElements: CodeElement[] = [];
      for (const result of analysisResults) {
        allElements.push(...result.elements);
      }
      
      let mermaidCode = 'flowchart TD\n';
      
      // 添加所有类和接口的节点
      for (const element of allElements) {
        if (element.type === ElementType.Class) {
          mermaidCode += `  ${element.name}[${element.name}]\n`;
        } else if (element.type === ElementType.Interface) {
          mermaidCode += `  ${element.name}([${element.name}])\n`;
        }
      }
      
      // 添加关系
      for (const element of allElements) {
        // 继承关系
        if (element.extendsClass) {
          mermaidCode += `  ${element.extendsClass} --> ${element.name}\n`;
        }
        
        // 实现关系
        if (element.implementsInterfaces && element.implementsInterfaces.length > 0) {
          for (const interfaceName of element.implementsInterfaces) {
            mermaidCode += `  ${interfaceName} -.-> ${element.name}\n`;
          }
        }
      }
      
      logger.info('流程图生成成功');
      return mermaidCode;
    } catch (error) {
      logger.error('生成流程图失败', error);
      throw error;
    }
  }
  
  /**
   * 生成序列图（简化版，仅展示类间调用）
   * @param analysisResults 代码分析结果
   * @returns Mermaid序列图代码
   */
  generateSequenceDiagram(analysisResults: AnalysisResult[]): string {
    logger.info('开始生成序列图');
    try {
      // 合并所有文件中的代码元素
      const allElements: CodeElement[] = [];
      for (const result of analysisResults) {
        allElements.push(...result.elements);
      }
      
      let mermaidCode = 'sequenceDiagram\n';
      
      // 添加参与者（类和接口）
      for (const element of allElements) {
        if (element.type === ElementType.Class || element.type === ElementType.Interface) {
          mermaidCode += `  participant ${element.name}\n`;
        }
      }
      
      // 添加方法调用（简化版，仅展示类之间的调用）
      for (const element of allElements) {
        if (element.type === ElementType.Class && element.methods) {
          for (const method of element.methods) {
            // 简化处理，假设方法名中包含其他类名表示调用该类
            for (const otherElement of allElements) {
              if (otherElement.name !== element.name && 
                  (method.name.includes(otherElement.name) || 
                   (method.returnType && method.returnType.includes(otherElement.name)))) {
                mermaidCode += `  ${element.name}->>+${otherElement.name}: ${method.name}\n`;
                mermaidCode += `  ${otherElement.name}-->>-${element.name}: 返回\n`;
              }
            }
          }
        }
      }
      
      logger.info('序列图生成成功');
      return mermaidCode;
    } catch (error) {
      logger.error('生成序列图失败', error);
      throw error;
    }
  }
  
  /**
   * 根据图表类型生成相应的图表
   * @param analysisResults 代码分析结果
   * @param diagramType 图表类型
   * @returns Mermaid图表代码
   */
  generateDiagram(analysisResults: AnalysisResult[], diagramType: DiagramType): string {
    logger.info(`开始生成${diagramType}图表`);
    try {
      let mermaidCode = '';
      
      switch (diagramType) {
        case 'class':
          mermaidCode = this.generateClassDiagram(analysisResults);
          break;
        case 'flowchart':
          mermaidCode = this.generateFlowchart(analysisResults);
          break;
        case 'sequence':
          mermaidCode = this.generateSequenceDiagram(analysisResults);
          break;
        case 'er':
          mermaidCode = this.generateErDiagram(analysisResults);
          break;
        default:
          throw new Error(`不支持的图表类型: ${diagramType}`);
      }
      
      // 预处理Mermaid代码，修复可能的语法错误
      mermaidCode = this.preprocessMermaidCode(mermaidCode, diagramType);
      
      // 验证Mermaid代码语法
      this.validateMermaidSyntax(mermaidCode, diagramType);
      
      logger.info(`${diagramType}图表生成成功`);
      return mermaidCode;
    } catch (error) {
      logger.error(`生成${diagramType}图表失败`, error);
      throw error;
    }
  }
  
  /**
   * 预处理Mermaid代码，修复常见语法错误
   * @param code Mermaid代码
   * @param diagramType 图表类型
   * @returns 处理后的代码
   */
  private preprocessMermaidCode(code: string, diagramType: DiagramType): string {
    logger.info(`预处理${diagramType}图表代码`);
    
    try {
      // 类图特定处理
      if (diagramType === 'class') {
        // 修复继承关系中可能出现的语法错误
        // 例如 ": Class1 <|.. Class2" 应该是 "Class1 <|.. Class2"
        const lines = code.split('\n');
        const processedLines = lines.map(line => {
          // 检查并修复以冒号开头的继承关系行
          if (line.trim().match(/^\s*[:：]\s*[A-Za-z0-9_]+\s+(<\|\.\.|\.\.|<\|--|--|<\|--|<\|-|--|>|<--|\.\.|-->|<-->)/)) {
            // 移除行首的冒号
            return line.replace(/^\s*[:：]\s*/, '  ');
          }
          return line;
        });
        
        code = processedLines.join('\n');
        
        // 检查并修复其他可能的类图语法错误
        // ...
      }
      
      // 流程图特定处理
      if (diagramType === 'flowchart') {
        // 修复流程图特定的语法错误
        // ...
      }
      
      logger.info(`${diagramType}图表代码预处理完成`);
      return code;
    } catch (error) {
      logger.error(`预处理${diagramType}图表代码失败`, error);
      // 即使预处理失败，也返回原始代码，让后续步骤尝试处理
      return code;
    }
  }
  
  /**
   * 验证Mermaid代码语法
   * @param code Mermaid代码
   * @param diagramType 图表类型
   */
  private validateMermaidSyntax(code: string, diagramType: DiagramType): void {
    logger.info(`验证${diagramType}图表代码语法`);
    
    try {
      const errors: string[] = [];
      
      // 基本语法检查
      if (!code.trim()) {
        errors.push('Mermaid代码不能为空');
      }
      
      // 类图特定检查
      if (diagramType === 'class') {
        // 检查是否包含classDiagram声明
        if (!code.includes('classDiagram')) {
          errors.push('类图必须包含classDiagram声明');
        }
        
        // 检查括号匹配
        const openBraces = (code.match(/{/g) || []).length;
        const closeBraces = (code.match(/}/g) || []).length;
        if (openBraces !== closeBraces) {
          errors.push(`花括号不匹配: 开括号${openBraces}个, 闭括号${closeBraces}个`);
        }
        
        // 检查继承关系语法
        const inheritanceLines = code.match(/^\s*[:：].*(<\|\.\.|\.\.|<\|--|--|<\|--|<\|-|--|>|<--|\.\.|-->|<-->)/gm);
        if (inheritanceLines && inheritanceLines.length > 0) {
          errors.push(`发现${inheritanceLines.length}个可能的继承关系语法错误，例如: ${inheritanceLines[0]}`);
        }
      }
      
      // 流程图特定检查
      if (diagramType === 'flowchart') {
        // 检查是否包含flowchart声明
        if (!code.match(/flowchart\s+(TD|BT|RL|LR)/)) {
          errors.push('流程图必须包含正确的flowchart方向声明 (TD, BT, RL, LR)');
        }
      }
      
      // 如果有错误，记录但不抛出异常
      if (errors.length > 0) {
        logger.warn(`${diagramType}图表代码语法验证发现问题`, { errors });
      } else {
        logger.info(`${diagramType}图表代码语法验证通过`);
      }
    } catch (error) {
      logger.error(`验证${diagramType}图表代码语法失败`, error);
      // 验证失败不抛出异常，让代码继续执行
    }
  }
  
  /**
   * 将图表保存为Markdown文件
   * @param mermaidCode Mermaid图表代码
   * @param outputPath 输出路径
   * @param diagramType 图表类型
   * @returns 保存的文件路径
   */
  async saveDiagramToMarkdown(mermaidCode: string, outputPath: string, diagramType: DiagramType): Promise<string> {
    logger.info(`开始保存${diagramType}图表到Markdown`);
    try {
      // 确保输出目录存在
      await fs.promises.mkdir(outputPath, { recursive: true });
      
      // 生成文件名
      const fileName = `${path.basename(outputPath)}-${diagramType}.md`;
      const filePath = path.join(outputPath, fileName);
      
      // 创建Markdown内容
      const markdownContent = `# 代码结构图

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;
      
      // 写入文件
      await fs.promises.writeFile(filePath, markdownContent, 'utf8');
      
      logger.info(`图表已保存为Markdown文件: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error(`保存图表到Markdown失败: ${outputPath}/${diagramType}.md`, error);
      throw error;
    }
  }
  
  /**
   * 获取可见性符号
   * @param visibility 可见性枚举
   * @returns 可见性符号
   */
  private getVisibilitySymbol(visibility: Visibility): string {
    switch (visibility) {
      case Visibility.Public:
        return '+';
      case Visibility.Private:
        return '-';
      case Visibility.Protected:
        return '#';
      case Visibility.Internal:
        return '~';
      default:
        return '+';
    }
  }
}
