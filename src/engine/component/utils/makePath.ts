export function makePath(parent: string, name: string): string {
  return parent ? parent + " / " + name : name;
}
