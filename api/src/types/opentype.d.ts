declare module "opentype.js" {
  export type Path = {
    toPathData(decimalPlaces?: number): string;
  };

  export type Glyph = {
    index: number;
    advanceWidth?: number;
  };

  export type Font = {
    unitsPerEm: number;
    getPath(text: string, x: number, y: number, fontSize: number): Path;
    getAdvanceWidth(text: string, fontSize: number): number;
    charToGlyph(character: string): Glyph;
  };

  const opentype: { parse(buffer: ArrayBuffer): Font };
  export default opentype;
}
