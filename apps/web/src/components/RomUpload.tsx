import { useState } from "react";

interface Props {
  romFile: File | null;
  onRomFileChange: (file: File | null) => void;
}

function Slot({ label, file, onFile }: { label: string; file: File | null; onFile: (file: File | null) => void }) {
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
      <input type="file" accept=".gb,.gbc,.gba,.nds" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}

export function RomUpload({ romFile, onRomFileChange }: Props) {
  return (
    <div className="rom-upload">
      <p className="field-note">Gen 1-5: .gb / .gbc / .gba / .nds</p>
      <Slot label="ROM" file={romFile} onFile={onRomFileChange} />
    </div>
  );
}
