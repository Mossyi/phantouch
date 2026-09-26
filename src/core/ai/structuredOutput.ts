export interface BoundedStringArrayOptions {
  maxItems: number;
  maxItemLength: number;
}

export const parseBoundedStringArray = (
  value: string,
  options: BoundedStringArrayOptions,
): string[] => {
  const maxItems = Math.max(1, Math.floor(options.maxItems));
  const maxItemLength = Math.max(1, Math.floor(options.maxItemLength));
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxItemLength))
    .filter(Boolean)
    .slice(0, maxItems);
};
