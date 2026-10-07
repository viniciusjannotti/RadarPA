type RawParams = Record<string, string | string[] | undefined>;

export function firstParam(params: RawParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

export function intParam(params: RawParams, key: string): number | undefined {
  const v = firstParam(params, key);
  if (v === undefined || !/^\d{1,9}$/.test(v)) return undefined;
  return Number(v);
}
