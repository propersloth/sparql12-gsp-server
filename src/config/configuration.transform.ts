export function parsePayloadSize(value: string): number {
  const match = value.match(/^(\d+(?:\.\d+)?)(MB|GB|KB)?$/i);
  if (!match) throw new Error(`Invalid size format: ${value}`);
  const n = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers: Record<string, number> = {
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    B: 1,
  };
  return Math.floor(n * (multipliers[unit] ?? 1));
}
