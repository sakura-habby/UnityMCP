#!/usr/bin/env node
import { CodeAnalyzer } from './services/code-analyzer.js';
import { logger } from './logger.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 测试代码分析器的analyzeDirectory函数
 * @param directoryPath 要分析的目录路径
 */
async function testAnalyzeDirectory(directoryPath: string): Promise<void> {
  try {
    console.log(`\n========== 代码分析器测试开始 ==========`);
    console.log(`分析目录: ${directoryPath}`);
    console.log(`时间: ${new Date().toISOString()}`);
    console.log(`========================================\n`);
    
    // 检查目录是否存在
    if (!fs.existsSync(directoryPath)) {
      console.error(`错误: 目录不存在: ${directoryPath}`);
      return;
    }
    
    // 初始化日志系统
    await logger.initialize().catch(error => {
      console.error('初始化日志系统失败:', error);
    });
    
    // 使用静态工厂方法创建代码分析器实例
    console.log('正在初始化代码分析器...');
    const codeAnalyzer = await CodeAnalyzer.create();
    console.log('代码分析器初始化完成');
    
    // 调用analyzeDirectory函数
    console.log(`\n开始分析目录: ${directoryPath}`);
    const startTime = Date.now();
    const results = await codeAnalyzer.analyzeDirectory(directoryPath);
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // 转换为秒
    
    // 打印分析结果
    console.log(`\n========== 分析结果摘要 ==========`);
    console.log(`分析完成，耗时: ${duration.toFixed(2)}秒`);
    console.log(`共分析了 ${results.length} 个文件`);
    
    // 打印每个文件的分析结果摘要
    results.forEach((result, index) => {
      console.log(`\n----- 文件 ${index + 1}: ${path.basename(result.filePath)} -----`);
      console.log(`完整路径: ${result.filePath}`);
      console.log(`语言: ${result.language}`);
      console.log(`元素数量: ${result.elements.length}`);
      
      // 打印元素类型统计
      const typeCount = new Map<string, number>();
      result.elements.forEach(element => {
        const typeName = element.type.toString();
        typeCount.set(typeName, (typeCount.get(typeName) || 0) + 1);
      });
      
      console.log('元素类型统计:');
      typeCount.forEach((count, type) => {
        console.log(`  ${type}: ${count}`);
      });
      
      // 打印前3个元素的详细信息
      if (result.elements.length > 0) {
        console.log('\n前3个元素详细信息:');
        result.elements.slice(0, 3).forEach((element, idx) => {
          console.log(`  元素 ${idx + 1}: ${element.name}`);
          console.log(`    类型: ${element.type}`);
          console.log(`    可见性: ${element.visibility}`);
          if (element.parentName) {
            console.log(`    父元素: ${element.parentName}`);
          }
          if (element.extendsClass) {
            console.log(`    继承自: ${element.extendsClass}`);
          }
          if (element.implementsInterfaces && element.implementsInterfaces.length > 0) {
            console.log(`    实现接口: ${element.implementsInterfaces.join(', ')}`);
          }
          if (element.methods && element.methods.length > 0) {
            console.log(`    方法数量: ${element.methods.length}`);
          }
          if (element.properties && element.properties.length > 0) {
            console.log(`    属性数量: ${element.properties.length}`);
          }
        });
      }
    });
    
    // 将完整结果保存到JSON文件
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `analysis-result-${timestamp}.json`);
    
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\n完整分析结果已保存到: ${outputFile}`);
    
    // 关闭日志系统
    await logger.close();
    
    console.log(`\n========== 代码分析器测试结束 ==========\n`);
    
  } catch (error) {
    // 打印详细的错误信息
    console.error('\n========== 测试失败 ==========');
    if (error instanceof Error) {
      console.error(`错误信息: ${error.message}`);
      console.error(`错误堆栈: ${error.stack}`);
    } else {
      console.error(`错误: ${error}`);
    }
    
    // 确保日志系统关闭
    await logger.close();
  }
}

// 从命令行参数获取目录路径，如果没有提供则使用当前目录
const directoryPath = process.argv[2] || process.cwd();
testAnalyzeDirectory(directoryPath)
  .then(() => {
    console.log('测试完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('测试失败:', error);
    process.exit(1);
  });
