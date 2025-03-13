import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger.js';
import * as Parser from 'tree-sitter';
import { promisify } from 'util';
import { createRequire } from 'module';

// 创建require函数用于加载CommonJS模块
const require = createRequire(import.meta.url);

// 预加载解析器
let tsParser: any = null;
let csharpParser: any = null;
let jsParser: any = null;
let javaParser: any = null;

// 初始化解析器
async function initParsers() {
  try {
    // 尝试使用require方式加载解析器
    try {
      tsParser = require('tree-sitter-typescript');
      logger.info('TypeScript解析器加载成功', {
        tsKeys: Object.keys(tsParser)
      });
    } catch (error) {
      logger.error('TypeScript解析器加载失败', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }

    try {
      csharpParser = require('tree-sitter-c-sharp');
      logger.info('C#解析器加载成功', {
        csharpKeys: Object.keys(csharpParser)
      });
    } catch (error) {
      logger.error('C#解析器加载失败', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }

    try {
      jsParser = require('tree-sitter-javascript');
      logger.info('JavaScript解析器加载成功', {
        jsKeys: Object.keys(jsParser)
      });
    } catch (error) {
      logger.error('JavaScript解析器加载失败', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }

    try {
      javaParser = require('tree-sitter-java');
      logger.info('Java解析器加载成功', {
        javaKeys: Object.keys(javaParser)
      });
    } catch (error) {
      logger.error('Java解析器加载失败', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  } catch (error) {
    logger.error('解析器预加载失败', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

// 立即初始化解析器
initParsers();

// 代码元素类型
export enum ElementType {
  Class = 'class',
  Interface = 'interface',
  Enum = 'enum',
  Function = 'function',
}

// 可见性
export enum Visibility {
  Public = 'public',
  Private = 'private',
  Protected = 'protected',
  Internal = 'internal',
  Default = 'default',
}

// 代码元素信息
export interface CodeElement {
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
export interface MethodInfo {
  name: string;
  visibility: Visibility;
  returnType?: string;
  parameters?: ParameterInfo[];
}

// 属性信息
export interface PropertyInfo {
  name: string;
  visibility: Visibility;
  type?: string;
}

// 参数信息
export interface ParameterInfo {
  name: string;
  type?: string;
}

// 代码分析结果
export interface AnalysisResult {
  filePath: string;
  language: string;
  elements: CodeElement[];
}

/**
 * 分析单个代码文件
 * @param filePath 文件路径
 * @returns 分析结果
 */
export async function analyzeFile(
  filePath: string,
  parser: Parser
): Promise<AnalysisResult | null> {
  try {
    logger.info(`分析文件: ${filePath}`);
    
    // 根据文件扩展名确定语言
    const ext = path.extname(filePath).toLowerCase();
    let language = null;
    
    if (ext === '.cs') {
      try {
        if (!csharpParser) {
          logger.error('C#解析器未加载');
          throw new Error('C#解析器未加载');
        }
        language = csharpParser;
        logger.info(`使用C#解析器: ${ext}`, {
          parserType: typeof language,
          hasParser: language ? 'yes' : 'no'
        });
      } catch (error) {
        logger.error(`加载C#解析器失败: ${error instanceof Error ? error.message : String(error)}`, {
          stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }
    } else if (ext === '.ts' || ext === '.tsx') {
      try {
        if (!tsParser) {
          logger.error('TypeScript解析器未加载');
          throw new Error('TypeScript解析器未加载');
        }
        
        // 根据扩展名选择正确的解析器
        if (ext === '.tsx') {
          language = tsParser.tsx;
        } else {
          language = tsParser.typescript;
        }
        
        // 记录详细的解析器信息用于调试
        logger.info(`使用TypeScript解析器: ${ext}`, {
          parserType: typeof language,
          hasParser: language ? 'yes' : 'no',
          tsKeys: Object.keys(tsParser)
        });
        
        if (!language) {
          throw new Error(`无法获取有效的TypeScript解析器对象: ${ext}`);
        }
      } catch (error) {
        logger.error(`加载TypeScript解析器失败: ${error instanceof Error ? error.message : String(error)}`, {
          stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }
    } else if (ext === '.js' || ext === '.jsx') {
      try {
        if (!jsParser) {
          logger.error('JavaScript解析器未加载');
          throw new Error('JavaScript解析器未加载');
        }
        language = jsParser;
        logger.info(`使用JavaScript解析器: ${ext}`, {
          parserType: typeof language,
          hasParser: language ? 'yes' : 'no'
        });
      } catch (error) {
        logger.error(`加载JavaScript解析器失败: ${error instanceof Error ? error.message : String(error)}`, {
          stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }
    } else if (ext === '.java') {
      try {
        if (!javaParser) {
          logger.error('Java解析器未加载');
          throw new Error('Java解析器未加载');
        }
        language = javaParser;
        logger.info(`使用Java解析器: ${ext}`, {
          parserType: typeof language,
          hasParser: language ? 'yes' : 'no'
        });
      } catch (error) {
        logger.error(`加载Java解析器失败: ${error instanceof Error ? error.message : String(error)}`, {
          stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }
    } else {
      logger.warn(`不支持的文件类型: ${filePath}`);
      return null;
    }
    
    // 读取文件内容
    let content;
    try {
      content = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      logger.error(`读取文件失败: ${filePath}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
    
    // 设置解析器语言
    try {
      if (!language) {
        throw new Error(`未能加载语言解析器: ${ext}`);
      }
      
      logger.info(`设置解析器语言: ${ext}`, {
        languageType: typeof language,
        hasLanguage: language ? 'yes' : 'no'
      });
      
      // 确保language是有效的解析器对象
      parser.setLanguage(language);
      
      // 验证解析器设置是否成功
      const currentLanguage = parser.getLanguage();
      logger.info(`解析器语言设置成功: ${ext}`, {
        hasCurrentLanguage: currentLanguage ? 'yes' : 'no'
      });
    } catch (error) {
      logger.error(`设置解析器语言失败: ${filePath}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        extension: ext
      });
      throw error;
    }
    
    // 解析代码
    let tree;
    try {
      tree = parser.parse(content);
    } catch (error) {
      logger.error(`解析代码失败: ${filePath}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        extension: ext
      });
      throw error;
    }
    
    // 提取代码元素
    const elements: CodeElement[] = [];
    
    // 根据不同语言提取代码元素
    try {
      if (ext === '.cs') {
        extractCSharpElements(tree.rootNode, elements, content, filePath);
      } else if (ext === '.ts' || ext === '.tsx') {
        extractTypeScriptElements(tree.rootNode, elements, content, filePath);
      } else if (ext === '.js' || ext === '.jsx') {
        extractJavaScriptElements(tree.rootNode, elements, content, filePath);
      } else if (ext === '.java') {
        extractJavaElements(tree.rootNode, elements, content, filePath);
      }
    } catch (error) {
      logger.error(`提取代码元素失败: ${filePath}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        extension: ext
      });
      throw error;
    }
    
    logger.info(`文件分析完成: ${filePath}, 找到 ${elements.length} 个代码元素`);
    
    return {
      filePath,
      language: ext.substring(1).toUpperCase(), // 去掉点号，转为大写
      elements
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // 打印详细的错误信息
    console.error(`分析文件失败: ${filePath}`);
    console.error(`错误信息: ${errorMessage}`);
    if (errorStack) {
      console.error(`错误堆栈: ${errorStack}`);
    }
    
    logger.error(`分析文件失败: ${filePath}`, {
      error: errorMessage,
      stack: errorStack
    });
    
    return null;
  }
}

/**
 * 提取C#代码元素
 */
function extractCSharpElements(
  rootNode: Parser.SyntaxNode,
  elements: CodeElement[],
  fileContent: string,
  filePath: string
): void {
  // 查找所有类声明
  const classNodes = findNodes(rootNode, 'class_declaration');
  for (const classNode of classNodes) {
    // 使用 child 方法查找名称节点
    let nameNode = null;
    for (let i = 0; i < classNode.childCount; i++) {
      const child = classNode.child(i);
      if (child && child.type === 'identifier') {
        nameNode = child;
        break;
      }
    }
    
    const className = nameNode ? getNodeText(nameNode, fileContent) : null;
    if (!className) continue;
    
    // 获取类的可见性
    const visibilityNode = findVisibilityModifier(classNode);
    const visibility = visibilityNode ? 
      convertCSharpVisibility(getNodeText(visibilityNode, fileContent)) : 
      Visibility.Default;
    
    const classElement: CodeElement = {
      type: ElementType.Class,
      name: className,
      visibility,
      methods: [],
      properties: []
    };
    
    // 查找类的继承
    const baseClause = findNode(classNode, 'base_list');
    if (baseClause) {
      const extendsNode = findNode(baseClause, 'primary_constructor_base_type');
      if (extendsNode) {
        classElement.extendsClass = getNodeText(extendsNode, fileContent);
      }
    }
    
    // 查找类的接口实现
    const implementsClause = findNode(classNode, 'base_list');
    if (implementsClause) {
      const implementsText = getNodeText(implementsClause, fileContent);
      if (implementsText) {
        // 解析接口列表，这里简化处理
        const interfaces = implementsText.split(',').map(i => i.trim());
        classElement.implementsInterfaces = interfaces;
      }
    }
    
    // 查找类的公共方法
    const methodNodes = findNodes(classNode, 'method_declaration');
    for (const methodNode of methodNodes) {
      // 获取方法名
      let methodNameNode = null;
      for (let i = 0; i < methodNode.childCount; i++) {
        const child = methodNode.child(i);
        if (child && child.type === 'identifier') {
          methodNameNode = child;
          break;
        }
      }
      
      if (!methodNameNode) continue;
      
      const methodName = getNodeText(methodNameNode, fileContent);
      
      // 获取方法可见性
      const methodVisibilityNode = findVisibilityModifier(methodNode);
      const methodVisibility = methodVisibilityNode ? 
        convertCSharpVisibility(getNodeText(methodVisibilityNode, fileContent)) : 
        Visibility.Default;
      
      // 获取返回类型
      let returnTypeNode = null;
      for (let i = 0; i < methodNode.childCount; i++) {
        const child = methodNode.child(i);
        if (child && (child.type === 'predefined_type' || child.type === 'identifier')) {
          returnTypeNode = child;
          break;
        }
      }
      
      const returnType = returnTypeNode ? getNodeText(returnTypeNode, fileContent) : 'void';
      
      // 获取参数
      const parameters: ParameterInfo[] = [];
      const parameterListNode = findNode(methodNode, 'parameter_list');
      if (parameterListNode) {
        const parameterNodes = findNodes(parameterListNode, 'parameter');
        for (const paramNode of parameterNodes) {
          // 获取参数名
          let paramNameNode = null;
          for (let i = 0; i < paramNode.childCount; i++) {
            const child = paramNode.child(i);
            if (child && child.type === 'identifier') {
              paramNameNode = child;
              break;
            }
          }
          
          if (!paramNameNode) continue;
          
          const paramName = getNodeText(paramNameNode, fileContent);
          
          // 获取参数类型
          let paramTypeNode = null;
          for (let i = 0; i < paramNode.childCount; i++) {
            const child = paramNode.child(i);
            if (child && (child.type === 'predefined_type' || child.type === 'identifier')) {
              paramTypeNode = child;
              break;
            }
          }
          
          const paramType = paramTypeNode ? getNodeText(paramTypeNode, fileContent) : 'object';
          
          parameters.push({
            name: paramName,
            type: paramType
          });
        }
      }
      
      if (classElement.methods) {
        classElement.methods.push({
          name: methodName,
          visibility: methodVisibility,
          returnType,
          parameters
        });
      }
    }
    
    // 查找类的属性
    const propertyNodes = findNodes(classNode, 'property_declaration');
    for (const propNode of propertyNodes) {
      // 获取属性名
      let propNameNode = null;
      for (let i = 0; i < propNode.childCount; i++) {
        const child = propNode.child(i);
        if (child && child.type === 'identifier') {
          propNameNode = child;
          break;
        }
      }
      
      if (!propNameNode) continue;
      
      const propName = getNodeText(propNameNode, fileContent);
      
      // 获取属性可见性
      const propVisibilityNode = findVisibilityModifier(propNode);
      const propVisibility = propVisibilityNode ? 
        convertCSharpVisibility(getNodeText(propVisibilityNode, fileContent)) : 
        Visibility.Default;
      
      // 获取属性类型
      let propTypeNode = null;
      for (let i = 0; i < propNode.childCount; i++) {
        const child = propNode.child(i);
        if (child && (child.type === 'predefined_type' || child.type === 'identifier')) {
          propTypeNode = child;
          break;
        }
      }
      
      const propType = propTypeNode ? getNodeText(propTypeNode, fileContent) : 'object';
      
      if (classElement.properties) {
        classElement.properties.push({
          name: propName,
          visibility: propVisibility,
          type: propType
        });
      }
    }
    
    elements.push(classElement);
  }
  
  // 查找所有接口声明
  const interfaceNodes = findNodes(rootNode, 'interface_declaration');
  for (const interfaceNode of interfaceNodes) {
    // 获取接口名
    let nameNode = null;
    for (let i = 0; i < interfaceNode.childCount; i++) {
      const child = interfaceNode.child(i);
      if (child && child.type === 'identifier') {
        nameNode = child;
        break;
      }
    }
    
    const interfaceName = nameNode ? getNodeText(nameNode, fileContent) : null;
    if (!interfaceName) continue;
    
    // 获取接口的可见性
    const visibilityNode = findVisibilityModifier(interfaceNode);
    const visibility = visibilityNode ? 
      convertCSharpVisibility(getNodeText(visibilityNode, fileContent)) : 
      Visibility.Default;
    
    const interfaceElement: CodeElement = {
      type: ElementType.Interface,
      name: interfaceName,
      visibility,
      methods: [],
      properties: []
    };
    
    // 查找接口的方法
    const methodNodes = findNodes(interfaceNode, 'method_declaration');
    for (const methodNode of methodNodes) {
      // 获取方法名
      let methodNameNode = null;
      for (let i = 0; i < methodNode.childCount; i++) {
        const child = methodNode.child(i);
        if (child && child.type === 'identifier') {
          methodNameNode = child;
          break;
        }
      }
      
      if (!methodNameNode) continue;
      
      const methodName = getNodeText(methodNameNode, fileContent);
      
      if (interfaceElement.methods) {
        interfaceElement.methods.push({
          name: methodName,
          visibility: Visibility.Public // 接口方法默认为公共
        });
      }
    }
    
    // 查找接口的属性
    const propertyNodes = findNodes(interfaceNode, 'property_declaration');
    for (const propNode of propertyNodes) {
      // 获取属性名
      let propNameNode = null;
      for (let i = 0; i < propNode.childCount; i++) {
        const child = propNode.child(i);
        if (child && child.type === 'identifier') {
          propNameNode = child;
          break;
        }
      }
      
      if (!propNameNode) continue;
      
      const propName = getNodeText(propNameNode, fileContent);
      
      if (interfaceElement.properties) {
        interfaceElement.properties.push({
          name: propName,
          visibility: Visibility.Public // 接口属性默认为公共
        });
      }
    }
    
    elements.push(interfaceElement);
  }
}

/**
 * 提取TypeScript代码元素
 */
function extractTypeScriptElements(
  rootNode: Parser.SyntaxNode,
  elements: CodeElement[],
  fileContent: string,
  filePath: string
): void {
  try {
    // 打印根节点信息，帮助调试
    console.log(`分析TypeScript文件: ${filePath}`);
    console.log(`根节点类型: ${rootNode.type}, 子节点数量: ${rootNode.childCount}`);
    
    // 打印所有顶级节点类型，帮助调试
    for (let i = 0; i < rootNode.childCount; i++) {
      const child = rootNode.child(i);
      if (child) {
        console.log(`顶级节点 ${i}: 类型=${child.type}`);
      }
    }
    
    // 查找所有类声明
    const classNodes = findNodes(rootNode, 'class_declaration');
    console.log(`找到 ${classNodes.length} 个类声明`);
    
    for (const classNode of classNodes) {
      // 打印类节点信息
      console.log(`类节点: 类型=${classNode.type}, 子节点数量=${classNode.childCount}`);
      
      // 打印所有类子节点类型，帮助调试
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child) {
          console.log(`类子节点 ${i}: 类型=${child.type}`);
        }
      }
      
      // 获取类名 - 支持多种可能的节点类型
      let nameNode = null;
      const possibleNameTypes = ['type_identifier', 'identifier'];
      
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child && possibleNameTypes.includes(child.type)) {
          nameNode = child;
          console.log(`找到类名节点: 类型=${child.type}`);
          break;
        }
      }
      
      const className = nameNode ? getNodeText(nameNode, fileContent) : null;
      if (!className) {
        console.log(`未找到类名，跳过此类`);
        continue;
      }
      
      console.log(`处理类: ${className}`);
      
      const classElement: CodeElement = {
        type: ElementType.Class,
        name: className,
        visibility: Visibility.Public, // TypeScript类默认为公共
        methods: [],
        properties: []
      };
      
      // 查找类的继承
      const extendsClause = findNode(classNode, 'extends_clause');
      if (extendsClause) {
        // 尝试获取继承的类名
        const extendsType = findNode(extendsClause, 'type_identifier') || 
                           findNode(extendsClause, 'identifier');
        if (extendsType) {
          classElement.extendsClass = getNodeText(extendsType, fileContent);
          console.log(`类 ${className} 继承自: ${classElement.extendsClass}`);
        }
      }
      
      // 查找类的方法 - 支持多种可能的节点类型
      const methodNodeTypes = ['method_definition', 'method_declaration'];
      let methodNodes: Parser.SyntaxNode[] = [];
      
      for (const type of methodNodeTypes) {
        const nodes = findNodes(classNode, type);
        if (nodes.length > 0) {
          console.log(`找到 ${nodes.length} 个方法 (类型: ${type})`);
          methodNodes = methodNodes.concat(nodes);
        }
      }
      
      for (const methodNode of methodNodes) {
        // 打印方法节点信息
        console.log(`方法节点: 类型=${methodNode.type}, 子节点数量=${methodNode.childCount}`);
        
        // 打印所有方法子节点类型，帮助调试
        for (let i = 0; i < methodNode.childCount; i++) {
          const child = methodNode.child(i);
          if (child) {
            console.log(`方法子节点 ${i}: 类型=${child.type}`);
          }
        }
        
        // 获取方法名 - 支持多种可能的节点类型
        let methodNameNode = null;
        const possibleMethodNameTypes = ['property_identifier', 'identifier'];
        
        for (let i = 0; i < methodNode.childCount; i++) {
          const child = methodNode.child(i);
          if (child && possibleMethodNameTypes.includes(child.type)) {
            methodNameNode = child;
            console.log(`找到方法名节点: 类型=${child.type}`);
            break;
          }
        }
        
        if (!methodNameNode) {
          console.log(`未找到方法名，跳过此方法`);
          continue;
        }
        
        const methodName = getNodeText(methodNameNode, fileContent);
        console.log(`处理方法: ${methodName}`);
        
        // 判断方法可见性
        let methodVisibility = Visibility.Public;
        if (methodName.startsWith('_') || methodName.startsWith('#')) {
          methodVisibility = Visibility.Private;
        }
        
        // 查找访问修饰符
        const accessModifier = findNode(methodNode, 'accessibility_modifier');
        if (accessModifier) {
          const accessText = getNodeText(accessModifier, fileContent);
          if (accessText === 'private') {
            methodVisibility = Visibility.Private;
          } else if (accessText === 'protected') {
            methodVisibility = Visibility.Protected;
          }
        }
        
        if (classElement.methods) {
          classElement.methods.push({
            name: methodName,
            visibility: methodVisibility
          });
        }
      }
      
      // 查找类的属性 - 支持多种可能的节点类型
      const propertyNodeTypes = ['public_field_definition', 'property_declaration', 'property_signature'];
      let propertyNodes: Parser.SyntaxNode[] = [];
      
      for (const type of propertyNodeTypes) {
        const nodes = findNodes(classNode, type);
        if (nodes.length > 0) {
          console.log(`找到 ${nodes.length} 个属性 (类型: ${type})`);
          propertyNodes = propertyNodes.concat(nodes);
        }
      }
      
      for (const propNode of propertyNodes) {
        // 打印属性节点信息
        console.log(`属性节点: 类型=${propNode.type}, 子节点数量=${propNode.childCount}`);
        
        // 打印所有属性子节点类型，帮助调试
        for (let i = 0; i < propNode.childCount; i++) {
          const child = propNode.child(i);
          if (child) {
            console.log(`属性子节点 ${i}: 类型=${child.type}`);
          }
        }
        
        // 获取属性名 - 支持多种可能的节点类型
        let propNameNode = null;
        const possiblePropNameTypes = ['property_identifier', 'identifier'];
        
        for (let i = 0; i < propNode.childCount; i++) {
          const child = propNode.child(i);
          if (child && possiblePropNameTypes.includes(child.type)) {
            propNameNode = child;
            console.log(`找到属性名节点: 类型=${child.type}`);
            break;
          }
        }
        
        if (!propNameNode) {
          console.log(`未找到属性名，跳过此属性`);
          continue;
        }
        
        const propName = getNodeText(propNameNode, fileContent);
        console.log(`处理属性: ${propName}`);
        
        // 判断属性可见性
        let propVisibility = Visibility.Public;
        if (propName.startsWith('_') || propName.startsWith('#')) {
          propVisibility = Visibility.Private;
        }
        
        // 查找访问修饰符
        const accessModifier = findNode(propNode, 'accessibility_modifier');
        if (accessModifier) {
          const accessText = getNodeText(accessModifier, fileContent);
          if (accessText === 'private') {
            propVisibility = Visibility.Private;
          } else if (accessText === 'protected') {
            propVisibility = Visibility.Protected;
          }
        }
        
        if (classElement.properties) {
          classElement.properties.push({
            name: propName,
            visibility: propVisibility
          });
        }
      }
      
      elements.push(classElement);
    }
    
    // 查找所有接口声明
    const interfaceNodes = findNodes(rootNode, 'interface_declaration');
    console.log(`找到 ${interfaceNodes.length} 个接口声明`);
    
    for (const interfaceNode of interfaceNodes) {
      // 打印接口节点信息
      console.log(`接口节点: 类型=${interfaceNode.type}, 子节点数量=${interfaceNode.childCount}`);
      
      // 获取接口名 - 支持多种可能的节点类型
      let nameNode = null;
      const possibleNameTypes = ['type_identifier', 'identifier'];
      
      for (let i = 0; i < interfaceNode.childCount; i++) {
        const child = interfaceNode.child(i);
        if (child && possibleNameTypes.includes(child.type)) {
          nameNode = child;
          break;
        }
      }
      
      const interfaceName = nameNode ? getNodeText(nameNode, fileContent) : null;
      if (!interfaceName) {
        console.log(`未找到接口名，跳过此接口`);
        continue;
      }
      
      console.log(`处理接口: ${interfaceName}`);
      
      const interfaceElement: CodeElement = {
        type: ElementType.Interface,
        name: interfaceName,
        visibility: Visibility.Public, // TypeScript接口默认为公共
        methods: [],
        properties: []
      };
      
      elements.push(interfaceElement);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error(`提取TypeScript代码元素失败: ${filePath}`);
    console.error(`错误信息: ${errorMessage}`);
    if (errorStack) {
      console.error(`错误堆栈: ${errorStack}`);
    }
    
    logger.error(`提取TypeScript代码元素失败: ${filePath}`, {
      error: errorMessage,
      stack: errorStack
    });
  }
}

/**
 * 提取JavaScript代码元素
 */
function extractJavaScriptElements(
  rootNode: Parser.SyntaxNode,
  elements: CodeElement[],
  fileContent: string,
  filePath: string
): void {
  // JavaScript代码分析逻辑类似于TypeScript
  extractTypeScriptElements(rootNode, elements, fileContent, filePath);
}

/**
 * 提取Java代码元素
 */
function extractJavaElements(
  rootNode: Parser.SyntaxNode,
  elements: CodeElement[],
  fileContent: string,
  filePath: string
): void {
  // 查找所有类声明
  const classNodes = findNodes(rootNode, 'class_declaration');
  for (const classNode of classNodes) {
    // 获取类名
    let nameNode = null;
    for (let i = 0; i < classNode.childCount; i++) {
      const child = classNode.child(i);
      if (child && child.type === 'identifier') {
        nameNode = child;
        break;
      }
    }
    
    const className = nameNode ? getNodeText(nameNode, fileContent) : null;
    if (!className) continue;
    
    // 获取类的可见性
    let visibility = Visibility.Default;
    if (classNode.text.includes('public ')) {
      visibility = Visibility.Public;
    } else if (classNode.text.includes('private ')) {
      visibility = Visibility.Private;
    } else if (classNode.text.includes('protected ')) {
      visibility = Visibility.Protected;
    }
    
    const classElement: CodeElement = {
      type: ElementType.Class,
      name: className,
      visibility,
      methods: [],
      properties: []
    };
    
    // 查找类的方法
    const methodNodes = findNodes(classNode, 'method_declaration');
    for (const methodNode of methodNodes) {
      // 获取方法名
      let methodNameNode = null;
      for (let i = 0; i < methodNode.childCount; i++) {
        const child = methodNode.child(i);
        if (child && child.type === 'identifier') {
          methodNameNode = child;
          break;
        }
      }
      
      if (!methodNameNode) continue;
      
      const methodName = getNodeText(methodNameNode, fileContent);
      
      // 获取方法可见性
      let methodVisibility = Visibility.Default;
      if (methodNode.text.includes('public ')) {
        methodVisibility = Visibility.Public;
      } else if (methodNode.text.includes('private ')) {
        methodVisibility = Visibility.Private;
      } else if (methodNode.text.includes('protected ')) {
        methodVisibility = Visibility.Protected;
      }
      
      if (classElement.methods) {
        classElement.methods.push({
          name: methodName,
          visibility: methodVisibility
        });
      }
    }
    
    // 查找类的字段
    const fieldNodes = findNodes(classNode, 'field_declaration');
    for (const fieldNode of fieldNodes) {
      // 获取字段名
      const declaratorNode = findNode(fieldNode, 'variable_declarator');
      if (!declaratorNode) continue;
      
      let fieldNameNode = null;
      for (let i = 0; i < declaratorNode.childCount; i++) {
        const child = declaratorNode.child(i);
        if (child && child.type === 'identifier') {
          fieldNameNode = child;
          break;
        }
      }
      
      if (!fieldNameNode) continue;
      
      const fieldName = getNodeText(fieldNameNode, fileContent);
      
      // 获取字段可见性
      let fieldVisibility = Visibility.Default;
      if (fieldNode.text.includes('public ')) {
        fieldVisibility = Visibility.Public;
      } else if (fieldNode.text.includes('private ')) {
        fieldVisibility = Visibility.Private;
      } else if (fieldNode.text.includes('protected ')) {
        fieldVisibility = Visibility.Protected;
      }
      
      if (classElement.properties) {
        classElement.properties.push({
          name: fieldName,
          visibility: fieldVisibility
        });
      }
    }
    
    elements.push(classElement);
  }
  
  // 查找所有接口声明
  const interfaceNodes = findNodes(rootNode, 'interface_declaration');
  for (const interfaceNode of interfaceNodes) {
    // 获取接口名
    let nameNode = null;
    for (let i = 0; i < interfaceNode.childCount; i++) {
      const child = interfaceNode.child(i);
      if (child && child.type === 'identifier') {
        nameNode = child;
        break;
      }
    }
    
    const interfaceName = nameNode ? getNodeText(nameNode, fileContent) : null;
    if (!interfaceName) continue;
    
    // 获取接口的可见性
    let visibility = Visibility.Default;
    if (interfaceNode.text.includes('public ')) {
      visibility = Visibility.Public;
    } else if (interfaceNode.text.includes('private ')) {
      visibility = Visibility.Private;
    } else if (interfaceNode.text.includes('protected ')) {
      visibility = Visibility.Protected;
    }
    
    const interfaceElement: CodeElement = {
      type: ElementType.Interface,
      name: interfaceName,
      visibility,
      methods: [],
      properties: []
    };
    
    elements.push(interfaceElement);
  }
}

/**
 * 在语法树中查找指定类型的节点
 * @param node 当前节点
 * @param type 节点类型
 * @returns 匹配的节点列表
 */
function findNodes(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
  const nodes: Parser.SyntaxNode[] = [];
  
  if (node.type === type) {
    nodes.push(node);
  }
  
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      nodes.push(...findNodes(child, type));
    }
  }
  
  return nodes;
}

/**
 * 在语法树中查找第一个指定类型的节点
 * @param node 当前节点
 * @param type 节点类型
 * @returns 匹配的节点或null
 */
function findNode(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
  if (node.type === type) {
    return node;
  }
  
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      const result = findNode(child, type);
      if (result) {
        return result;
      }
    }
  }
  
  return null;
}

/**
 * 查找节点的可见性修饰符
 * @param node 节点
 * @returns 可见性修饰符节点或null
 */
function findVisibilityModifier(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  const modifiers = ['public', 'private', 'protected', 'internal'];
  
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && modifiers.includes(child.type)) {
      return child;
    }
  }
  
  return null;
}

/**
 * 获取节点的文本内容
 * @param node 节点
 * @param fileContent 文件内容
 * @returns 节点文本
 */
function getNodeText(node: Parser.SyntaxNode | null, fileContent: string): string {
  if (!node) return '';
  return fileContent.substring(node.startIndex, node.endIndex);
}

/**
 * 转换C#可见性为通用可见性
 * @param visibility C#可见性字符串
 * @returns 通用可见性枚举
 */
function convertCSharpVisibility(visibility: string): Visibility {
  switch (visibility.trim()) {
    case 'public':
      return Visibility.Public;
    case 'private':
      return Visibility.Private;
    case 'protected':
      return Visibility.Protected;
    case 'internal':
      return Visibility.Internal;
    default:
      return Visibility.Default;
  }
}
