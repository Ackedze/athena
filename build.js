const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const isWatch = process.argv.includes('--watch');

async function buildOnce() {
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
