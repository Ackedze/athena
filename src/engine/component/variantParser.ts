import { DSVariant } from "../types";

export function extractVariantList(set: ComponentSetNode): DSVariant[] {
  const result: DSVariant[] = [];

  for (const child of set.children) {
    if (child.type !== "COMPONENT") continue;

    result.push({
      id: child.id,
      key: child.key,
      name: child.name,
    });
  }

  return result;
}
