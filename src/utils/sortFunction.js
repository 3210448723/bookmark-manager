/**
 * 自定义排序函数的解析工具。
 *
 * 书签排序函数会写入 localStorage，因此这里返回的必须是可序列化的
 * 函数字符串，而不是 Function 实例。执行时再根据字符串创建比较器。
 */

const MAX_SORT_FUNCTION_LENGTH = 1000;

/**
 * 将用户输入规范化为 `new Function('a', 'b', body)` 可执行的函数体。
 * @param {unknown} source 用户输入的函数体或箭头函数
 * @returns {string} 可持久化的函数体
 */
function normalizeSortFunction(source) {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new Error('排序函数不能为空');
  }

  let code = source.trim();
  if (code.length > MAX_SORT_FUNCTION_LENGTH) {
    throw new Error('排序函数过长');
  }

  // 支持 `(a, b) => expression`、`(a, b) => { return ... }` 两种写法。
  const arrowMatch = code.match(/^\s*\(\s*[a-zA-Z_$][\w$]*\s*,\s*[a-zA-Z_$][\w$]*\s*\)\s*=>\s*([\s\S]+)$/);
  if (arrowMatch) {
    const arrowBody = arrowMatch[1].trim();
    code = arrowBody.startsWith('{') && arrowBody.endsWith('}')
      ? arrowBody.slice(1, -1).trim()
      : `return ${arrowBody}`;
  }

  // 禁止访问宿主环境和动态代码执行 API。排序函数只应读取 a、b 的字段。
  const forbidden = /\b(?:eval|Function|setTimeout|setInterval|document|window|globalThis|process|require|import|fetch|XMLHttpRequest|localStorage|sessionStorage)\b/;
  if (forbidden.test(code)) {
    throw new Error('排序函数包含不安全的内容');
  }

  // 只有表达式需要自动补 return；包含 if/return 的函数体保持原样。
  if (!/^\s*return\b/.test(code) && !/\breturn\b/.test(code)) {
    code = `return ${code}`;
  }

  try {
    // 语法验证在真正排序前完成，避免半途修改状态。
    // eslint-disable-next-line no-new-func
    new Function('a', 'b', code);
  } catch (error) {
    throw new Error(`排序函数语法错误: ${error.message}`);
  }

  return code;
}

/**
 * 创建排序比较器。
 * @param {string} source 已规范化或待规范化的函数体
 * @returns {{ source: string, compare: Function }}
 */
function createSortComparator(source) {
  const normalized = normalizeSortFunction(source);
  // eslint-disable-next-line no-new-func
  const compare = new Function('a', 'b', normalized);
  return { source: normalized, compare };
}

module.exports = {
  MAX_SORT_FUNCTION_LENGTH,
  normalizeSortFunction,
  createSortComparator
};
