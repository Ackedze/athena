/// <reference types="@figma/plugin-typings" />

import {
  DSComponent,
  DSExport,
  DSMeta,
  DSStructureNode,
  DSVariantStructurePatch,
} from '../types';
import { describeComponentSet } from './describeComponentSet';
import { describeSingleComponent } from './describeSingleComponent';
import { resetStructureCache } from './collectStructure';
import { logDebug } from '../../debug';

export function extractComponentsFromDocument(): DSExport {
  const pages: PageNode[] = [];
  for (const child of figma.root.children) {
    if (child.type === 'PAGE') {
      pages.push(child as PageNode);
    }
  }

  const { components, pagesWithComponents, errors } =
    collectComponentsFromPages(pages);
  notifyOnErrors(errors);

  const meta: DSMeta = {
    generatedAt: new Date().toISOString(),
    version: '0.1.0',
    files: pagesWithComponents,
    scope: 'document',
    fileName: figma.root.name,
    library: figma.root.name,
  };

  return {
    meta,
    components,
    tokens: [],
    typography: [],
    spacing: [],
    radius: [],
  };
}

// 🔹 Новый экспорт — только по текущей странице
export function extractComponentsFromCurrentPage(): DSExport {
  const current = figma.currentPage; // всегда PageNode
  const { components, errors, pageHasComponents } =
    collectComponentsFromPage(current);
  notifyOnErrors(errors);

  const meta: DSMeta = {
    generatedAt: new Date().toISOString(),
    version: '0.1.0',
    files: pageHasComponents ? [normalizePageName(current.name)] : [],
    scope: 'current-page',
    fileName: figma.root.name,
    library: figma.root.name,
  };

  return {
    meta,
    components,
    tokens: [],
    typography: [],
    spacing: [],
    radius: [],
  };
}

function buildErrorMessage(
  pageName: string,
  nodeName: string,
  error: unknown,
): string {
  const reason =
    error instanceof Error ? error.message : 'unknown component error';
  return `[Athena] Ошибка при обработке компонента "${nodeName}" (страница "${pageName}"): ${reason}`;
}

function notifyOnErrors(errors: string[]) {
  if (errors.length === 0) return;
  const first = errors[0];
  console.warn('[Athena] component parsing errors:', errors);
  figma.notify(
    `Некоторые компоненты не выгружены (${errors.length}). См. консоль.`,
    { timeout: 5000 },
  );
}

export function collectComponentsFromPage(
  page: PageNode,
): {
  components: DSComponent[];
  errors: string[];
  pageHasComponents: boolean;
} {
  resetStructureCache();
  logDebug('collect-page-start', { page: page.name });
  const result = collectComponentsFromPageInternal(page);
  assignDepthMetrics(result.components);
  logDebug('collect-page-finish', {
    page: page.name,
    components: result.components.length,
    errors: result.errors.length,
  });
  return result;
}

function collectComponentsFromPages(pages: PageNode[]): {
  components: DSComponent[];
  pagesWithComponents: string[];
  errors: string[];
} {
  resetStructureCache();
  logDebug('collect-pages-start', {
    pageNames: pages.map((p) => p.name),
  });
  const components: DSComponent[] = [];
  const pagesWithComponents = new Set<string>();
  const errors: string[] = [];

  for (const page of pages) {
    const pageResult = collectComponentsFromPageInternal(page);
    components.push(...pageResult.components);
    errors.push(...pageResult.errors);
    if (pageResult.pageHasComponents) {
      pagesWithComponents.add(normalizePageName(page.name));
    }
  }

  logDebug('collect-pages-finish', {
    totalComponents: components.length,
    totalPagesWithComponents: pagesWithComponents.size,
  });

  assignDepthMetrics(components);

  return {
    components,
    pagesWithComponents: Array.from(pagesWithComponents),
    errors,
  };
}

export function assignDepthMetrics(components: DSComponent[]) {
  const componentsByKey = new Map<string, DSComponent>();
  for (const component of components) {
    if (component.key) {
      componentsByKey.set(component.key, component);
    }
    for (const variant of component.variants ?? []) {
      if (variant.key) {
        componentsByKey.set(variant.key, component);
      }
    }
  }

  for (const component of components) {
    const structures = buildStructureSets(component);
    for (const nodes of structures) {
      processDepthNodes(nodes, component, componentsByKey);
    }
  }
}

function buildStructureSets(host: DSComponent): DSStructureNode[][] {
  const structures: DSStructureNode[][] = [];
  if (host.structure && host.structure.length > 0) {
    structures.push(host.structure);
  }
  if (host.variantStructures) {
    for (const patches of Object.values(host.variantStructures)) {
      const variantNodes = buildStructureFromPatches(host.structure ?? [], patches);
      if (variantNodes.length > 0) {
        structures.push(variantNodes);
      }
    }
  }
  return structures;
}

function processDepthNodes(
  nodes: DSStructureNode[],
  host: DSComponent,
  componentsByKey: Map<string, DSComponent>,
) {
  if (!nodes.length) return;
  const childrenMap = new Map<number | null, DSStructureNode[]>();
  for (const node of nodes) {
    const parentId = node.parentId ?? null;
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)!.push(node);
  }

    const traverse = (node: DSStructureNode, depth: number) => {
      const childKey = node.componentInstance?.componentKey;
      if (childKey) {
        const target = componentsByKey.get(childKey);
        if (target && target.role === 'part') {
          target.depthInside ??= [];
          if (!target.depthInside.includes(depth)) {
            target.depthInside.push(depth);
          }
          if (typeof target.depthActual !== 'number') {
            target.depthActual = depth;
          } else {
            target.depthActual = Math.min(target.depthActual, depth);
          }
          if (host.role === 'main') {
            host.depthInside ??= [];
            if (!host.depthInside.includes(depth)) {
              host.depthInside.push(depth);
            }
            if (host.depth === undefined || depth > host.depth) {
              host.depth = depth;
            }
          }
        }
      }

    const children = childrenMap.get(node.id ?? null) ?? [];
    for (const child of children) {
      traverse(child, depth + 1);
    }
  };

  const rootNodes = childrenMap.get(null) ?? [];
  for (const root of rootNodes) {
    traverse(root, 0);
  }
}

function collectComponentsFromPageInternal(page: PageNode): {
  components: DSComponent[];
  errors: string[];
  pageHasComponents: boolean;
} {
  const components: DSComponent[] = [];
  const errors: string[] = [];
  let pageHasComponents = false;
  const stack: SceneNode[] = [...(page.children as SceneNode[])];

  while (stack.length > 0) {
    const node = stack.pop()!;

    if (node.type === 'COMPONENT_SET') {
      logDebug('component-set-detected', {
        page: page.name,
        name: node.name,
        id: node.id,
      });
      try {
        components.push(
          describeComponentSet(node, normalizePageName(page.name), figma.root.name),
        );
      } catch (error) {
        const message = buildErrorMessage(page.name, node.name, error);
        console.error(message, error);
        errors.push(message);
      }
      pageHasComponents = true;
      continue;
    }

    if (node.type === 'COMPONENT') {
      logDebug('component-detected', {
        page: page.name,
        name: node.name,
        id: node.id,
      });
      if (!node.parent || node.parent.type !== 'COMPONENT_SET') {
        try {
          components.push(
            describeSingleComponent(node, normalizePageName(page.name), figma.root.name),
          );
        } catch (error) {
          const message = buildErrorMessage(page.name, node.name, error);
          console.error(message, error);
          errors.push(message);
        }
        pageHasComponents = true;
      }
      continue;
    }

    if (node.type === 'INSTANCE') {
      logDebug('instance-skipped', {
        page: page.name,
        name: node.name,
        id: node.id,
      });
      continue;
    }

    if ('children' in node) {
      stack.push(...((node.children as SceneNode[]) ?? []));
    }
  }

  logDebug('collect-page-internal-finish', {
    page: page.name,
    components: components.length,
    errors: errors.length,
  });

  return { components, errors, pageHasComponents };
}

export async function collectComponentsFromPageChunked(
  page: PageNode,
  token: { aborted: boolean } | null,
  onProgress?: (processedNodes: number) => void,
): Promise<{
  components: DSComponent[];
  errors: string[];
  pageHasComponents: boolean;
  aborted: boolean;
}> {
  const components: DSComponent[] = [];
  const errors: string[] = [];
  let pageHasComponents = false;
  const stack: SceneNode[] = [...(page.children as SceneNode[])];
  let processedNodes = 0;
  const chunkSize = 250;

  while (stack.length > 0) {
    if (token?.aborted) {
      return { components, errors, pageHasComponents, aborted: true };
    }
    const node = stack.pop()!;

    if (node.type === 'COMPONENT_SET') {
      logDebug('component-set-detected', {
        page: page.name,
        name: node.name,
        id: node.id,
      });
      try {
      components.push(
        describeComponentSet(node, normalizePageName(page.name), figma.root.name),
      );
      } catch (error) {
        const message = buildErrorMessage(page.name, node.name, error);
        console.error(message, error);
        errors.push(message);
      }
      pageHasComponents = true;
      continue;
    }

    if (node.type === 'COMPONENT') {
      logDebug('component-detected', {
        page: page.name,
        name: node.name,
        id: node.id,
      });
      if (!node.parent || node.parent.type !== 'COMPONENT_SET') {
        try {
          components.push(
            describeSingleComponent(node, normalizePageName(page.name), figma.root.name),
          );
        } catch (error) {
          const message = buildErrorMessage(page.name, node.name, error);
          console.error(message, error);
          errors.push(message);
        }
        pageHasComponents = true;
      }
      continue;
    }

    if (node.type === 'INSTANCE') {
      logDebug('instance-skipped', {
        page: page.name,
        name: node.name,
        id: node.id,
      });
      continue;
    }

    if ('children' in node) {
      stack.push(...((node.children as SceneNode[]) ?? []));
    }

    processedNodes += 1;
    if (processedNodes % chunkSize === 0) {
      onProgress?.(processedNodes);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  onProgress?.(processedNodes);
  logDebug('collect-page-internal-finish', {
    page: page.name,
    components: components.length,
    errors: errors.length,
  });

  return {
    components,
    errors,
    pageHasComponents,
    aborted: Boolean(token?.aborted),
  };
}

function normalizePageName(name: string): string {
  if (!name) return '';
  return name.replace(/^[^A-Za-z0-9А-Яа-яЁё]+/, '').trim();
}

function buildStructureFromPatches(
  base: DSStructureNode[],
  patches: DSVariantStructurePatch[] | undefined,
): DSStructureNode[] {
  const nodes = base.map(cloneNode);
  const nodeMap = new Map<number, DSStructureNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  if (!patches || patches.length === 0) {
    return nodes;
  }

  for (const patch of patches) {
    switch (patch.op) {
      case 'update': {
        const target = nodeMap.get(patch.id);
        if (target) {
          Object.assign(target, patch.value);
        }
        break;
      }
      case 'remove': {
        nodeMap.delete(patch.id);
        const index = nodes.findIndex((node) => node.id === patch.id);
        if (index !== -1) {
          nodes.splice(index, 1);
        }
        break;
      }
      case 'add': {
        const copy = cloneNode(patch.node);
        nodes.push(copy);
        nodeMap.set(copy.id, copy);
        break;
      }
    }
  }

  return nodes;
}

function cloneNode(node: DSStructureNode): DSStructureNode {
  return JSON.parse(JSON.stringify(node));
}
