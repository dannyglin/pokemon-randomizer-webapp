import type { GameTier } from "@pokemon-randomizer/shared";

interface Props {
  gameTier: GameTier;
  onGameTierChange: (tier: GameTier) => void;
  romFile: File | null;
  onRomFileChange: (file: File | null) => void;
  updateFile: File | null;
  onUpdateFileChange: (file: File | null) => void;
}

export function RomUpload({ gameTier, onGameTierChange, romFile, onRomFileChange, updateFile, onUpdateFileChange }: Props) {
  return (
    <div className="rom-upload">
      <label className="field">
        Game type
        <select value={gameTier} onChange={(e) => onGameTierChange(e.target.value as GameTier)}>
          <option value="handheld">Handheld (Gen 1-5: .gb / .gbc / .gba / .nds)</option>
          <option value="3ds">3DS (Gen 6-7: decrypted .3ds / .cxi)</option>
        </select>
      </label>

      <label className="field">
        ROM file
        <input type="file" onChange={(e) => onRomFileChange(e.target.files?.[0] ?? null)} />
      </label>
      {romFile ? <p className="file-hint">{romFile.name} ({(romFile.size / 1024 / 1024).toFixed(1)} MB)</p> : null}

      {gameTier === "3ds" ? (
        <>
          <label className="field">
            Game update file (optional, .cxi)
            <input type="file" onChange={(e) => onUpdateFileChange(e.target.files?.[0] ?? null)} />
          </label>
          {updateFile ? <p className="file-hint">{updateFile.name}</p> : null}
          <p className="field-note">
            Providing an update file forces the output to be saved as a LayeredFS directory (zipped for you to
            download).
          </p>
        </>
      ) : null}
    </div>
  );
}
