import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource } from './rules.mjs';

test('backend services reject contracts and free helpers with useful diagnostics', () => {
  const errors = checkSource(
    'src/modules/dashboard/dashboard.service.ts',
    'type Row = { total: number }; function total() { return 1; } class DashboardService {}',
    'backend',
  );
  assert.equal(errors.length, 2);
  assert.ok(errors.every((error) => error.line > 0 && error.destination));
});
test('class methods and utilities are allowed', () => {
  assert.deepEqual(
    checkSource('src/modules/items/items.service.ts', 'class ItemsService { private map() { return 1; } }', 'backend'),
    [],
  );
  assert.deepEqual(
    checkSource('src/modules/items/utils/map.util.ts', 'export function map() { return 1; }', 'backend'),
    [],
  );
});
test('hooks reject exported contracts and standalone non-hook helpers', () => {
  assert.equal(
    checkSource(
      'app/modules/items/hooks/use-items.ts',
      'export interface Form {} function parse() {} export function useItems() {}',
      'frontend',
    ).length,
    2,
  );
});
test('type imports from hooks, including mixed imports, are rejected', () => {
  for (const source of [
    "import type { Form } from '../hooks/use-items';",
    "import { useItems, type Form } from '../hooks/use-items';",
  ]) {
    assert.equal(checkSource('app/modules/items/components/form.tsx', source, 'frontend').length, 1);
  }
  assert.deepEqual(
    checkSource(
      'app/modules/items/components/form.tsx',
      "import { useItems } from '../hooks/use-items'; import type { Form } from '../types/items.types';",
      'frontend',
    ),
    [],
  );
});
test('thin routes and metadata pass; route UI fails', () => {
  assert.deepEqual(
    checkSource(
      'app/[locale]/items/page.tsx',
      "import { ItemsPage } from '@/app/modules/items/pages/items-page'; interface PageProps {} export async function generateMetadata() { return { title: 'Items' }; } export default function Page() { return <ItemsPage />; }",
      'frontend',
    ),
    [],
  );
  assert.ok(
    checkSource(
      'app/[locale]/items/page.tsx',
      'export default function Page() { return <main><h1>Items</h1></main>; }',
      'frontend',
    ).length,
  );
  assert.ok(
    checkSource('app/[locale]/items/receipt.tsx', 'export function Receipt() { return <div />; }', 'frontend').length,
  );
});
test('HTTP services reject browser operations and PDF imports', () => {
  assert.ok(
    checkSource(
      'app/modules/invoices/services/invoices.service.ts',
      'export function pdf() { document.getElementById("sheet"); window.print(); }',
      'frontend',
    ).length,
  );
  assert.ok(
    checkSource(
      'app/modules/invoices/services/invoices.service.ts',
      'async function pdf() { const renderer = await import("html2pdf.js"); }',
      'frontend',
    ).length,
  );
  assert.deepEqual(
    checkSource(
      'app/modules/items/services/items.service.ts',
      'export function list() { return apiClient.get("/items"); }',
      'frontend',
    ),
    [],
  );
});
test('arrow helpers cannot bypass placement rules', () => {
  assert.ok(checkSource('src/modules/items/items.service.ts', 'const map = () => 1;', 'backend').length);
  assert.ok(
    checkSource('app/modules/items/hooks/use-items.ts', 'const parse = (raw: string) => Number(raw);', 'frontend')
      .length,
  );
});
test('type re-exports cannot hide hook contracts', () => {
  assert.ok(
    checkSource('app/modules/items/hooks/use-items.ts', "export type { Form } from '../types/form.types';", 'frontend')
      .length,
  );
  assert.ok(
    checkSource('app/modules/items/hooks/use-items.ts', 'interface Form {} export { Form };', 'frontend').length,
  );
});
test('global browser references and aliased React state are checked', () => {
  for (const source of ['globalThis.document.getElementById("sheet");', 'globalThis["window"].print();'])
    assert.ok(checkSource('app/modules/items/services/items.service.ts', source, 'frontend').length);
  assert.ok(
    checkSource(
      'app/[locale]/items/page.tsx',
      "import { useState as state } from 'react'; export default function Page() { const [value] = state(0); return <ItemsPage />; }",
      'frontend',
    ).length,
  );
  assert.ok(
    checkSource(
      'app/[locale]/items/page.tsx',
      'export default function Page() { React.useState(0); return <ItemsPage />; }',
      'frontend',
    ).length,
  );
});
test('sibling hook type imports are resolved before checking', () => {
  assert.ok(
    checkSource('app/modules/items/hooks/use-other.ts', "import type { Form } from './use-items';", 'frontend').length,
  );
});
test('server variables named document or window are not mistaken for browser globals', () => {
  assert.deepEqual(
    checkSource(
      'app/modules/items/services/items.service.ts',
      'function map(document: { id: string }) { return document.id; } function range() { const window = { from: 1 }; return window.from; }',
      'frontend',
    ),
    [],
  );
  assert.deepEqual(
    checkSource(
      'app/modules/items/services/items.service.ts',
      'interface Response { document: string; } const result = { window: 1 };',
      'frontend',
    ),
    [],
  );
});
