import { DSInstanceInfo } from "../../types";

export function extractInstance(node: SceneNode): DSInstanceInfo | undefined {
  if (node.type !== "INSTANCE") return undefined;

  const inst = node as InstanceNode;
  const main = inst.mainComponent;
  if (!main) return undefined;

  const info: DSInstanceInfo = {
    componentKey: main.key,
  };

  const vp = (inst as any).variantProperties;
  if (vp && typeof vp === "object") {
    info.variantProperties = vp as Record<string, string>;
  }

  return info;
}
