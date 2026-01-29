const imageStore: Map<string, string> = new Map();

export function storeImage(uri: string): string {
  const id = `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  imageStore.set(id, uri);
  return id;
}

export function getImage(id: string): string | undefined {
  return imageStore.get(id);
}

export function clearImage(id: string): void {
  imageStore.delete(id);
}

export function clearAllImages(): void {
  imageStore.clear();
}
