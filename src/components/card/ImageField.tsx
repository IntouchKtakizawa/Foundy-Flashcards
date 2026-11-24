import { useId, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { imageFileToDataUrl } from '@/lib/utils/image';

export function ImageField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <span className="field-label">{label}</span>
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border p-2">
          <img src={value} alt="" className="h-14 w-20 rounded-md object-cover" />
          <span className="flex-1 text-xs text-muted">Image attached</span>
          <button type="button" onClick={() => onChange(null)} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${label.toLowerCase()}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="flex h-[74px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted hover:border-accent/50 hover:text-fg"
          aria-describedby={error ? `${id}-err` : undefined}
        >
          <ImagePlus className="h-4 w-4" aria-hidden />
          {busy ? 'Processing…' : 'Add image'}
        </button>
      )}
      <input
        ref={ref}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            onChange(await imageFileToDataUrl(file));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
