import { DSStructureNode } from "../types";
import { snapshotNode } from "./snapshotNode";

interface CollectStructureOptions {
  preserveHiddenFills?: boolean;
}

// Cache per root node + options, чтобы не пересобирать структуры между variants.
const structureCache = new Map<string, Promise<DSStructureNode[]>>();

export function resetStructureCache() {
  structureCache.clear();
}

export async function collectComponentStructure(
  root: SceneNode,
  options?: CollectStructureOptions,
): Promise<DSStructureNode[]> {
  const resolvedOptions = {
    preserveHiddenFills: options?.preserveHiddenFills ?? true,
  };
  const cacheKey = `${root.id}:${resolvedOptions.preserveHiddenFills ? "1" : "0"}`;
  const cached = structureCache.get(cacheKey);
  if (cached) {
    return await cached;
  }

  const structurePromise = (async () => {
    const list: DSStructureNode[] = [];
    let nextId = 1;

    async function walk(node: SceneNode, parentPath: string, parentId: number | null) {
      const id = nextId++;
      const snap = await snapshotNode(node, parentPath, parentId, id, resolvedOptions);
      list.push(snap);

      if ("children" in node) {
        for (const child of node.children as SceneNode[]) {
          await walk(child, snap.path, id);
        }
      }
    }

    await walk(root, "", null);
    return list;
  })();

  structureCache.set(cacheKey, structurePromise);
  return await structurePromise;
}
