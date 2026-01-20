/// <reference types="@figma/plugin-typings" />

// Главный entrypoint плагина: принимает сообщения UI и запускает экспорт/сбор данных.
import type { DSExport } from './engine';
import { logDebug } from './debug';
import { createPagedExportController } from './pagedExport';
import { collectTokensFromFile } from './tokenExport';
import { collectStylesFromDocument } from './styleExport';
import { sanitizeExportPayload } from './exportSanitizer';

console.log('[CODE] plugin loaded');
logDebug('plugin-loaded');

figma.showUI(__html__, { width: 1280, height: 720 });
console.log('[CODE] UI shown');
logDebug('ui-shown', { width: 1280, height: 720 });

const pagedExport = createPagedExportController(sendExportResult);

// Роутим UI events на export/collect actions.
figma.ui.onmessage = (msg) => {
  console.log('[CODE] received message from UI:', msg);
  logDebug('ui-message', msg);

  if (msg.type === 'test') {
    console.log('[CODE] test message received, sending echo');
    figma.ui.postMessage({
      type: 'echo',
      payload: { received: msg },
    });
    return;
  }

  if (msg.type === 'export-components') {
    console.log('[CODE] starting paged export for document');
    logDebug('export-components-request');
    pagedExport.cancel();
    pagedExport.startFromDocument();
    return;
  }

  if (msg.type === 'export-components-current-page') {
    console.log('[CODE] starting paged export from current page');
    logDebug('export-current-page-request');
    pagedExport.cancel();
    pagedExport.startFromCurrentPage();
    return;
  }

  if (msg.type === 'export-components-continue') {
    console.log('[CODE] continuing paged export');
    logDebug('export-components-continue-request');
    pagedExport.continue();
    return;
  }

  if (msg.type === 'cancel-export') {
    console.log('[CODE] cancel paged export');
    pagedExport.cancel();
    return;
  }

  if (msg.type === 'collect-tokens') {
    console.log('[CODE] collecting tokens');
    logDebug('collect-tokens-request');
    collectTokensAndSend();
    return;
  }
  if (msg.type === 'collect-styles') {
    console.log('[CODE] collecting styles');
    logDebug('collect-styles-request');
    collectStylesAndSend();
    return;
  }
};

function sendExportResult(scope: string, data: DSExport) {
  const sanitized = sanitizeExportPayload(data);
  const json = JSON.stringify(sanitized, null, 2);
  console.log(`[CODE] sending export-result (${scope}). length =`, json.length);
  logDebug('send-export', {
    scope,
    components: data.components.length,
    meta: data.meta,
  });
  figma.ui.postMessage({
    type: 'export-result',
    payload: { json, data: sanitized, mode: 'full' },
  });
}

async function collectTokensAndSend() {
  try {
    const payload = await collectTokensFromFile();
    const json = JSON.stringify(payload, null, 2);
    logDebug('collect-tokens-result', {
      collections: payload.collections.length,
    });
    figma.ui.postMessage({
      type: 'collect-tokens-result',
      payload: { json, data: payload },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Неизвестная ошибка';
    console.error('[CODE] failed to collect tokens', error);
    logDebug('collect-tokens-error', { error: message });
    figma.notify(`Не удалось собрать токены: ${message}`, { timeout: 5000 });
  }
}

function collectStylesAndSend() {
  try {
    const payload = collectStylesFromDocument();
    const json = JSON.stringify(payload, null, 2);
    logDebug('collect-styles-result', {
      styles: payload.styles.length,
    });
    figma.ui.postMessage({
      type: 'collect-styles-result',
      payload: { json, data: payload },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Неизвестная ошибка';
    console.error('[CODE] failed to collect styles', error);
    logDebug('collect-styles-error', { error: message });
    figma.notify(`Не удалось собрать стили: ${message}`, { timeout: 5000 });
  }
}
