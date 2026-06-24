import { gzip as gzipCb, gunzip as gunzipCb } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzipCb);
const gunzipAsync = promisify(gunzipCb);

export async function gzipJson(buffer: Buffer): Promise<Buffer> {
  return gzipAsync(buffer);
}

export async function gunzipJson(buffer: Buffer): Promise<Buffer> {
  return gunzipAsync(buffer);
}
