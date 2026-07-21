import path from "node:path";
import type { GameTier } from "@pokemon-randomizer/shared";

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

const HANDHELD_EXTENSIONS = new Set([".gb", ".gbc", ".gba", ".nds"]);
// CliRandomizer reads 3DS ROMs/updates as a single decrypted NCCH container
// (.3ds or .cxi), parsed by byte offset — not a folder/zip. See
// Abstract3DSRomHandler.getProductCodeFromFile.
const THREE_DS_EXTENSIONS = new Set([".3ds", ".cxi"]);

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

export function validateExtension(fileName: string, tier: GameTier): ValidationResult {
  const ext = path.extname(fileName).toLowerCase();
  if (tier === "handheld") {
    if (!HANDHELD_EXTENSIONS.has(ext)) {
      return { ok: false, reason: `Unsupported handheld ROM extension "${ext}". Expected one of: ${[...HANDHELD_EXTENSIONS].join(", ")}` };
    }
  } else {
    if (!THREE_DS_EXTENSIONS.has(ext)) {
      return { ok: false, reason: `3DS ROM uploads must be a decrypted .3ds or .cxi file, got "${ext}"` };
    }
  }
  return { ok: true };
}

export function validateHandheldHeader(fileName: string, buffer: Buffer): ValidationResult {
  const ext = path.extname(fileName).toLowerCase();
  const check = HEADER_CHECKS_BY_EXTENSION[ext];
  if (!check) return { ok: true }; // not a header we know how to check (e.g. zip)

  if (buffer.length < check.offset + NINTENDO_LOGO_PREFIX.length) {
    return { ok: false, reason: "File is too small to be a valid ROM (truncated upload?)" };
  }
  const slice = buffer.subarray(check.offset, check.offset + NINTENDO_LOGO_PREFIX.length);
  if (!slice.equals(NINTENDO_LOGO_PREFIX)) {
    return { ok: false, reason: "File doesn't look like a valid Game Boy/GBA/NDS ROM (Nintendo header logo mismatch)" };
  }
  return { ok: true };
}
