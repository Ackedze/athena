import { DSInstanceInfo } from "../../types";

export function extractInstance(node: SceneNode): DSInstanceInfo | undefined {
  if (node.type !== "INSTANCE") return undefined;

  const inst = node as InstanceNode;
  const info: DSInstanceInfo = {};

  try {
    const main = inst.mainComponent;
    if (main) {
      info.componentKey = main.key;
    }
  } catch (error) {
    // dynamic-page mode forbids sync access to mainComponent.
    // Keep variantProperties and skip component linkage instead of failing export.
    void error;
  }

  const vp = (inst as any).variantProperties;
  if (vp && typeof vp === "object") {
    info.variantProperties = vp as Record<string, string>;
  }

  return Object.keys(info).length > 0 ? info : undefined;
}
