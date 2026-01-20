import type { DSComponent, DSExport } from './engine';

type ExportResultPayload = {
  json: string;
  data: DSExport;
};

console.log('[UI] script loaded');

const exportBtn = document.getElementById(
  'export-btn',
) as HTMLButtonElement | null;
const exportPageBtn = document.getElementById(
  'export-page-btn',
) as HTMLButtonElement | null;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement | null;
const output = document.getElementById('output') as HTMLTextAreaElement | null;
const summaryMeta = document.getElementById(
  'summary-meta',
) as HTMLDivElement | null;
const platformSummary = document.getElementById(
  'platform-summary',
) as HTMLParagraphElement | null;
const statusSummary = document.getElementById(
  'status-summary',
) as HTMLParagraphElement | null;
const roleSummary = document.getElementById(
  'role-summary',
) as HTMLParagraphElement | null;
const componentTableBody = document.getElementById(
  'component-table-body',
) as HTMLTableSectionElement | null;

console.log('[UI] elements:', {
  exportBtn,
  exportPageBtn,
  copyBtn,
  output,
  summaryMeta,
  platformSummary,
  statusSummary,
  roleSummary,
  componentTableBody,
});

bindButton(exportBtn, () => {
  console.log('[UI] export ALL button clicked → sending export-components');
  parent.postMessage({ pluginMessage: { type: 'export-components' } }, '*');
});

bindButton(exportPageBtn, () => {
  console.log(
    '[UI] export CURRENT PAGE button clicked → sending export-components-current-page',
  );
  parent.postMessage(
    { pluginMessage: { type: 'export-components-current-page' } },
    '*',
  );
});

bindButton(copyBtn, () => {
  console.log('[UI] copy button clicked');
  if (!output) return;

  copyToClipboard(output.value)
    .then(() => console.log('[UI] copied to clipboard'))
    .catch((err) => console.error('[UI] failed to copy', err));
});

window.onmessage = (event: MessageEvent) => {
  console.log('[UI] window.onmessage triggered:', event.data);

  const msg = (event.data as { pluginMessage?: any }).pluginMessage;
  if (!msg) return;

  if (msg.type === 'echo') {
    console.log('[UI] echo from code.ts:', msg);
  }

  if (msg.type === 'export-result') {
    const payload = msg.payload as ExportResultPayload | undefined;
    if (!payload) return;
    renderExportResult(payload);
  }
};

function bindButton(button: HTMLButtonElement | null, handler: () => void) {
  if (!button) return;
  button.onclick = handler;
}

function renderExportResult(payload: ExportResultPayload) {
  if (output) {
    output.value = payload.json;
    console.log('[UI] textarea updated, length =', payload.json.length);
  }

  renderSummary(payload.data);
  renderComponents(payload.data.components);
}

function renderSummary(data: DSExport) {
  if (summaryMeta) {
    summaryMeta.textContent = [
      `Компоненты: ${data.components.length}`,
      `Страницы: ${data.meta.files.length || 0}`,
      `Сгенерировано: ${new Date(data.meta.generatedAt).toLocaleString()}`,
    ].join(' • ');
  }

  updateCounts(platformSummary, buildCountMap(data.components, 'platform'));
  updateCounts(statusSummary, buildCountMap(data.components, 'status'));
  updateCounts(roleSummary, buildCountMap(data.components, 'role'));
}

function renderComponents(components: DSComponent[]) {
  if (!componentTableBody) return;

  if (components.length === 0) {
    componentTableBody.innerHTML =
      '<tr><td colspan="5">Нет компонентов</td></tr>';
    return;
  }

  const rows = components.slice(0, 8).map((component) => {
    const parentName =
      component.parentComponent?.name?.trim() || '—';
    return `<tr>
      <td>${component.name}</td>
      <td>${component.platform}</td>
      <td>${component.role}</td>
      <td>${component.status}</td>
      <td>${parentName}</td>
    </tr>`;
  });

  componentTableBody.innerHTML = rows.join('');
}

function buildCountMap(
  components: DSComponent[],
  key: 'platform' | 'status' | 'role',
): Record<string, number> {
  return components.reduce<Record<string, number>>((acc, component) => {
    const value = component[key];
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function updateCounts(
  element: HTMLElement | null,
  counts: Record<string, number>,
) {
  if (!element) return;
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    element.textContent = '—';
    return;
  }

  element.textContent = entries
    .map(([name, count]) => `${name}: ${count}`)
    .join(' • ');
}

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise<void>((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand('copy');
      resolve();
    } catch (error) {
      reject(error);
    } finally {
      document.body.removeChild(textarea);
    }
  });
}
