import path from "node:path";

/**
 * First 16 bytes of the DMG/CGB (Game Boy/Game Boy Color) Nintendo boot
 * logo (Pan Docs). This is a *different* bitmap than the GBA/NDS one below
 * — same "Nintendo" wordmark, but a different graphics format/compression
 * between the two hardware families, so the actual bytes don't match.
 */
const DMG_LOGO_PREFIX = Buffer.from([
  0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b, 0x03, 0x73, 0x00, 0x83, 0x00, 0x0c, 0x00, 0x0d,
]);

/**
 * First 16 bytes of the GBA Nintendo logo (GBATEK). NDS carts embed this
 * exact same GBA-compatible logo (for backward-compat header validation),
 * just at a different offset — it is NOT the DMG logo above; using the
 * wrong one here previously rejected every legitimate GBA/NDS ROM.
 */
const GBA_LOGO_PREFIX = Buffer.from([
  0x24, 0xff, 0xae, 0x51, 0x69, 0x9a, 0xa2, 0x21, 0x3d, 0x84, 0x82, 0x0a, 0x84, 0xe4, 0x09, 0xad,
]);

const SUPPORTED_EXTENSIONS = new Set([".gb", ".gbc", ".gba", ".nds"]);

interface RomHeaderCheck {
  offset: number;
  logo: Buffer;
}

const HEADER_CHECKS_BY_EXTENSION: Record<string, RomHeaderCheck> = {
  ".gb": { offset: 0x104, logo: DMG_LOGO_PREFIX },
  ".gbc": { offset: 0x104, logo: DMG_LOGO_PREFIX },
  ".gba": { offset: 0x04, logo: GBA_LOGO_PREFIX },
  ".nds": { offset: 0xc0, logo: GBA_LOGO_PREFIX },
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

  if (buffer.length < check.offset + check.logo.length) {
    return { ok: false, reason: "File is too small to be a valid ROM (truncated upload?)" };
  }
  const slice = buffer.subarray(check.offset, check.offset + check.logo.length);
  if (!slice.equals(check.logo)) {
    return { ok: false, reason: "File doesn't look like a valid Game Boy/GBA/NDS ROM (Nintendo header logo mismatch)" };
  }
  return { ok: true };
}
