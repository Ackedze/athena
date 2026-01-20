# Athena

Figma plugin для экспорта design system components, variables и styles в JSON.

## Что делает
- Экспортирует components из current page или всего document (paged, чтобы держать UI responsive).
- Собирает component structure, variant diffs и token/style references.
- Экспортирует Variables API collections и local styles.
- Строит normalized catalog JSON в UI для downstream tooling.

## Структура проекта
- `src/code.ts`: plugin controller, export orchestration, сбор tokens/styles.
- `src/engine/`: component parsing, structure snapshots, helpers для token extraction.
- `src/ui.html`: UI markup и inlined logic для tabs, tables и downloads.
- `src/ui.ts`: UI helper logic (optional entry point, если wired в UI build).
- `build.js`: esbuild bundling в `dist/`.
- `manifest.json`: Figma plugin manifest, который указывает на `dist/code.js` и `dist/ui.html`.

## Сборка
```sh
npm install
npm run build
# or
npm run watch
```

Вывод идет в `dist/`, а `manifest.json` на него ссылается.

## Использование в Figma
1. Импортируйте plugin из этой папки в Figma.
2. Запустите Athena.
3. Используйте tab Components для export current page; используйте Continue для paged export.
4. Используйте tabs Tokens и Styles, чтобы collect и download JSON.

## Модель данных (high level)
- `DSExport` содержит `meta`, `components` и token/style arrays.
- Components включают structure nodes, per-variant patches и classification metadata.
- Classification logic находится в `src/lib/componentMetaClassifier.ts`.
- Token export использует Variables API и добавляет `hexByMode` для color values.

## Заметки
- Alias resolution может fetch remote token library; см. `src/code.ts`.
- Установите `DEBUG_MODE` в `src/debug.ts`, чтобы включить verbose logging.
