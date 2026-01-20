import { DSStructureNode } from "../types";
import { snapshotNode } from "./snapshotNode";

interface CollectStructureOptions {
  preserveHiddenFills?: boolean;
}

// Cache per root node + options, чтобы не пересобирать структуры между variants.
const structureCache = new Map<string, DSStructureNode[]>();

export function resetStructureCache() {
  structureCache.clear();
}

export function collectComponentStructure(
  root: SceneNode,
  options?: CollectStructureOptions,
): DSStructureNode[] {
  const resolvedOptions = {
    preserveHiddenFills: options?.preserveHiddenFills ?? true,
  };
  const cacheKey = `${root.id}:${resolvedOptions.preserveHiddenFills ? "1" : "0"}`;
  const cached = structureCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const list: DSStructureNode[] = [];
  let nextId = 1;

  function walk(node: SceneNode, parentPath: string, parentId: number | null) {
    const id = nextId++;
    const snap = snapshotNode(node, parentPath, parentId, id, resolvedOptions);
    list.push(snap);

    if ("children" in node) {
      for (const child of node.children as SceneNode[]) {
        walk(child, snap.path, id);
      }
    }
  }

  walk(root, "", null);
  structureCache.set(cacheKey, list);
  return list;
}
