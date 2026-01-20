// Контроллер paged export: держит state сессии и отправляет прогресс в UI.
import type { DSComponent, DSExport } from './engine';
import {
  collectComponentsFromPageChunked,
  extractComponentsFromCurrentPage,
  extractComponentsFromDocument,
} from './engine';
import { logDebug } from './debug';
import { sanitizeExportPayload } from './exportSanitizer';

type ExportSession = {
  id: number;
  totalPages: number;
  pendingPages: PageNode[];
  processedPages: number;
  components: DSComponent[];
  errors: string[];
  autoContinue: boolean;
  scope: 'current-page' | 'document';
};

type ExportScope = 'current-page' | 'document';

type ExportResultSender = (scope: string, data: DSExport) => void;

export type PagedExportController = {
  startFromCurrentPage: () => void;
  startFromDocument: () => void;
  continue: () => void;
  cancel: () => void;
};

export function createPagedExportController(
  sendExportResult: ExportResultSender,
): PagedExportController {
  // Внутренний state сессии хранится в замыкании, наружу отдаем только методы.
  let pagedSession: ExportSession | null = null;
  let sessionCounter = 0;
  let exportCancelToken: { aborted: boolean } | null = null;

  function startFromCurrentPage() {
    const pages = getPagesStartingFromCurrentPage();
    if (pages.length === 0) {
      const data = extractComponentsFromCurrentPage();
      sendExportResult('CURRENT PAGE', data);
      return;
    }

    startPagedExport(pages, false, 'current-page');
  }

  function startFromDocument() {
    const pages = getAllPages();
    if (pages.length === 0) {
      const data = extractComponentsFromDocument();
      sendExportResult('ALL', data);
      return;
    }

    startPagedExport(pages, true, 'document');
  }

  function startPagedExport(
    pages: PageNode[],
    autoContinue: boolean,
    scope: ExportScope,
  ) {
    sessionCounter += 1;
    pagedSession = {
      id: sessionCounter,
      totalPages: pages.length,
      pendingPages: [...pages],
      processedPages: 0,
      components: [],
      errors: [],
      autoContinue,
      scope,
    };
    exportCancelToken = { aborted: false };

    logDebug('paged-export-start', {
      sessionId: sessionCounter,
      totalPages: pages.length,
      autoContinue,
      scope,
    });

    void processNextPage();
  }

  function getPagesStartingFromCurrentPage(): PageNode[] {
    const pages: PageNode[] = [];
    for (const child of figma.root.children) {
      if (child.type === 'PAGE') {
        pages.push(child as PageNode);
      }
    }
    if (pages.length === 0) return [];
    const current = figma.currentPage;
    const index = pages.findIndex((page) => page.id === current.id);
    if (index <= 0) return pages;
    return pages.slice(index).concat(pages.slice(0, index));
  }

  function getAllPages(): PageNode[] {
    const pages: PageNode[] = [];
    for (const child of figma.root.children) {
      if (child.type === 'PAGE') {
        pages.push(child as PageNode);
      }
    }
    return pages;
  }

  function cancel() {
    if (exportCancelToken) {
      exportCancelToken.aborted = true;
      exportCancelToken = null;
    }
    pagedSession = null;
    figma.ui.postMessage({ type: 'export-cancelled' });
  }

  function continueExport() {
    if (!pagedSession) return;
    void processNextPage();
  }

  async function processNextPage() {
    if (!pagedSession) return;
    const session = pagedSession;
    if (session.pendingPages.length === 0) {
      finalizePagedExport();
      return;
    }

    const page = session.pendingPages.shift()!;
    console.log(
      '[CODE] processing page',
      page.name,
      'processed',
      session.processedPages,
    );
    logDebug('paged-page-start', {
      page: page.name,
      remaining: session.pendingPages.length,
      processed: session.processedPages,
    });
    const { components, errors, pageHasComponents, aborted } =
      await collectComponentsFromPageChunked(
        page,
        exportCancelToken,
        (processedNodes) => {
          figma.ui.postMessage({
            type: 'export-progress',
            payload: {
              sessionId: session.id,
              pageName: normalizePageName(page.name),
              processedNodes,
              completedPages: session.processedPages,
              totalPages: session.totalPages,
            },
          });
        },
      );
    if (aborted) {
      console.log('[CODE] paged export aborted');
      finalizePagedExport();
      return;
    }
    logDebug('paged-page-result', {
      page: page.name,
      components: components.length,
      errors: errors.length,
    });
    session.components.push(...components);
    session.errors.push(...errors);

    session.processedPages += 1;

    const normalizedPageName = normalizePageName(page.name);
    const pageExport = buildPageExport(page, components, pageHasComponents);
    const hasMore = session.pendingPages.length > 0;
    sendPagedProgress(pageExport, hasMore, normalizedPageName);

    if (!hasMore) {
      finalizePagedExport();
      return;
    }

    if (session.autoContinue) {
      setTimeout(() => {
        void processNextPage();
      }, 0);
    }
  }

  function buildPageExport(
    page: PageNode,
    components: DSComponent[],
    pageHasComponents: boolean,
  ): DSExport {
    const normalizedPageName = normalizePageName(page.name);
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        version: '0.1.0',
        files: pageHasComponents ? [normalizedPageName] : [],
        scope: 'current-page',
        fileName: figma.root.name,
        library: figma.root.name,
      },
      components,
      tokens: [],
      typography: [],
      spacing: [],
      radius: [],
    };
  }

  function sendPagedProgress(
    pageExport: DSExport,
    hasMore: boolean,
    currentPage: string,
  ) {
    if (!pagedSession) return;
    const session = pagedSession;
    const sanitized = sanitizeExportPayload(pageExport);
    const json = JSON.stringify(sanitized, null, 2);
    figma.ui.postMessage({
      type: 'export-result',
      payload: {
        json,
        data: sanitized,
        mode: 'paged',
        pageName: normalizePageName(currentPage),
        progress: {
          completed: session.processedPages,
          total: session.totalPages,
          hasMore,
          autoContinue: session.autoContinue,
          currentPage,
        },
      },
    });
  }

  function finalizePagedExport() {
    if (!pagedSession) return;
    notifyPagedErrors(pagedSession.errors);
    logDebug('paged-export-finished', {
      processedPages: pagedSession.processedPages,
      errors: pagedSession.errors.length,
    });
    pagedSession = null;
  }

  function notifyPagedErrors(errors: string[]) {
    if (errors.length === 0) return;
    console.warn('[Athena] component parsing errors:', errors);
    figma.notify(
      `Некоторые компоненты не выгружены (${errors.length}). См. консоль.`,
      { timeout: 5000 },
    );
  }

  function normalizePageName(name: string): string {
    if (!name) return '';
    return name.replace(/^[^A-Za-z0-9А-Яа-яЁё]+/, '').trim();
  }

  return {
    startFromCurrentPage,
    startFromDocument,
    continue: continueExport,
    cancel,
  };
}
