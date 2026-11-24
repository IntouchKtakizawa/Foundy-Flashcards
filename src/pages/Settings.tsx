import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Check, Database, Download, HardDrive, Keyboard, Monitor, Moon, Palette, RotateCcw, ShieldCheck, Sun, Trash2, Upload } from 'lucide-react';
import { db, getStorageEstimate, requestPersistentStorage } from '@/db/database';
import { deleteAllData, resetStudyStatistics } from '@/db/repo';
import { usePreferences } from '@/state/preferences';
import { useToast } from '@/state/toast';
import { exportAllDecks, exportFullBackup } from '@/lib/backup/exportDeck';
import { restoreBackup, validateBackup, type BackupValidation, type RestoreStrategy } from '@/lib/backup/backup';
import { cn, formatBytes, formatRelative } from '@/lib/utils';
import { STUDY_MODE_LABELS, type AccentColor, type StudyMode } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Kbd, PageHeader, Segmented, Switch } from '@/components/ui/misc';

const ACCENTS: Array<{ value: AccentColor; label: string; swatch: string }> = [
  { value: 'violet', label: 'Violet', swatch: '#7c3aed' },
  { value: 'indigo', label: 'Indigo', swatch: '#4f46e5' },
  { value: 'blue', label: 'Blue', swatch: '#2563eb' },
  { value: 'teal', label: 'Teal', swatch: '#0d8078' },
  { value: 'rose', label: 'Rose', swatch: '#cd2154' },
  { value: 'amber', label: 'Amber', swatch: '#b45309' },
];

function Section({ id, title, description, icon, children }: { id: string; title: string; description?: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="panel">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="mt-0.5 text-accent">{icon}</span>
        <div>
          <h2 id={`${id}-h`} className="text-sm font-semibold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { prefs, update } = usePreferences();
  const toast = useToast();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [restoreData, setRestoreData] = useState<{ raw: unknown; name: string; validation: BackupValidation } | null>(null);
  const [strategy, setStrategy] = useState<RestoreStrategy>('merge');
  const [restoring, setRestoring] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastBackup = useLiveQuery(() => db.meta.get('lastBackupAt'), []);
  const counts = useLiveQuery(async () => ({ decks: await db.decks.count(), cards: await db.cards.count(), reviews: await db.reviews.count() }), []);

  useEffect(() => {
    void getStorageEstimate().then(setStorage);
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, [counts?.cards]);

  const pickRestore = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      toast.error('Backup too large', 'Files over 200 MB cannot be restored in the browser.');
      return;
    }
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const validation = validateBackup(raw);
      setStrategy('merge');
      setRestoreData({ raw, name: file.name, validation });
    } catch {
      setRestoreData({ raw: null, name: file.name, validation: { ok: false, errors: ['This file is not valid JSON.'], warnings: [], kind: null, counts: { decks: 0, cards: 0, folders: 0, reviews: 0, sessions: 0 } } });
    }
  };

  const doRestore = async () => {
    if (!restoreData?.validation.ok) return;
    setRestoring(true);
    try {
      if (strategy === 'replace') await exportFullBackup().catch(() => undefined); // safety copy first
      const s = await restoreBackup(restoreData.raw, strategy);
      toast.success('Backup restored', `${s.decks} decks, ${s.cards} cards and ${s.reviews} reviews ${strategy === 'merge' ? 'merged into' : 'now on'} this device.`);
      setRestoreData(null);
    } catch (e) {
      toast.error('Restore failed — nothing was changed', (e as Error).message);
    } finally {
      setRestoring(false);
    }
  };

  const modes = Object.keys(STUDY_MODE_LABELS) as StudyMode[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Preferences are saved on this device and included in backups." />

      <Section id="appearance" title="Appearance" icon={<Palette className="h-4 w-4" />}>
        <Row label="Theme">
          <Segmented
            label="Theme"
            value={prefs.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" aria-hidden /> },
              { value: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" aria-hidden /> },
              { value: 'system', label: 'System', icon: <Monitor className="h-3.5 w-3.5" aria-hidden /> },
            ]}
          />
        </Row>
        <Row label="Accent colour">
          <div className="flex gap-2" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                role="radio"
                aria-checked={prefs.accent === a.value}
                aria-label={a.label}
                title={a.label}
                onClick={() => update({ accent: a.value })}
                className={cn('flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface', prefs.accent === a.value && 'ring-2 ring-fg/50')}
                style={{ background: a.swatch }}
              >
                {prefs.accent === a.value && <Check className="h-4 w-4 text-white" aria-hidden />}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Animations" description="“System” follows your device’s reduce-motion setting.">
          <Segmented
            label="Animations"
            value={prefs.motion}
            onChange={(motion) => update({ motion })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'full', label: 'Full' },
              { value: 'reduced', label: 'Reduced' },
            ]}
          />
        </Row>
      </Section>

      <Section id="study" title="Study" icon={<RotateCcw className="h-4 w-4" />} description="Defaults used when you start a session.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Default study mode" value={prefs.defaultStudyMode} onChange={(e) => update({ defaultStudyMode: e.target.value as StudyMode })}>
            {modes.map((m) => (
              <option key={m} value={m}>
                {STUDY_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
          <Select label="Default card order" value={prefs.cardOrder} onChange={(e) => update({ cardOrder: e.target.value as typeof prefs.cardOrder })} hint="Spaced repetition always prioritises due cards.">
            <option value="original">Deck order</option>
            <option value="shuffled">Shuffled</option>
            <option value="difficult-first">Difficult cards first</option>
          </Select>
          <Input
            label="Daily revision target"
            type="number"
            min={1}
            max={1000}
            value={prefs.dailyTarget}
            hint="Cards per day, shown on the dashboard."
            onChange={(e) => {
              const v = Math.max(1, Math.min(1000, Number(e.target.value) || 1));
              void update({ dailyTarget: v });
            }}
          />
          <Input
            label="New cards per day"
            type="number"
            min={0}
            max={500}
            value={prefs.newCardsPerDay}
            hint="Limit for spaced repetition."
            onChange={(e) => {
              const v = Math.max(0, Math.min(500, Number(e.target.value) || 0));
              void update({ newCardsPerDay: v });
            }}
          />
        </div>
        <div>
          <label htmlFor="retention" className="field-label">
            Target memory retention: {Math.round(prefs.desiredRetention * 100)}%
          </label>
          <input
            id="retention"
            type="range"
            min={0.8}
            max={0.97}
            step={0.01}
            value={prefs.desiredRetention}
            onChange={(e) => update({ desiredRetention: Number(e.target.value) })}
            className="w-full accent-[rgb(var(--accent))]"
          />
          <p className="field-hint">Higher retention means more frequent reviews. 90% is a good balance for most learners.</p>
        </div>
        <Row label="Answer comparison" description="How strictly Written mode compares your typed answer. It compares text only and can’t judge meaning — you can always override it.">
          <Segmented
            label="Answer comparison sensitivity"
            value={prefs.answerSensitivity}
            onChange={(answerSensitivity) => update({ answerSensitivity })}
            options={[
              { value: 'strict', label: 'Strict' },
              { value: 'normal', label: 'Normal' },
              { value: 'lenient', label: 'Lenient' },
            ]}
          />
        </Row>
        <Switch label="Ignore punctuation in written answers" description="Full stops, commas, quotes and brackets won’t affect marking." checked={prefs.ignorePunctuation} onChange={(ignorePunctuation) => update({ ignorePunctuation })} />
      </Section>

      <Section id="keyboard" title="Keyboard shortcuts" icon={<Keyboard className="h-4 w-4" />}>
        <Switch label="Enable keyboard shortcuts" checked={prefs.keyboardShortcuts} onChange={(keyboardShortcuts) => update({ keyboardShortcuts })} />
        <dl className={cn('grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2', !prefs.keyboardShortcuts && 'opacity-50')}>
          {[
            [['Ctrl', 'K'], 'Search everything'],
            [['/'], 'Search everything'],
            [['Space'], 'Flip card'],
            [['←', '→'], 'Previous / next card'],
            [['1', '2', '3', '4'], 'Again · Hard · Good · Easy'],
            [['H'], 'Show hint'],
            [['F'], 'Mark for revision'],
            [['Enter'], 'Submit answer'],
            [['Ctrl', 'Enter'], 'Save card (editor)'],
            [['Ctrl', 'P'], 'Flip preview (editor)'],
          ].map(([keys, what]) => (
            <div key={(what as string) + (keys as string[]).join()} className="flex items-center justify-between gap-3">
              <dt className="text-muted">{what as string}</dt>
              <dd className="flex gap-1">
                {(keys as string[]).map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="data" title="Data & backups" icon={<Database className="h-4 w-4" />} description="Your data lives only in this browser’s IndexedDB storage.">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted">Stored</p>
            <p className="mt-1 text-sm font-medium">
              {counts ? `${counts.decks} decks · ${counts.cards} cards` : '…'}
            </p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="flex items-center gap-1 text-xs text-muted">
              <HardDrive className="h-3 w-3" aria-hidden /> Storage used
            </p>
            <p className="mt-1 text-sm font-medium">{storage ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}` : 'Unavailable'}</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted">Last backup</p>
            <p className="mt-1 text-sm font-medium">{lastBackup?.value ? formatRelative(lastBackup.value as number) : 'Never'}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-medium">Clearing your browser data deletes your flashcards</p>
            <p className="mt-0.5 text-muted">
              Foundy has no cloud account, so “Clear site data”, private browsing, or uninstalling the browser can permanently remove everything. Export a backup regularly and keep it somewhere safe.
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className={cn('h-3.5 w-3.5', persisted ? 'text-success' : 'text-muted')} aria-hidden />
              {persisted ? 'Persistent storage is granted — the browser won’t evict your data automatically.' : 'Persistent storage not granted yet.'}
              {!persisted && (
                <button className="font-medium text-accent hover:underline" onClick={async () => setPersisted(await requestPersistentStorage())}>
                  Request it
                </button>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Download className="h-4 w-4" />}
            onClick={async () => {
              try {
                await exportFullBackup();
                toast.success('Backup downloaded', 'Includes decks, cards, folders, study history and settings.');
              } catch (e) {
                toast.error('Backup failed', (e as Error).message);
              }
            }}
          >
            Export complete backup
          </Button>
          <Button
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            onClick={async () => {
              await exportAllDecks();
              toast.success('All decks exported');
            }}
          >
            Export all decks
          </Button>
          <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
            Restore from backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Choose a backup file"
            onChange={(e) => {
              void pickRestore(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <p className="text-xs text-muted">Individual decks can be exported as Foundy JSON, CSV or TXT from each deck’s menu.</p>
      </Section>

      <section aria-labelledby="danger-h" className="rounded-xl border border-danger/30 bg-surface">
        <div className="border-b border-danger/20 px-5 py-4">
          <h2 id="danger-h" className="flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Danger zone
          </h2>
        </div>
        <div className="space-y-5 p-5">
          <Row label="Reset study statistics" description="Deletes review history and sessions and resets every card to New. Decks and cards are kept.">
            <Button variant="outline" className="text-danger" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>
              Reset statistics
            </Button>
          </Row>
          <Row label="Delete all local data" description="Permanently removes every deck, card, folder, statistic and setting from this browser.">
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmWipe(true)}>
              Delete everything
            </Button>
          </Row>
        </div>
      </section>

      <Dialog
        open={!!restoreData}
        onClose={() => setRestoreData(null)}
        title="Restore from backup"
        description={restoreData?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setRestoreData(null)}>
              Cancel
            </Button>
            <Button variant={strategy === 'replace' ? 'danger' : 'primary'} disabled={!restoreData?.validation.ok} loading={restoring} onClick={doRestore}>
              {strategy === 'replace' ? 'Replace my data' : 'Merge into my data'}
            </Button>
          </>
        }
      >
        {restoreData && (
          <div className="space-y-4 text-sm">
            {restoreData.validation.ok ? (
              <>
                <div className="rounded-xl border border-success/30 bg-success/5 p-3">
                  <p className="flex items-center gap-2 font-medium text-success">
                    <Check className="h-4 w-4" aria-hidden /> Valid {restoreData.validation.kind === 'backup' ? 'Foundy backup' : 'Foundy deck file'}
                  </p>
                  <p className="mt-1 text-muted">
                    {restoreData.validation.counts.decks} decks · {restoreData.validation.counts.cards} cards
                    {restoreData.validation.kind === 'backup' && ` · ${restoreData.validation.counts.folders} folders · ${restoreData.validation.counts.reviews} reviews · ${restoreData.validation.counts.sessions} sessions`}
                  </p>
                </div>
                {restoreData.validation.warnings.map((w) => (
                  <p key={w} className="text-xs text-warning">
                    {w}
                  </p>
                ))}
                {restoreData.validation.kind === 'backup' ? (
                  <fieldset className="space-y-2">
                    <legend className="field-label">How should it be restored?</legend>
                    {(
                      [
                        ['merge', 'Merge (recommended)', 'Add the backup alongside your current data. Nothing existing is overwritten; clashing records get new IDs.'],
                        ['replace', 'Replace', 'Delete everything currently on this device, then restore the backup exactly. A safety backup of your current data is downloaded first.'],
                      ] as const
                    ).map(([v, title, desc]) => (
                      <label key={v} className={cn('flex cursor-pointer gap-3 rounded-xl border p-3', strategy === v ? 'border-accent bg-accent-soft/50' : 'border-border hover:bg-subtle')}>
                        <input type="radio" name="strategy" value={v} checked={strategy === v} onChange={() => setStrategy(v)} className="mt-1 accent-[rgb(var(--accent))]" />
                        <span>
                          <span className="block font-medium">{title}</span>
                          <span className="block text-xs text-muted">{desc}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <p className="text-muted">The deck(s) will be added as new decks, keeping their study progress.</p>
                )}
              </>
            ) : (
              <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-3">
                <p className="font-medium text-danger">This file can’t be restored</p>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {restoreData.validation.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        destructive
        title="Reset all study statistics?"
        confirmLabel="Reset statistics"
        confirmPhrase="RESET"
        loading={busy}
        description="All review history, sessions, streaks and spaced-repetition scheduling will be erased. Your decks and cards stay. This can’t be undone."
        onConfirm={async () => {
          setBusy(true);
          try {
            await resetStudyStatistics();
            toast.success('Study statistics reset');
            setConfirmReset(false);
          } finally {
            setBusy(false);
          }
        }}
      />
      <ConfirmDialog
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        destructive
        title="Delete all local data?"
        confirmLabel="Delete everything"
        confirmPhrase="DELETE"
        loading={busy}
        description="Every deck, card, folder, statistic and setting on this device will be permanently deleted. Export a backup first if you might want it back."
        onConfirm={async () => {
          setBusy(true);
          try {
            await deleteAllData();
            toast.success('All local data deleted');
            setConfirmWipe(false);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
