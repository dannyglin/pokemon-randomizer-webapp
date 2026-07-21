import { useState } from "react";
import type { GameTier } from "@pokemon-randomizer/shared";

interface Props {
  gameTier: GameTier;
  onGameTierChange: (tier: GameTier) => void;
  romFile: File | null;
  onRomFileChange: (file: File | null) => void;
  updateFile: File | null;
  onUpdateFileChange: (file: File | null) => void;
}

function Slot({
  label,
  file,
  onFile,
}: {
  label: string;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`dropzone${dragOver ? " is-dragover" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFile(e.dataTransfer.files?.[0] ?? null);
      }}
    >
      <div className="dropzone-slot">{label}</div>
      <div>{file ? "Cartridge inserted" : "Drop a file here, or click to browse"}</div>
      {file ? (
        <div className="dropzone-filename">
          {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
        </div>
      ) : null}
      <input type="file" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}

export function RomUpload({ gameTier, onGameTierChange, romFile, onRomFileChange, updateFile, onUpdateFileChange }: Props) {
  return (
    <div className="rom-upload">
      <label className="field">
        <span>Game type</span>
        <select value={gameTier} onChange={(e) => onGameTierChange(e.target.value as GameTier)}>
          <option value="handheld">Handheld (Gen 1-5: .gb / .gbc / .gba / .nds)</option>
          <option value="3ds">3DS (Gen 6-7: decrypted .3ds / .cxi)</option>
        </select>
      </label>

      <Slot label="ROM" file={romFile} onFile={onRomFileChange} />

      {gameTier === "3ds" ? (
        <>
          <Slot label="Game update (optional, .cxi)" file={updateFile} onFile={onUpdateFileChange} />
          <p className="field-note">
            Providing an update file forces the output to be saved as a LayeredFS directory (zipped for you to
            download).
          </p>
        </>
      ) : null}
    </div>
  );
}
