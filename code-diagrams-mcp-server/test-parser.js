// 测试 tree-sitter-typescript 解析器
import Parser from 'tree-sitter';
import * as fs from 'fs';
import * as path from 'path';

// 尝试不同的导入方式
async function testParser() {
  console.log('开始测试 TypeScript 解析器...');
  
  try {
    // 创建解析器实例
    const parser = new Parser();
    console.log('解析器实例创建成功');
    
    // 方法1: 直接导入
    console.log('方法1: 直接导入');
    try {
      const tsModule = await import('tree-sitter-typescript');
      console.log('导入成功，模块结构:', Object.keys(tsModule));
      console.log('default 属性:', typeof tsModule.default);
      
      if (tsModule.default) {
        console.log('default 属性的键:', Object.keys(tsModule.default));
      }
      
      // 尝试设置语言
      if (tsModule.typescript) {
        console.log('使用 tsModule.typescript');
        parser.setLanguage(tsModule.typescript);
        console.log('设置语言成功 (tsModule.typescript)');
      } else if (tsModule.default && tsModule.default.typescript) {
        console.log('使用 tsModule.default.typescript');
        parser.setLanguage(tsModule.default.typescript);
        console.log('设置语言成功 (tsModule.default.typescript)');
      } else {
        console.log('无法找到 typescript 语言对象');
      }
    } catch (error) {
      console.error('方法1失败:', error);
    }
    
    // 方法2: 使用 require
    console.log('\n方法2: 使用 require');
    try {
      // 使用 createRequire 创建 require 函数
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      
      const tsParser = require('tree-sitter-typescript');
      console.log('导入成功，模块结构:', Object.keys(tsParser));
      
      // 尝试设置语言
      if (tsParser.typescript) {
        console.log('使用 tsParser.typescript');
        parser.setLanguage(tsParser.typescript);
        console.log('设置语言成功 (tsParser.typescript)');
      } else {
        console.log('无法找到 typescript 语言对象');
      }
    } catch (error) {
      console.error('方法2失败:', error);
    }
    
    // 测试解析简单的 TypeScript 代码
    if (parser.getLanguage()) {
      console.log('\n测试解析 TypeScript 代码:');
      const sourceCode = `
        class TestClass {
          private name: string;
          
          constructor(name: string) {
            this.name = name;
          }
          
          public getName(): string {
            return this.name;
          }
        }
      `;
      
      const tree = parser.parse(sourceCode);
      console.log('解析成功，根节点类型:', tree.rootNode.type);
      console.log('子节点数量:', tree.rootNode.childCount);
      
      // 打印语法树的第一级子节点
      for (let i = 0; i < tree.rootNode.childCount; i++) {
        const child = tree.rootNode.child(i);
        console.log(`子节点 ${i}: 类型=${child.type}, 文本="${sourceCode.substring(child.startIndex, child.endIndex).trim()}"`);
      }
    } else {
      console.log('未设置语言，无法测试解析');
    }
    
  } catch (error) {
    console.error('测试过程中出现错误:', error);
  }
}

testParser().catch(console.error);
