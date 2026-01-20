export function inferCategoryFromName(name: string): string {
  const cleaned = name.replace(/^[^\wА-Яа-я]+/, "").trim();
  const parts = cleaned.split("/").map((p) => p.trim());
  return parts[0] || "Uncategorized";
}
