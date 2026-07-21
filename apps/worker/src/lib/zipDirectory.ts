import fs from "node:fs";
import archiver from "archiver";

/** Zips `sourceDir` into `destZipPath`. Used for 3DS LayeredFS directory output, which browsers can't download as-is. */
export function zipDirectory(sourceDir: string, destZipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
