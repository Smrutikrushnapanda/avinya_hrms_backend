const POINT_MARKER =
  /^(?:[-•*]\s*(?:\[[ xX]\]\s*)?|\d+[.)]\s*|\[[ xX]\]\s*)(.*)$/;

function descriptionLines(text: string) {
  return text
    .split(/\r\n?|\n/)
    .map((line) => {
      const trimmed = line.trim();
      const match = POINT_MARKER.exec(trimmed);
      return {
        text: (match ? match[1] : trimmed).trim(),
        listed: Boolean(match),
      };
    })
    .filter(
      (line) =>
        line.text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().length > 0,
    );
}

export function extractWorkPoints(text: string): string[] {
  const lines = descriptionLines(text);
  const points = lines.filter((line) => line.listed).map((line) => line.text);
  return points.length
    ? points
    : lines.length > 1
      ? lines.map((line) => line.text)
      : [];
}

export function hasWorkDescription(text: unknown): text is string {
  return typeof text === 'string' && descriptionLines(text).length > 0;
}
