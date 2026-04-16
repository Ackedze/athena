const fs = require('fs');
const path = require('path');
const isWatch = process.argv.includes('--watch');

function loadEsbuild() {
  try {
    return require('esbuild');
  } catch (error) {
    const isEsbuildMissing =
      error &&
      error.code === 'MODULE_NOT_FOUND' &&
      typeof error.message === 'string' &&
      error.message.includes("'esbuild'");

    if (!isEsbuildMissing) {
      throw error;
    }

    const workspaceRoot = path.resolve(__dirname, '..');
    throw new Error(
      `[Athena] Missing "esbuild". Install shared dependencies once from ${workspaceRoot} with "npm install", or install them just for Athena in ${__dirname}.`,
    );
  }
}

const esbuild = loadEsbuild();

async function buildOnce() {
  // Bundle plugin code и UI в dist для Figma manifest.
  await esbuild.build({
    entryPoints: {
      code: 'src/code.ts',
      ui: 'src/ui.ts',
    },
    bundle: true,
    outdir: 'dist',
    format: 'iife',
    platform: 'browser',
    sourcemap: true,
    target: ['es2019'],
  });

  // Копируем ui.html в dist
  const srcHtml = path.join(__dirname, 'src', 'ui.html');
  const distHtml = path.join(__dirname, 'dist', 'ui.html');
  fs.copyFileSync(srcHtml, distHtml);

  console.log('✅ Build done');
}

if (isWatch) {
  (async () => {
    // Переиспользуем persistent build context для быстрых incremental rebuilds.
    const ctx = await esbuild.context({
      entryPoints: {
        code: 'src/code.ts',
        ui: 'src/ui.ts',
      },
      bundle: true,
      outdir: 'dist',
      format: 'iife',
      platform: 'browser',
      sourcemap: true,
      target: ['es2019'],
    });

    await ctx.watch();

    const srcHtml = path.join(__dirname, 'src', 'ui.html');
    const distHtml = path.join(__dirname, 'dist', 'ui.html');
    fs.copyFileSync(srcHtml, distHtml);

    console.log('👀 Watching & ui.html copied');
  })();
} else {
  buildOnce();
}
