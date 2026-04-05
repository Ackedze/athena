# Athena

Figma-плагин для экспорта компонентов дизайн-системы, переменных и стилей в JSON.

## Что делает
- Экспортирует компоненты с текущей страницы или из всего документа с постраничной обработкой, чтобы UI оставался отзывчивым.
- Собирает структуру компонентов, variant diff-ы и ссылки на токены и стили.
- Экспортирует коллекции Variables API и локальные стили.
- Строит нормализованный JSON-каталог в UI для дальнейших инструментов.

## Структура проекта
- `src/code.ts`: контроллер плагина, оркестрация экспорта, сбор токенов и стилей.
- `src/pagedExport.ts`: постраничный экспорт компонентов и прогресса.
- `src/tokenExport.ts`: экспорт коллекций Variables API и разрешение alias-ссылок.
- `src/styleExport.ts`: экспорт локальных стилей.
- `src/exportSanitizer.ts`: очистка payload перед отправкой в UI.
- `src/nameUtils.ts`: разбор имён токенов и стилей.
- `src/engine/`: разбор компонентов, снимки структуры и вспомогательные функции для извлечения токенов.
- `src/ui.html`: разметка UI и встроенная логика вкладок, таблиц и скачивания.
- `src/ui.ts`: вспомогательная логика UI, если она подключена в сборку интерфейса.
- `build.js`: сборка через esbuild в `dist/`.
- `manifest.json`: манифест Figma-плагина, который указывает на `dist/code.js` и `dist/ui.html`.

## Схема работы функций

### Общий поток сообщений
```
UI (src/ui.html) --postMessage--> code.ts
code.ts --dispatch--> pagedExport.ts | tokenExport.ts | styleExport.ts
engine (src/engine) <-- pagedExport.ts
exportSanitizer.ts --clean payload--> code.ts
code.ts --postMessage--> UI (src/ui.html)
```

### Экспорт компонентов (постранично)
1. UI отправляет `export-components` или `export-components-current-page`.
2. `code.ts` вызывает `pagedExport.startFromDocument()` или `pagedExport.startFromCurrentPage()`.
3. `pagedExport.ts` создаёт сессию и вызывает `collectComponentsFromPageChunked` из `src/engine`.
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
4. При необходимости происходит разрешение alias-ссылок через удалённую библиотеку токенов.
5. `code.ts` отправляет результат в UI.

### Экспорт стилей
1. UI отправляет `collect-styles`.
2. `code.ts` вызывает `collectStylesFromDocument()` из `src/styleExport.ts`.
3. `styleExport.ts` собирает local styles, нормализует имена через `splitVariableName`.
4. `code.ts` отправляет результат в UI.

### Нормализация и классификация компонентов (`engine`)
1. `componentParser.ts` ищет `COMPONENT_SET` и `COMPONENT`.
2. `describeComponentSet.ts` снимает базовую структуру и строит патчи по вариантам.
3. `snapshotNode.ts` извлекает layout, paints, typography, effects и tokens.
4. `componentMetaClassifier.ts` определяет роль, статус и платформу по правилам нейминга.

## Сборка
```sh
npm install
npm run build
# или
npm run watch
```

Вывод идет в `dist/`, а `manifest.json` на него ссылается.

## Использование в Figma
1. Импортируйте плагин из этой папки в Figma.
2. Запустите Athena.
3. Используйте вкладку `Components` для экспорта текущей страницы; для постраничного экспорта используйте `Continue`.
4. Используйте вкладки `Tokens` и `Styles`, чтобы собрать и скачать JSON.

## Модель данных
- `DSExport` содержит `meta`, `components` и массивы токенов и стилей.
- `components` включают узлы структуры, патчи по вариантам и metadata классификации.
- Логика классификации находится в `src/lib/componentMetaClassifier.ts`.
- Экспорт токенов использует Variables API и добавляет `hexByMode` для цветовых значений.

## Заметки
- Разрешение alias-ссылок может обращаться к удалённой библиотеке токенов; см. `src/code.ts`.
- Установите `DEBUG_MODE` в `src/debug.ts`, чтобы включить подробное логирование.
