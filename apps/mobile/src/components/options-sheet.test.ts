import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = ts.createSourceFile(
  'options-sheet.tsx',
  readFileSync(fileURLToPath(new URL('./options-sheet.tsx', import.meta.url)), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function jsxElements(node: ts.Node, name: string): ts.JsxElement[] {
  const elements: ts.JsxElement[] = [];
  function visit(current: ts.Node) {
    if (ts.isJsxElement(current) && ts.isIdentifier(current.openingElement.tagName) && current.openingElement.tagName.text === name) {
      elements.push(current);
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return elements;
}

function isFieldContainer(element: ts.JsxElement) {
  return element.openingElement.attributes.properties.some((attribute) =>
    ts.isJsxAttribute(attribute)
    && attribute.name.getText(source) === 'style'
    && attribute.initializer
    && ts.isJsxExpression(attribute.initializer)
    && attribute.initializer.expression?.getText(source).includes('styles.field'));
}

describe('SheetFieldButton control structure', () => {
  it('keeps Clear beside the picker so clearing cannot bubble into opening the picker', () => {
    const component = source.statements.find((statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'SheetFieldButton');
    if (!component) throw new Error('SheetFieldButton was not found');

    const field = jsxElements(component, 'View').find(isFieldContainer);
    if (!field) throw new Error('SheetFieldButton field container was not found');

    const pressables = jsxElements(field, 'Pressable');
    expect(pressables).toHaveLength(2);
    const picker = pressables.find((pressable) => pressable.getText(source).includes('Opens the'));
    if (!picker) throw new Error('SheetFieldButton picker action was not found');
    expect(jsxElements(picker, 'Pressable').filter((pressable) => pressable !== picker)).toHaveLength(0);
  });
});
