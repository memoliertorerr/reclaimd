import { access } from "node:fs/promises";

/** Whether a path exists (and is reachable). Read-only; never throws. */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
