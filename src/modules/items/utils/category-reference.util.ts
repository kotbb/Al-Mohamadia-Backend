export function categoryRefId(value: unknown): string {
  if (value && typeof value === 'object' && '_id' in value) {
    const id = (value as { _id: { toString(): string } })._id;
    return id.toString();
  }
  return String(value);
}

export function categoryRefName(value: unknown): string | null {
  if (value && typeof value === 'object' && 'name' in value && typeof value.name === 'string') {
    return value.name;
  }
  return null;
}
