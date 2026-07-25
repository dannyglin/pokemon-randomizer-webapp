import path from "node:path";

/**
 * First 16 bytes of the Nintendo boot logo, which every legitimate GB/GBC/GBA
 * ROM embeds in its header (Pan Docs). NDS ROMs embed the same logo at a
 * different offset. This is a heuristic, not full validation — the
 * randomizer itself is the source of truth and will reject a bad ROM
 * cleanly; this check exists only to reject obviously-wrong uploads (wrong
 * file type, truncated upload) before we spend a worker slot on them.
 */
const NINTENDO_LOGO_PREFIX = Buffer.from([
  0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d,
]);

const SUPPORTED_EXTENSIONS = new Set([".gb", ".gbc", ".gba", ".nds"]);

interface RomHeaderCheck {
  offset: number;
}

const HEADER_CHECKS_BY_EXTENSION: Record<string, RomHeaderCheck> = {
  ".gb": { offset: 0x104 },
  ".gbc": { offset: 0x104 },
  ".gba": { offset: 0x04 },
  ".nds": { offset: 0xc0 },
};

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateExtension(fileName: string): ValidationResult {
  const ext = path.extname(fileName).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: `Unsupported ROM extension "${ext}". Expected one of: ${[...SUPPORTED_EXTENSIONS].join(", ")}` };
  }
  return { ok: true };
}

export function validateHandheldHeader(fileName: string, buffer: Buffer): ValidationResult {
  const ext = path.extname(fileName).toLowerCase();
  const check = HEADER_CHECKS_BY_EXTENSION[ext];
  if (!check) return { ok: true }; // not a header we know how to check

  if (buffer.length < check.offset + NINTENDO_LOGO_PREFIX.length) {
    return { ok: false, reason: "File is too small to be a valid ROM (truncated upload?)" };
  }
  const slice = buffer.subarray(check.offset, check.offset + NINTENDO_LOGO_PREFIX.length);
  if (!slice.equals(NINTENDO_LOGO_PREFIX)) {
    return { ok: false, reason: "File doesn't look like a valid Game Boy/GBA/NDS ROM (Nintendo header logo mismatch)" };
  }
  return { ok: true };
}
