function getPathValue(source, pathStr) {
  if (!source || !pathStr) {
    return undefined;
  }

  return pathStr.split('.').reduce((accumulator, key) => {
    if (accumulator === undefined || accumulator === null) {
      return undefined;
    }

    return accumulator[key];
  }, source);
}

function parseTokens(expression) {
  const tokens = [];
  const matcher = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  let match;

  while ((match = matcher.exec(expression)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      tokens.push(match[2]);
    } else {
      tokens.push(match[3]);
    }
  }

  return tokens;
}

function resolveValue(pathStr, scope) {
  if (!pathStr) {
    return undefined;
  }

  if (pathStr === 'this') {
    return scope.current;
  }

  if (pathStr === '@index') {
    return scope.index;
  }

  let targetPath = pathStr.trim();
  let parentOffset = 0;
  while (targetPath.startsWith('../')) {
    parentOffset += 1;
    targetPath = targetPath.slice(3);
  }

  if (!targetPath) {
    if (parentOffset > 0) {
      return scope.parents[parentOffset - 1] ?? scope.root;
    }

    return scope.current ?? scope.root;
  }

  const parentSource =
    parentOffset > 0 ? (scope.parents[parentOffset - 1] ?? scope.root) : undefined;
  const candidates = [];

  if (parentSource !== undefined) {
    candidates.push(parentSource);
  } else if (scope.current && typeof scope.current === 'object') {
    candidates.push(scope.current);
  }

  candidates.push(scope.root);

  for (const candidate of candidates) {
    const value = getPathValue(candidate, targetPath);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function evaluateCondition(expression, scope) {
  const trimmed = expression.trim();
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(1, -1).trim();
    const tokens = parseTokens(inner);
    const operator = tokens[0];

    if (operator === 'eq') {
      const left = resolveValue(tokens[1], scope) ?? tokens[1];
      const right = resolveValue(tokens[2], scope) ?? tokens[2];
      return String(left) === String(right);
    }

    if (operator === 'gt') {
      const leftRaw = resolveValue(tokens[1], scope) ?? tokens[1];
      const rightRaw = resolveValue(tokens[2], scope) ?? tokens[2];
      const left = Number(leftRaw);
      const right = Number(rightRaw);
      if (Number.isNaN(left) || Number.isNaN(right)) {
        return false;
      }

      return left > right;
    }

    return false;
  }

  const value = resolveValue(trimmed, scope);
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return Boolean(value);
}

function splitIfBranches(content) {
  const branches = [];
  const marker = /\{\{else if\s+([^}]+)\}\}|\{\{else\}\}/g;
  let currentCondition = null;
  let currentStart = 0;
  let match;

  while ((match = marker.exec(content)) !== null) {
    branches.push({
      condition: currentCondition,
      content: content.slice(currentStart, match.index)
    });

    currentCondition = match[1] ? match[1].trim() : '__else__';
    currentStart = marker.lastIndex;
  }

  branches.push({
    condition: currentCondition,
    content: content.slice(currentStart)
  });

  return branches;
}

function renderEachBlocks(template, scope) {
  const eachRegex = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  let output = template;
  let hasMatches = true;

  while (hasMatches) {
    hasMatches = false;
    output = output.replace(eachRegex, (match, expression, blockContent) => {
      hasMatches = true;
      const collection = resolveValue(expression.trim(), scope);
      if (!Array.isArray(collection) || collection.length === 0) {
        return '';
      }

      return collection
        .map((item, index) =>
          renderTemplateContent(blockContent, scope.root, {
            current: item,
            index,
            parents: [scope.current, ...scope.parents].filter((candidate) => candidate !== undefined)
          }),
        )
        .join('');
    });
  }

  return output;
}

function renderIfBlocks(template, scope) {
  const ifRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  let output = template;
  let hasMatches = true;

  while (hasMatches) {
    hasMatches = false;
    output = output.replace(ifRegex, (match, expression, blockContent) => {
      hasMatches = true;
      const branches = splitIfBranches(blockContent);

      for (const branch of branches) {
        if (branch.condition === null && evaluateCondition(expression, scope)) {
          return renderTemplateContent(branch.content, scope.root, scope);
        }

        if (branch.condition === '__else__') {
          return renderTemplateContent(branch.content, scope.root, scope);
        }

        if (branch.condition && branch.condition !== '__else__' && evaluateCondition(branch.condition, scope)) {
          return renderTemplateContent(branch.content, scope.root, scope);
        }
      }

      return '';
    });
  }

  return output;
}

function renderVariables(template, scope) {
  return template.replace(/\{\{\s*([@a-zA-Z0-9_./-]+)\s*\}\}/g, (match, key) => {
    const value = resolveValue(key, scope);
    return value === undefined || value === null ? '' : String(value);
  });
}

function renderTemplateContent(template, rootData, scopeOverrides = {}) {
  if (!template) {
    return '';
  }

  const scope = {
    root: rootData ?? {},
    current: scopeOverrides.current,
    index: scopeOverrides.index ?? null,
    parents: scopeOverrides.parents ?? []
  };

  let output = template;
  output = renderEachBlocks(output, scope);
  output = renderIfBlocks(output, scope);
  output = renderVariables(output, scope);
  return output;
}

module.exports = {
  renderTemplateContent
};
