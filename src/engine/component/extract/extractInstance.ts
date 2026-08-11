import { DSInstanceInfo } from "../../types";

export async function extractInstance(
  node: SceneNode,
): Promise<DSInstanceInfo | undefined> {
  if (node.type !== "INSTANCE") return undefined;

  const inst = node as InstanceNode;
  const info: DSInstanceInfo = {};

  try {
    const main = inst.mainComponent;
    if (main) {
      info.componentKey = main.key;
    }
  } catch (error) {
    void error;
  }

  if (!info.componentKey) {
    try {
      const main = await inst.getMainComponentAsync();
      if (main) {
        info.componentKey = main.key;
      }
    } catch (error) {
      // Keep variantProperties when a broken instance cannot resolve its source.
      void error;
    }
  }

  const vp = (inst as any).variantProperties;
  if (vp && typeof vp === "object") {
    info.variantProperties = vp as Record<string, string>;
  }

  return Object.keys(info).length > 0 ? info : undefined;
}
