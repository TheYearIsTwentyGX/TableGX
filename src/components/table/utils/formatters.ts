export function formatDateSafe(value: string | number | Date | null | undefined): string {
  if (!value) return '';
  const dateStr = typeof value === 'string' ? value : new Date(value).toISOString();
  // Safe parse from YYYY-MM-DD
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${month}/${day}/${year}`;
  }
  return new Date(value).toLocaleDateString();
}

export function parseDateSafe(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
  }
  return null;
}
