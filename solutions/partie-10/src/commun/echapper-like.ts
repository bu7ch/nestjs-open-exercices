// 9.11 : dans un motif ILIKE, `%` et `_` sont des jokers ; `\` (déclaré par ESCAPE) les rend littéraux.
export function echapperLike(texte: string): string {
  return texte.replace(/[\\%_]/g, (c) => `\\${c}`);
}
