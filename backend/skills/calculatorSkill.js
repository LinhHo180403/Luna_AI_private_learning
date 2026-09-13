const Skill = require('./skill');
const ResponseBuilder = require('../core/responseBuilder');

const MATH_EXPRESSION_PATTERN = /^[\s0-9+\-*/^%().]+$/;
const HAS_OPERATOR_PATTERN = /[0-9]\s*[+\-*/^%]\s*[0-9(]/;

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      tokens.push({ type: 'num', value: parseFloat(num) });
      continue;
    }
    if ('+-*/^%()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    throw new Error(`Ký tự không hợp lệ: "${ch}"`);
  }
  return tokens;
}

const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
const RIGHT_ASSOC = { '^': true };

function toRPN(tokens) {
  const output = [];
  const opStack = [];
  for (const token of tokens) {
    if (token.type === 'num') {
      output.push(token);
    } else if (token.value === '(') {
      opStack.push(token);
    } else if (token.value === ')') {
      while (opStack.length && opStack[opStack.length - 1].value !== '(') {
        output.push(opStack.pop());
      }
      if (!opStack.length) throw new Error('Ngoặc không khớp.');
      opStack.pop();
    } else {
      while (
        opStack.length &&
        opStack[opStack.length - 1].value !== '(' &&
        (PRECEDENCE[opStack[opStack.length - 1].value] > PRECEDENCE[token.value] ||
          (PRECEDENCE[opStack[opStack.length - 1].value] === PRECEDENCE[token.value] && !RIGHT_ASSOC[token.value]))
      ) {
        output.push(opStack.pop());
      }
      opStack.push(token);
    }
  }
  while (opStack.length) {
    const op = opStack.pop();
    if (op.value === '(' || op.value === ')') throw new Error('Ngoặc không khớp.');
    output.push(op);
  }
  return output;
}

function evalRPN(rpn) {
  const stack = [];
  for (const token of rpn) {
    if (token.type === 'num') {
      stack.push(token.value);
    } else {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error('Biểu thức không hợp lệ.');
      switch (token.value) {
        case '+': stack.push(a + b); break;
        case '-': stack.push(a - b); break;
        case '*': stack.push(a * b); break;
        case '/':
          if (b === 0) throw new Error('Không thể chia cho 0.');
          stack.push(a / b);
          break;
        case '%': stack.push(a % b); break;
        case '^': stack.push(Math.pow(a, b)); break;
        default: throw new Error(`Toán tử không rõ: ${token.value}`);
      }
    }
  }
  if (stack.length !== 1) throw new Error('Biểu thức không hợp lệ.');
  return stack[0];
}

function calculate(expr) {
  const tokens = tokenize(expr);
  const rpn = toRPN(tokens);
  return evalRPN(rpn);
}

class CalculatorSkill extends Skill {
  constructor() {
    super('CalculatorSkill');
  }

  canHandle(context) {
    const msg = (context.message || '').trim();
    if (!msg) return false;
    return MATH_EXPRESSION_PATTERN.test(msg) && HAS_OPERATOR_PATTERN.test(msg);
  }

  async handle(context) {
    const msg = (context.message || '').trim();
    const builder = new ResponseBuilder().setSource('calculator');
    try {
      const result = calculate(msg);
      const formatted = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
      return builder
        .setReply(`${msg.trim()} = ${formatted}`)
        .setEmotion('excited')
        .setAnimation('talk')
        .setData({ expression: msg, result: formatted })
        .build();
    } catch (err) {
      return builder
        .setReply(`Luna tính không ra 😅 (${err.message})`)
        .setEmotion('sad')
        .setAnimation('thinking')
        .build();
    }
  }
}

module.exports = CalculatorSkill;
module.exports.calculate = calculate;
