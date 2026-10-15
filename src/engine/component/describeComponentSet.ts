import { DSComponent, DSStructureNode, DSStructureNodePatch, DSVariantStructurePatch } from "../types";
import { inferCategoryFromName } from "./utils/inferCategory";
import { collectComponentStructure } from "./collectStructure";
import { extractVariantList } from "./variantParser";
import { classifyComponentMeta } from "../../lib/componentMetaClassifier";
import { getSectionName } from "./utils/getSectionName";

export async function describeComponentSet(
  set: ComponentSetNode,
  pageName: string,
  libraryName?: string | null,
): Promise<DSComponent> {
  const normalizedPageName = normalizePageName(pageName);
  const variants = extractVariantList(set);
  const defaultVariant = variants.length > 0 ? variants[0].key : undefined;

  const sectionName = getSectionName(set);
  const classification = classifyComponentMeta({
    componentName: set.name,
    pageName,
    sectionName,
    libraryName,
  });

  const collectStructureOptions = { preserveHiddenFills: true };

  let structure: DSComponent['structure'] = [];
  const variantStructures: Record<string, DSVariantStructurePatch[]> = {};

  // Используем defaultVariant как base snapshot (fallback на первый доступный вариант).
  const componentVariants = set.children.filter(
    (child): child is ComponentNode => child.type === "COMPONENT",
  );
  const defaultVariantNode =
    defaultVariant && componentVariants.length > 0
      ? componentVariants.find((child) => child.key === defaultVariant)
      : undefined;
  let baseVariant = defaultVariantNode ?? componentVariants[0];
  if (baseVariant) {
    let baseStructure = await collectComponentStructure(
      baseVariant,
      collectStructureOptions,
    );
    // Если структура пустая — ищем любой вариант с непустой структурой.
    if (!baseStructure.length) {
      for (const candidate of componentVariants) {
        if (candidate.id === baseVariant.id) continue;
        const candidateStructure = await collectComponentStructure(
          candidate,
          collectStructureOptions,
        );
        if (candidateStructure.length) {
          baseVariant = candidate;
          baseStructure = candidateStructure;
          break;
        }
      }
    }
    structure = baseStructure;
    variantStructures[baseVariant.key] = [];
    if (baseStructure.length) {
      console.log('[Athena] defaultVariant base structure ready', {
        name: set.name,
        key: set.key,
        defaultVariant,
        baseKey: baseVariant.key,
        baseLength: baseStructure.length,
        page: normalizedPageName,
      });
    }
  }

  for (const child of set.children) {
    if (child.type !== "COMPONENT") continue;
    if (baseVariant && child.id === baseVariant.id) continue;
    const variantStructure = await collectComponentStructure(
      child as ComponentNode,
      collectStructureOptions,
    );
    // Сохраняем minimal diff от base structure.
    variantStructures[child.key] = buildVariantOverrides(structure, variantStructure);
  }

  return {
    key: set.key,
    name: set.name,
    page: normalizedPageName,
    category: inferCategoryFromName(set.name),
    description: set.description || "",
    variants,
    defaultVariant,
    structure,
    variantStructures,
    parentComponent: null,
    parentComponents: [],
    role: classification.role,
    status: classification.status,
    platform: classification.platform,
  };
}

function normalizePageName(name: string): string {
  if (!name) return '';
  return name.replace(/^[^A-Za-z0-9А-Яа-яЁё]+/, '').trim();
}

export function buildVariantOverrides(
  base: DSStructureNode[],
  variant: DSStructureNode[],
): DSVariantStructurePatch[] {
  assertStructureIds(base);
  assertStructureIds(variant);
  if (base.length === 0) {
    return variant.map((node) => ({ op: "add", node: cloneNode(node) }));
  }

  const overrides: DSVariantStructurePatch[] = [];
  const baseMap = new Map<string, DSStructureNode>();
  const seen = new Set<string>();
  const baseKeys = buildCanonicalOccurrenceKeys(base);
  const variantKeys = buildCanonicalOccurrenceKeys(variant);

  for (let index = 0; index < base.length; index += 1) {
    baseMap.set(baseKeys[index], base[index]);
  }

  // Variant IDs are local DFS counters, not IDs in the base structure.
  // Reserve the entire old namespace, including nodes that will be removed.
  let nextId = base.reduce((max, node) => Math.max(max, node.id), 0) + 1;
  const ids = new Map<number, number>();
  for (let index = 0; index < variant.length; index += 1) {
    const matched = baseMap.get(variantKeys[index]);
    const id = matched ? matched.id : nextId++;
    if (!Number.isSafeInteger(id)) throw new Error("Variant structure ID space exhausted");
    ids.set(variant[index].id, id);
  }

  for (let index = 0; index < variant.length; index += 1) {
    const original = variant[index];
    const node = { ...original, id: ids.get(original.id)!,
      parentId: original.parentId === null ? null : ids.get(original.parentId)! };
    const key = variantKeys[index];
    const baseNode = baseMap.get(key);
    if (!baseNode) {
      overrides.push({ op: "add", node: cloneNode(node) });
      continue;
    }
    seen.add(key);
    const diff = diffNodes(baseNode, node);
    if (diff) {
      overrides.push({ op: "update", id: baseNode.id, value: diff });
    }
  }

  for (const [key, node] of baseMap.entries()) {
    if (!seen.has(key)) {
      overrides.push({ op: "remove", id: node.id });
    }
  }

  return overrides;
}

function assertStructureIds(nodes: DSStructureNode[]): void {
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length || nodes.some(node => !Number.isSafeInteger(node.id) || node.id < 0)) {
    throw new Error("Duplicate or invalid structure node ID");
  }
  if (nodes.length && nodes.filter(node => node.parentId === null).length !== 1) {
    throw new Error("Structure must have one root");
  }
  for (const node of nodes) {
    const seen = new Set<number>();
    let current: DSStructureNode | undefined = node;
    while (current) {
      if (seen.has(current.id)) throw new Error("Cyclic structure parent reference");
      seen.add(current.id);
      if (current.parentId === null) break;
      current = byId.get(current.parentId);
      if (!current) throw new Error("Missing structure parent ID");
    }
  }
}

function buildCanonicalOccurrenceKeys(nodes: DSStructureNode[]): string[] {
  const counts = new Map<string, number>();
  return nodes.map((node) => {
    const path = canonicalPath(node.path);
    const occurrence = (counts.get(path) ?? 0) + 1;
    counts.set(path, occurrence);
    return JSON.stringify([path, occurrence]);
  });
}

function diffNodes(
  baseNode: DSStructureNode,
  nextNode: DSStructureNode,
): DSStructureNodePatch | null {
  const patch: DSStructureNodePatch = {};

  if (baseNode.parentId !== nextNode.parentId) patch.parentId = nextNode.parentId;
  if (baseNode.path !== nextNode.path) patch.path = nextNode.path;
  if (baseNode.type !== nextNode.type) patch.type = nextNode.type;
  if (baseNode.name !== nextNode.name) patch.name = nextNode.name;
  if (baseNode.visible !== nextNode.visible) patch.visible = nextNode.visible;
  if (!isEqual(baseNode.styles, nextNode.styles)) patch.styles = nextNode.styles;
  if (!isEqual(baseNode.layout, nextNode.layout)) patch.layout = nextNode.layout;
  if (!isEqual(baseNode.opacity, nextNode.opacity)) patch.opacity = nextNode.opacity;
  if (!isEqual(baseNode.opacityToken, nextNode.opacityToken)) {
    patch.opacityToken = nextNode.opacityToken;
  }
  if (!isEqual(baseNode.radius, nextNode.radius)) patch.radius = nextNode.radius;
  if (!isEqual(baseNode.radiusToken, nextNode.radiusToken)) {
    patch.radiusToken = nextNode.radiusToken;
  }
  if (!isEqual(baseNode.effects, nextNode.effects)) patch.effects = nextNode.effects;
  if (!isEqual(baseNode.fills, nextNode.fills)) patch.fills = nextNode.fills;
  if (!isEqual(baseNode.fillToken, nextNode.fillToken)) {
    patch.fillToken = nextNode.fillToken;
  }
  if (!isEqual(baseNode.strokes, nextNode.strokes)) patch.strokes = nextNode.strokes;
  if (!isEqual(baseNode.strokeToken, nextNode.strokeToken)) {
    patch.strokeToken = nextNode.strokeToken;
  }
  if (!isEqual(baseNode.strokeWeight, nextNode.strokeWeight)) {
    patch.strokeWeight = nextNode.strokeWeight;
  }
  if (!isEqual(baseNode.strokeAlign, nextNode.strokeAlign)) {
    patch.strokeAlign = nextNode.strokeAlign;
  }
  if (!isEqual(baseNode.typography, nextNode.typography)) {
    patch.typography = nextNode.typography;
  }
  if (!isEqual(baseNode.typographyToken, nextNode.typographyToken)) {
    patch.typographyToken = nextNode.typographyToken;
  }
  if (!isEqual(baseNode.componentInstance, nextNode.componentInstance)) {
    patch.componentInstance = nextNode.componentInstance;
  }
  if (!isEqual(baseNode.text, nextNode.text)) patch.text = nextNode.text;

  return Object.keys(patch).length ? patch : null;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function cloneNode(node: DSStructureNode): DSStructureNode {
  return JSON.parse(JSON.stringify(node));
}

function canonicalPath(path: string): string {
  if (!path) return '';
  const segments = path.split(" / ");
  if (segments.length === 0) return '';
  segments[0] = "@root";
  return segments.join(" / ");
}
