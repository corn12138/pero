import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);

test('App and shared SDK use the same App-owned React runtime despite ancestor dependencies', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'pero-app-runtime-'));
  const root = join(temp, 'checkout');
  const app = join(root, 'apps/fixture');
  async function file(path, content) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  async function runtime(directory, owner) {
    // Package identities isolate resolution behavior from any React version.
    for (const name of ['react', 'react-dom']) {
      await file(join(directory, name, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', main: 'index.js' }));
      for (const entry of ['index', 'jsx-runtime', 'client']) {
        await file(join(directory, name, `${entry}.js`), `export const identity = {}; export const owner = ${JSON.stringify(owner)};`);
      }
    }
  }
  try {
    await file(join(app, 'app.json'), JSON.stringify({ displayName: 'Runtime fixture' }));
    await file(join(app, 'ui-src/frame.tsx'), `
      import * as react from 'react';
      import * as jsx from 'react/jsx-runtime';
      import * as dom from 'react-dom/client';
      import { sharedReact, sharedJsx, sharedDom } from '@pero/app-sdk';
      globalThis.fixtureResult = {
        react: react.identity === sharedReact.identity,
        jsx: jsx.identity === sharedJsx.identity,
        dom: dom.identity === sharedDom.identity,
        owners: [react.owner, sharedReact.owner, sharedJsx.owner, sharedDom.owner],
      };
    `);
    await file(join(root, 'packages/app-sdk/src/index.tsx'), `
      export * as sharedReact from 'react';
      export * as sharedJsx from 'react/jsx-runtime';
      export * as sharedDom from 'react-dom/client';
    `);
    await mkdir(join(root, 'scripts/build'), { recursive: true });
    await cp(new URL('./apps.mjs', import.meta.url), join(root, 'scripts/build/apps.mjs'));
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await symlink(dirname(require.resolve('esbuild/package.json')), join(root, 'node_modules/esbuild'), 'junction');
    await runtime(join(app, 'node_modules'), 'app');
    for (const ancestor of [false, true]) {
      if (ancestor) await runtime(join(temp, 'node_modules'), 'ancestor');
      const built = spawnSync(process.execPath, ['scripts/build/apps.mjs', '--app', 'fixture'], { cwd: root, encoding: 'utf8', timeout: 30000 });
      assert.equal(built.status, 0, built.stderr || built.error?.message);
      const context = {};
      runInNewContext(await readFile(join(app, 'dist/index.js'), 'utf8'), context);
      assert.deepEqual(JSON.parse(JSON.stringify(context.fixtureResult)), {
        react: true, jsx: true, dom: true, owners: ['app', 'app', 'app', 'app'],
      }, `ancestor runtime present: ${ancestor}`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
