import { useRef, useState } from 'react';
import { Icon } from './ui';

export function ZipDrop({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className={`dropzone ${over ? 'is-over' : ''} ${file ? 'has-file' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
    >
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        hidden
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <Icon name={file ? 'folder_zip' : 'upload_file'} className="dropzone-icon" />
      {file ? (
        <span>
          <strong>{file.name}</strong> · {(file.size / 1024 / 1024).toFixed(1)} MB
        </span>
      ) : (
        <span>ZIP hierher ziehen oder klicken zum Auswählen</span>
      )}
    </div>
  );
}
