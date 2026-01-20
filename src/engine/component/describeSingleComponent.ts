import { DSComponent } from "../types";
import { inferCategoryFromName } from "./utils/inferCategory";
import { collectComponentStructure } from "./collectStructure";
import { classifyComponentMeta } from "../../lib/componentMetaClassifier";
import { getSectionName } from "./utils/getSectionName";

export function describeSingleComponent(
  comp: ComponentNode,
  pageName: string,
  libraryName?: string | null,
): DSComponent {
  const normalizedPageName = normalizePageName(pageName);
  const sectionName = getSectionName(comp);
  const classification = classifyComponentMeta({
    componentName: comp.name,
    pageName,
    sectionName,
    libraryName,
  });
  const structure = collectComponentStructure(comp, {
    preserveHiddenFills: true,
  });

  return {
    key: comp.key,
    name: comp.name,
    page: normalizedPageName,
    category: inferCategoryFromName(comp.name),
    description: comp.description || "",
    variants: [
      {
        id: comp.id,
        key: comp.key,
        name: comp.name,
      },
    ],
    defaultVariant: comp.key,
    structure,
    variantStructures: { [comp.key]: [] },
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
