import fs from "node:fs/promises";
import path from "node:path";
import { WORKSPACE_ROOT, resolveWorkspacePath } from "../paths";
import { registerAction } from "./registry";

/**
 * File operations, deliberately limited to this sprint's scope: list,
 * read metadata, create a folder, create a file. No delete, no bulk
 * modification, no path outside the approved workspace — every target
 * path is resolved through `resolveWorkspacePath()`, which throws
 * rather than silently clamping if the request would escape the root.
 */

function toDisplayPath(absolute: string): string {
  const relative = path.relative(WORKSPACE_ROOT, absolute);
  return relative === "" ? "." : relative;
}

registerAction("fs.listDirectory", async (parameters) => {
  const target = resolveWorkspacePath(parameters.path as string | undefined);
  const entries = await fs.readdir(target, { withFileTypes: true });
  return {
    path: toDisplayPath(target),
    entries: entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
    })),
  };
});

registerAction("fs.readFileMetadata", async (parameters) => {
  const target = resolveWorkspacePath(parameters.path as string);
  const stat = await fs.stat(target);
  return {
    path: toDisplayPath(target),
    sizeBytes: stat.size,
    createdAt: stat.birthtime.toISOString(),
    modifiedAt: stat.mtime.toISOString(),
    isDirectory: stat.isDirectory(),
  };
});

registerAction("fs.createFolder", async (parameters) => {
  const target = resolveWorkspacePath(parameters.path as string);
  await fs.mkdir(target, { recursive: true });
  return { path: toDisplayPath(target) };
});

registerAction("fs.createFile", async (parameters) => {
  const target = resolveWorkspacePath(parameters.path as string);
  const content = (parameters.content as string | undefined) ?? "";
  const overwrite = parameters.overwrite === true;

  const exists = await fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
  if (exists && !overwrite) {
    throw new Error(
      `A file already exists at "${toDisplayPath(target)}". Resubmit with overwrite=true (requires approval) to replace it.`,
    );
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return {
    path: toDisplayPath(target),
    bytesWritten: Buffer.byteLength(content, "utf8"),
    overwritten: exists,
  };
});
