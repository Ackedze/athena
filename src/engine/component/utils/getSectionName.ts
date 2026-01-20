export function getSectionName(node: BaseNode): string | null {
  let current: BaseNode | null = node.parent;
  let topSectionName: string | null = null;

  while (current) {
    if (current.type === 'SECTION') {
      topSectionName = current.name;
    }

    if (current.type === 'PAGE' || current.type === 'DOCUMENT') {
      break;
    }

    current = current.parent as BaseNode | null;
  }

  return topSectionName;
}
