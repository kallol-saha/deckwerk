import { inflateSync, unzlibSync } from 'fflate';

/**
 * Decodes a PNG zTXt payload holding a diagram: zlib as the PNG spec says,
 * or raw deflate as draw.io's older CLI wrote it (Editor.extractGraphModelFromPng).
 */
export function inflateDiagramChunk(data: Uint8Array): Uint8Array {
  try {
    return unzlibSync(data);
  } catch {
    return inflateSync(data);
  }
}
