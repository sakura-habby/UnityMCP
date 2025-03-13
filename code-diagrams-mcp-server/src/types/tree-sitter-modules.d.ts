// 为 tree-sitter 相关模块声明类型
declare module 'tree-sitter-c-sharp' {
  const Parser: any;
  export default Parser;
}

declare module 'tree-sitter-typescript' {
  const typescript: any;
  const tsx: any;
  export { typescript, tsx };
}

declare module 'tree-sitter-javascript' {
  const Parser: any;
  export default Parser;
}

declare module 'tree-sitter-java' {
  const Parser: any;
  export default Parser;
}

declare module 'tree-sitter-python' {
  const Parser: any;
  export default Parser;
}
