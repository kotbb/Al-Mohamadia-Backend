import ts from 'typescript';
import { posix } from 'node:path';

/** Placement checks only: no line-count limits or restrictions on private methods. */
export function checkSource(file, source, mode) {
  file = file.replaceAll('\\', '/');
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const errors = [];
  const add = (node, rule, destination) =>
    errors.push({ file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, rule, destination });
  const exported = (node) => node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  const isFunction = (node) => ts.isArrowFunction(node) || ts.isFunctionExpression(node);
  const bindsName = (binding, name) =>
    ts.isIdentifier(binding)
      ? binding.text === name
      : (ts.isObjectBindingPattern(binding) || ts.isArrayBindingPattern(binding)) &&
        binding.elements.some((element) => ts.isBindingElement(element) && bindsName(element.name, name));
  function isLocallyBound(node) {
    for (let scope = node.parent; scope; scope = scope.parent) {
      if (ts.isFunctionLike(scope) && scope.parameters.some((parameter) => bindsName(parameter.name, node.text)))
        return true;
      if (ts.isCatchClause(scope) && scope.variableDeclaration && bindsName(scope.variableDeclaration.name, node.text))
        return true;
      if (ts.isBlock(scope) || ts.isSourceFile(scope))
        for (const statement of scope.statements) {
          if (
            ts.isVariableStatement(statement) &&
            statement.declarationList.declarations.some((declaration) => bindsName(declaration.name, node.text))
          )
            return true;
          if (ts.isImportDeclaration(statement) && statement.importClause) {
            const clause = statement.importClause;
            if (clause.name?.text === node.text) return true;
            if (
              clause.namedBindings &&
              ts.isNamespaceImport(clause.namedBindings) &&
              clause.namedBindings.name.text === node.text
            )
              return true;
            if (
              clause.namedBindings &&
              ts.isNamedImports(clause.namedBindings) &&
              clause.namedBindings.elements.some((element) => element.name.text === node.text)
            )
              return true;
          }
        }
    }
    return false;
  }
  const service = /\/[^/]+\.service\.ts$/.test(file);
  const hook = /app\/modules\/[^/]+\/hooks\//.test(file);
  const route =
    /^app\/(?!modules\/|layout\/)/.test(file) &&
    !/\/(layout|loading|error|not-found|template|default)\.tsx$/.test(file);
  const stateHookNames = new Set(['useState', 'useEffect', 'useReducer', 'useLayoutEffect', 'useSyncExternalStore']);
  for (const node of ast.statements)
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier.text === 'react' &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const binding of node.importClause.namedBindings.elements)
        if (stateHookNames.has(binding.propertyName?.text ?? binding.name.text)) stateHookNames.add(binding.name.text);
    }
  for (const node of ast.statements) {
    if (mode === 'backend' && service) {
      if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node))
        add(node, 'backend-service-contract', 'owning feature/types/');
      if (
        ts.isFunctionDeclaration(node) ||
        (ts.isVariableStatement(node) &&
          node.declarationList.declarations.some(
            (declaration) => declaration.initializer && isFunction(declaration.initializer),
          ))
      )
        add(node, 'backend-service-helper', 'owning feature/utils/');
    }
    if (mode === 'frontend' && hook) {
      if (exported(node) && (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)))
        add(node, 'hook-exported-contract', 'owning feature/types/');
      if (
        ts.isExportDeclaration(node) &&
        (node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.some(
              (element) =>
                element.isTypeOnly ||
                ast.statements.some(
                  (declaration) =>
                    (ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) &&
                    declaration.name.text === (element.propertyName?.text ?? element.name.text),
                ),
            )))
      )
        add(node, 'hook-exported-contract', 'owning feature/types/');
      if (ts.isFunctionDeclaration(node) && !/^use[A-Z]/.test(node.name?.text ?? ''))
        add(node, 'hook-free-helper', 'owning feature/utils/');
      if (ts.isVariableStatement(node))
        for (const declaration of node.declarationList.declarations) {
          if (
            declaration.initializer &&
            isFunction(declaration.initializer) &&
            !/^use[A-Z]/.test(declaration.name.getText(ast))
          )
            add(declaration, 'hook-free-helper', 'owning feature/utils/');
        }
    }
    if (mode === 'frontend' && /^app\/modules\//.test(file) && ts.isImportDeclaration(node)) {
      const modulePath = node.moduleSpecifier.text;
      const resolved = modulePath.startsWith('@/')
        ? modulePath.slice(2)
        : modulePath.startsWith('.')
          ? posix.normalize(posix.join(posix.dirname(file), modulePath))
          : modulePath;
      const clause = node.importClause;
      if (
        /\/hooks\//.test(resolved) &&
        (clause?.isTypeOnly ||
          (clause?.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.some((element) => element.isTypeOnly)))
      )
        add(node, 'type-import-from-hook', 'import the contract from feature/types/');
    }
  }
  function visit(node) {
    if (mode === 'frontend' && service) {
      if (
        ts.isIdentifier(node) &&
        ['document', 'window'].includes(node.text) &&
        !isLocallyBound(node) &&
        !(
          (ts.isPropertyAccessExpression(node.parent) ||
            ts.isPropertyAssignment(node.parent) ||
            ts.isPropertySignature(node.parent)) &&
          node.parent.name === node
        )
      )
        add(node, 'http-service-browser-operation', 'owning feature/utils/*-pdf.ts or another browser utility');
      if (
        ts.isPropertyAccessExpression(node) &&
        node.expression.getText(ast) === 'globalThis' &&
        ['document', 'window'].includes(node.name.text)
      )
        add(node, 'http-service-browser-operation', 'owning feature/utils/');
      if (
        ts.isElementAccessExpression(node) &&
        node.expression.getText(ast) === 'globalThis' &&
        ts.isStringLiteral(node.argumentExpression) &&
        ['document', 'window'].includes(node.argumentExpression.text)
      )
        add(node, 'http-service-browser-operation', 'owning feature/utils/');
      if (
        ts.isStringLiteral(node) &&
        /html2pdf|html2canvas|jspdf/i.test(node.text) &&
        (ts.isImportDeclaration(node.parent) || ts.isCallExpression(node.parent))
      )
        add(node, 'http-service-pdf-import', 'owning feature/utils/*-pdf.ts');
    }
    if (mode === 'frontend' && route) {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        /^[a-z]/.test(node.tagName.getText(ast))
      )
        add(node, 'route-feature-ui', 'app/modules/{feature}/pages/ or components/');
      if (
        ts.isCallExpression(node) &&
        ((ts.isIdentifier(node.expression) && stateHookNames.has(node.expression.text)) ||
          (ts.isPropertyAccessExpression(node.expression) && stateHookNames.has(node.expression.name.text)))
      )
        add(node, 'route-client-state', 'app/modules/{feature}/hooks/');
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'fetch')
        add(node, 'route-http-call', 'app/modules/{feature}/services/');
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return errors;
}
