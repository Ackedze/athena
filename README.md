# Athena

Figma plugin для экспорта design system components, variables и styles в JSON.

## Что делает
- Экспортирует components из current page или всего document (paged, чтобы держать UI responsive).
- Собирает component structure, variant diffs и token/style references.
- Экспортирует Variables API collections и local styles.
- Строит normalized catalog JSON в UI для downstream tooling.

## Структура проекта
- `src/code.ts`: plugin controller, export orchestration, сбор tokens/styles.
- `src/pagedExport.ts`: paged export для components и прогресса.
- `src/tokenExport.ts`: export Variables API collections и resolve aliases.
- `src/styleExport.ts`: export local styles.
- `src/exportSanitizer.ts`: sanitize payload перед отправкой в UI.
- `src/nameUtils.ts`: разбор имен tokens/styles.
- `src/engine/`: component parsing, structure snapshots, helpers для token extraction.
- `src/ui.html`: UI markup и inlined logic для tabs, tables и downloads.
- `src/ui.ts`: UI helper logic (optional entry point, если wired в UI build).
- `build.js`: esbuild bundling в `dist/`.
- `manifest.json`: Figma plugin manifest, который указывает на `dist/code.js` и `dist/ui.html`.

## Схема работы функций

### Общий поток сообщений
```
UI (src/ui.html) --postMessage--> code.ts
code.ts --dispatch--> pagedExport.ts | tokenExport.ts | styleExport.ts
engine (src/engine) <-- pagedExport.ts
exportSanitizer.ts --clean payload--> code.ts
code.ts --postMessage--> UI (src/ui.html)
```

### Экспорт компонентов (paged)
1. UI отправляет `export-components` или `export-components-current-page`.
2. `code.ts` вызывает `pagedExport.startFromDocument()` или `pagedExport.startFromCurrentPage()`.
3. `pagedExport.ts` создает session и вызывает `collectComponentsFromPageChunked` из `src/engine`.
4. `collectComponentsFromPageChunked` обходит узлы пачками и отдает прогресс.
5. `pagedExport.ts` отправляет `export-progress` и `export-result` по мере обработки страниц.
6. `exportSanitizer.ts` обрезает payload перед отправкой в UI.

### Экспорт компонентов (без пагинации)
1. Для пустого списка страниц `pagedExport.ts` вызывает `extractComponentsFromDocument()` или
   `extractComponentsFromCurrentPage()` из `src/engine`.
2. `code.ts` отправляет результат через `sendExportResult`.

### Экспорт токенов
1. UI отправляет `collect-tokens`.
2. `code.ts` вызывает `collectTokensFromFile()` из `src/tokenExport.ts`.
3. `tokenExport.ts` читает Variables API, строит `valuesByMode` и `hexByMode`.
4. При необходимости происходит resolve alias через удаленную token library.
5. `code.ts` отправляет результат в UI.

### Экспорт стилей
1. UI отправляет `collect-styles`.
2. `code.ts` вызывает `collectStylesFromDocument()` из `src/styleExport.ts`.
3. `styleExport.ts` собирает local styles, нормализует имена через `splitVariableName`.
4. `code.ts` отправляет результат в UI.

### Нормализация и классификация компонентов (engine)
1. `componentParser.ts` ищет `COMPONENT_SET` и `COMPONENT`.
2. `describeComponentSet.ts` снимает base structure и строит per-variant patches.
3. `snapshotNode.ts` вытаскивает layout, paints, typography, effects, tokens.
4. `componentMetaClassifier.ts` определяет role/status/platform по правилам нейминга.

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
