# Athena

Figma-плагин для сбора и публикации JSON-артефактов дизайн-системы: компонентных каталогов, токенов и стилей.

## Что умеет

- Экспортировать компоненты с текущей страницы постранично, сохраняя отдельный JSON на каждую страницу.
- Сохранять в component snapshot фактические и min/max размеры узлов, а для вложенных instances надёжно резолвить опубликованный `componentKey` через async Figma API.
- Показывать таблицу компонентов и нормализованный catalog JSON для текущей собранной страницы.
- Экспортировать Variables API в JSON вместе с исходными alias и фактическими значениями токенов.
- Экспортировать локальные стили в JSON.
- Работать с reference-файлом нового формата `libraries[].catalogs[]`.
- Публиковать компоненты, токены и стили напрямую в GitHub-репозиторий `ackedze/design-system_ab`.
- Автоматически регистрировать новые page-каталоги в `JSONS/referenceSourcesMVP.json`, если для них ещё нет reference entry.
- Для web-corp каталогов создавать отсутствующий базовый `rules.json` и синхронизировать его запись в `apollo-rules-registry.json`, не перезаписывая существующие ручные правила.
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

Token catalog сохраняет исходный граф в `valuesByMode` и дополнительно публикует:

- `actualValuesByMode` — все достижимые concrete-значения для каждого source mode;
- `actualHexByMode` — нормализованные HEX-представления COLOR-значений;
- `resolutionByMode` — статус `resolved | partial | unresolved`, пройденные alias и неразрешённые ссылки.

Alias разрешаются рекурсивно через Variables API без списка специальных библиотек. Если цепочка пересекает коллекцию с независимыми modes и без consumer-node нельзя выбрать единственный результат, Athena сохраняет все допустимые concrete-значения. Это позволяет Apollo искать кандидатов на привязку по фактическому цвету без отдельного публикуемого token index.

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
8. `code.ts` ищет matching entry в `JSONS/referenceSourcesMVP.json`.
9. Если matching entry нет, Athena добавляет новый catalog entry в соответствующую библиотеку, подбирая путь по уже существующей структуре этой библиотеки; для новой библиотеки создаётся новая запись.
10. `code.ts` публикует JSON через GitHub Contents API по resolved reference path.
11. Для `components` вместе с каталогом публикуется связанный `component-index` в `JSONS/indexes/`. Если в одном page-каталоге есть ровно одна Desktop- и одна MobileWeb-версия одной component family с одинаковыми role/status, index получает двусторонний `channelCounterparts`. Каждый instance variant связывается только с единственным variant противоположного канала с точно совпадающими properties; неоднозначные совпадения пропускаются.
12. Для каталогов `JSONS/web/components/web-corp/` Athena определяет package name. Если `rules.json` ещё отсутствует, она публикует базовый generated-draft; существующий `rules.json` не изменяется.
13. После этого Athena обновляет только запись опубликованного пакета в `JSONS/web/components/web-corp/apollo-rules-registry.json`. Registry получает текущие rules, aliases из свежего каталога и путь к source-файлу правил. При конфликте параллельных публикаций запись повторяется до трёх раз.
14. `referenceSourcesMVP.json` обновляется после успешной публикации JSON, package-артефактов, index-файлов и rule registry, чтобы Apollo не получил ссылку на ещё несуществующий каталог.
15. Publish transport использует UTF-8-safe base64-кодирование, поэтому кириллица и другие non-ASCII строки не должны повреждаться при записи в GitHub.

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
- выполнять token- и style-публикации как отдельные атомарные jobs: один каталог, один branch, один `publish-result`, архивирование и переход дальше
- обрабатывать component-страницы одним paged batch, так как reference manifest пока не содержит прямых Figma page links
- выполнять stale-reference reconciliation только после закрытия всех рабочих веток; сбой этого служебного этапа не отменяет успешный `publish-result` Athena
- закрывать plugin modal после `publish-result` через подтверждённый handoff runner; актуальный Figma close control может определяться по семантике или положению относительно plugin iframe

## Сборка

```sh
npm install
npm run build
# или
npm run watch
```

Сборка пишет артефакты в `dist/`, на которые ссылается `manifest.json`.

## Правило публикации

При публикации изменений Athena обновляйте этот README вместе с кодом, если меняется сбор, публикация, reference manifest, runner contract или поведение сбора компонентов/токенов/стилей. Если изменение влияет на общий workspace-процесс, дополнительно обновляйте root `README.md` и `WORKSPACE.md`.

## Заметки

- Для component export плагин работает в `documentAccess: dynamic-page`, поэтому страницы грузятся асинхронно перед чтением узлов.
- `channelCounterparts` строится только из подтверждённой пары текущего page-каталога. Athena не публикует исполняемую связь по одному похожему имени, если найдено несколько Desktop- или MobileWeb-кандидатов.
- Alias-резолвинг токенов использует `getVariableByIdAsync` и при необходимости `importVariableByKeyAsync`; недоступные внешние aliases явно помечаются как unresolved и не превращаются в выдуманное значение.
- Подробное логирование включается через `src/debug.ts`.
