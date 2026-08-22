const OPERATORS = {
  "+": { precedence: 1, apply: (a, b) => a + b },
  "-": { precedence: 1, apply: (a, b) => a - b },
  "*": { precedence: 2, apply: (a, b) => a * b },
  "/": { precedence: 2, apply: (a, b) => a / b },
  "%": { precedence: 2, apply: (a, b) => a % b },
  "^": { precedence: 3, right: true, apply: (a, b) => a ** b },
};

function tokenize(expression) {
  const compact = String(expression).replace(/\s+/g, "");
  if (!compact || compact.length > 120) throw new Error("Enter a shorter calculation.");
  const tokens = compact.match(/(?:\d+(?:\.\d+)?|[()+\-*/%^])/g) || [];
  if (tokens.join("") !== compact) throw new Error("Only numbers and + - * / % ^ ( ) are allowed.");
  return tokens;
}

export function calculate(expression) {
  const tokens = tokenize(expression);
  const output = [];
  const operators = [];
  let expectValue = true;

  for (const token of tokens) {
    if (/^\d/.test(token)) {
      output.push(Number(token));
      expectValue = false;
      continue;
    }
    if (token === "(") {
      operators.push(token);
      expectValue = true;
      continue;
    }
    if (token === ")") {
      while (operators.length && operators.at(-1) !== "(") output.push(operators.pop());
      if (operators.pop() !== "(") throw new Error("Parentheses do not match.");
      expectValue = false;
      continue;
    }

    if (expectValue && token === "-") output.push(0);
    else if (expectValue) throw new Error("The calculation is incomplete.");

    const current = OPERATORS[token];
    while (operators.length && OPERATORS[operators.at(-1)]) {
      const top = OPERATORS[operators.at(-1)];
      if (
        top.precedence > current.precedence ||
        (top.precedence === current.precedence && !current.right)
      ) output.push(operators.pop());
      else break;
    }
    operators.push(token);
    expectValue = true;
  }

  if (expectValue) throw new Error("The calculation is incomplete.");
  while (operators.length) {
    const operator = operators.pop();
    if (operator === "(") throw new Error("Parentheses do not match.");
    output.push(operator);
  }

  const stack = [];
  for (const token of output) {
    if (typeof token === "number") stack.push(token);
    else {
      const right = stack.pop();
      const left = stack.pop();
      if (left === undefined || right === undefined) throw new Error("Invalid calculation.");
      const result = OPERATORS[token].apply(left, right);
      if (!Number.isFinite(result)) throw new Error("The result is not a finite number.");
      stack.push(result);
    }
  }
  if (stack.length !== 1) throw new Error("Invalid calculation.");
  return Number(stack[0].toPrecision(12));
}
