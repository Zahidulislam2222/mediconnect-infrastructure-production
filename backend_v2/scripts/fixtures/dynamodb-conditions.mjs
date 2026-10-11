// Strict synthetic condition evaluation shared by webhook CI fixtures.
function split(expression, operator) {
  let depth = 0;
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === '(') depth++;
    if (expression[i] === ')') depth--;
    if (depth === 0 && expression.slice(i).startsWith(` ${operator} `)) return [expression.slice(0, i), expression.slice(i + operator.length + 2)];
  }
}
export function holds(row, expression, names = {}, values = {}) {
  if (!expression) return true;
  expression = expression.trim();
  for (const op of ['OR', 'AND']) {
    const parts = split(expression, op);
    if (parts) return op === 'OR' ? parts.some(p => holds(row, p, names, values)) : parts.every(p => holds(row, p, names, values));
  }
  if (expression.startsWith('(') && expression.endsWith(')')) return holds(row, expression.slice(1, -1), names, values);
  const resolve = key => row?.[names[key] ?? key];
  let m = expression.match(/^attribute_(not_)?exists\(([^)]+)\)$/);
  if (m) return m[1] ? resolve(m[2]) === undefined : resolve(m[2]) !== undefined;
  m = expression.match(/^(\S+)\s*(<>|<=|>=|=|<|>)\s*(:\w+)$/);
  if (!m) throw new Error(`Unsupported DynamoDB condition: ${expression}`);
  const left = resolve(m[1]), right = values[m[3]];
  if (left === undefined || typeof left !== typeof right) return false;
  return ({ '=': () => left === right, '<>': () => left !== right, '<': () => left < right, '>': () => left > right, '<=': () => left <= right, '>=': () => left >= right })[m[2]]();
}
