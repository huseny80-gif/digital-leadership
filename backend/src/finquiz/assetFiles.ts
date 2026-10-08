import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

interface StoredAsset { path: string; parts?: string[] }

/** Parts contain consecutive, unmodified original bytes. Large source files
 * can be shipped in bounded repository blobs without rewriting their PDFs. */
export function assetPaths(asset: StoredAsset, root: URL): string[] {
  return (asset.parts ?? [asset.path]).map(path => fileURLToPath(new URL(path, root)));
}

export async function readAsset(asset: StoredAsset, root: URL): Promise<Buffer> {
  const buffers: Buffer[] = [];
  for (const path of assetPaths(asset, root)) buffers.push(await readFile(path));
  return Buffer.concat(buffers);
}
