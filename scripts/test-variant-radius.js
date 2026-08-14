const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadRadiusPipeline() {
  const outfile = path.join(
    os.tmpdir(),
    `athena-variant-radius-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    stdin: {
      contents: [
        "export { buildVariantOverrides } from './src/engine/component/describeComponentSet.ts';",
        "export { sanitizeExportPayload } from './src/exportSanitizer.ts';",
      ].join('\n'),
      resolveDir: path.resolve(__dirname, '..'),
      sourcefile: 'variant-radius-test-entry.ts',
      loader: 'ts',
    },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node18'],
    logLevel: 'silent',
  });

  try {
    return require(outfile);
  } finally {
    fs.rmSync(outfile, { force: true });
  }
}

const { buildVariantOverrides, sanitizeExportPayload } = loadRadiusPipeline();
const base = [{
  id: 1,
  parentId: null,
  path: 'View=Secondary',
  type: 'COMPONENT',
  name: 'View=Secondary',
  visible: true,
  radius: 12,
}];
const textVariant = [{
  id: 1,
  parentId: null,
  path: 'View=Text',
  type: 'COMPONENT',
  name: 'View=Text',
  visible: true,
  radius: 0,
}];
const patches = buildVariantOverrides(base, textVariant);
const rootPatch = patches.find((patch) => patch.op === 'update' && patch.id === 1);

assert.ok(rootPatch, 'A changed variant root must produce an update patch.');
assert.equal(
  rootPatch.value.radius,
  0,
  'Athena must preserve an explicit 12 → 0 radius change in variantStructures.',
);

const sanitized = sanitizeExportPayload({
  meta: {
    generatedAt: '2026-08-14T00:00:00.000Z',
    version: 'test',
    files: ['Button'],
    scope: 'current-page',
    fileName: 'Web _ Core',
    library: 'Web _ Core',
  },
  components: [{
    key: 'button-key',
    name: '[D] Button',
    page: 'Button',
    category: 'Button',
    description: '',
    variants: [],
    defaultVariant: 'secondary-key',
    structure: base,
    variantStructures: { 'text-key': patches },
    role: 'main',
    status: 'active',
    platform: 'desktop',
  }],
  tokens: [],
  typography: [],
  spacing: [],
  radius: [],
});

assert.equal(
  sanitized.components[0].variantStructures['text-key'][0].value.radius,
  0,
  'Export sanitization must not remove a zero radius from a variant patch.',
);

console.log('Athena variant radius regression checks passed');
