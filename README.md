# Athena

Figma-плагин для сбора и публикации JSON-артефактов дизайн-системы: компонентных каталогов, токенов и стилей.

## Что умеет

- Экспортировать компоненты с текущей страницы постранично, сохраняя отдельный JSON на каждую страницу.
- Показывать таблицу компонентов и нормализованный catalog JSON для текущей собранной страницы.
- Экспортировать Variables API в JSON.
- Экспортировать локальные стили в JSON.
- Работать с reference-файлом нового формата `libraries[].catalogs[]`.
- Публиковать компоненты, токены и стили напрямую в GitHub-репозиторий `ackedze/design-system_ab`.
- Отдавать runner-friendly publish context через DOM marker для automation-runner.

## Ключевые файлы

- `src/code.ts`: основной контроллер плагина, маршрутизация UI-сообщений, экспорт токенов/стилей и публикация в GitHub.
- `src/pagedExport.ts`: постраничный экспорт компонентов, прогресс и ручное/автоматическое продолжение.
- `src/tokenExport.ts`: чтение коллекций переменных и сериализация значений по mode.
- `src/styleExport.ts`: чтение локальных стилей и сериализация значений.
- `src/exportSanitizer.ts`: очистка export payload перед отправкой в UI.
- `src/engine/`: разбор `COMPONENT_SET`/`COMPONENT`, структура узлов, variant diff-ы и классификация.
- `src/ui.html`: весь UI плагина, включая вкладки, таблицы, скачивание и публикацию.
- `build.js`: сборка в `dist/`.
- `manifest.json`: манифест Figma-плагина.

## Поток работы

```text
UI (src/ui.html) -> code.ts
code.ts -> pagedExport.ts | tokenExport.ts | styleExport.ts
pagedExport.ts -> engine/*
code.ts -> UI
```

### Компоненты

1. UI запускает `export-components-current-page`.
2. `code.ts` вызывает `pagedExport.startFromCurrentPage()`.
3. `pagedExport.ts` обходит страницы чанками через `collectComponentsFromPageChunked`.
4. После каждой страницы UI получает отдельный `export-result` с `mode: 'paged'`.
5. Имя публикуемого/скачиваемого файла совпадает с именем текущего page-каталога.

### Токены

1. UI отправляет `collect-tokens`.
2. `code.ts` вызывает `collectTokensFromFile()`.
3. UI получает `collect-tokens-result`, может скачать или опубликовать JSON.

### Стили

1. UI отправляет `collect-styles`.
2. `code.ts` вызывает `collectStylesFromDocument()`.
3. UI получает `collect-styles-result`, может скачать или опубликовать JSON.

### Публикация

1. UI определяет активную вкладку: `components`, `tokens` или `styles`.
2. UI формирует payload с тем же именем файла, которое используется для скачивания.
3. Для `components` имя файла совпадает с именем текущей страницы Figma.
4. Для `tokens` и `styles` имя файла строится от имени библиотеки, чтобы совпадать с reference entry вроде `tokens/Spacing.json` или `styles/009 _ Shadow BlueTint Light.json`.
5. UI синхронизирует publish context в DOM через marker `#runner-publish-meta` и видимое имя файла `#catalog-file-name`.
6. Runner читает эти значения из iframe Athena и использует их как source of truth для автоматической публикации.
7. UI показывает диалог ввода GitHub token только если токен ещё не сохранён в памяти текущей сессии.
8. `code.ts` публикует JSON через GitHub Contents API в `catalogs/{fileName}.json`.
9. Publish transport использует UTF-8-safe base64-кодирование, поэтому кириллица и другие non-ASCII строки не должны повреждаться при записи в GitHub.

## Использование

1. Импортируйте `manifest.json` в Figma как development plugin.
2. Запустите Athena.
3. На вкладке `Components` нажмите `Собрать компоненты`, затем при необходимости `Следующая страница`.
4. На вкладках `Tokens` и `Styles` используйте соответствующие кнопки сбора.
5. Для скачивания используйте локальные кнопки `Скачать JSON`.
6. Для публикации используйте общую кнопку `Опубликовать` справа сверху.
7. Если Athena запускается из `figma-automation-runner`, runner сам переключает вкладки, инициирует сбор и использует DOM marker плагина для сопоставления с reference entry.

## Интеграция с runner

Athena подготовлена для автоматического сценария runner:

- вкладки размечены как `data-tab="components" | "tokens" | "styles"`
- сбор запускается кнопками `#export-page-btn`, `#collect-tokens-btn`, `#collect-styles-btn`
- текущий публикуемый файл виден в `#catalog-file-name`
- publish context синхронизируется в `#runner-publish-meta`
- после каждого сбора runner может проверить готовность publish без обращения к внутреннему JS-состоянию плагина

Это позволяет automation-runner:

- отличать `components`, `tokens` и `styles`
- матчить publish с `referenceSourcesMVP.json` нового формата
- публиковать только те каталоги, которые реально указаны в reference для текущей библиотеки

## Сборка

```sh
npm install
npm run build
# или
npm run watch
```

Сборка пишет артефакты в `dist/`, на которые ссылается `manifest.json`.

## Заметки

- Для component export плагин работает в `documentAccess: dynamic-page`, поэтому страницы грузятся асинхронно перед чтением узлов.
- Alias-резолвинг токенов может обращаться к удалённой библиотеке токенов.
- Подробное логирование включается через `src/debug.ts`.
