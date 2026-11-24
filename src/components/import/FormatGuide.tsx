import { Bot, ClipboardCopy, Download, FileText } from 'lucide-react';
import { AI_PROMPT, BLANK_CSV, BLANK_TEXT, EXAMPLE_CSV, EXAMPLE_TEXT, buildDocxTemplate } from '@/lib/templates/templates';
import { copyText, downloadBlob, downloadText } from '@/lib/utils';
import { useToast } from '@/state/toast';
import { Button } from '@/components/ui/Button';

export function FormatGuide() {
  const toast = useToast();

  const copy = async (text: string, what: string) => {
    if (await copyText(text)) toast.success(`${what} copied`, 'Paste it wherever you need it.');
    else toast.error('Copy failed', 'Your browser blocked clipboard access. Select the text and copy it manually.');
  };

  const docx = async (kind: 'blank' | 'example') => {
    try {
      downloadBlob(await buildDocxTemplate(kind), `foundy-template-${kind}.docx`);
    } catch (e) {
      toast.error('Could not create the DOCX template', (e as Error).message);
    }
  };

  return (
    <aside className="space-y-4" aria-label="QuickImport format guide">
      <section className="panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-accent" aria-hidden /> QuickImport format
        </h2>
        <p className="mt-1 text-sm text-muted">One card per block. Leave a blank line between cards.</p>
        <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-border bg-subtle p-3 font-mono text-[12px] leading-relaxed text-fg">
          {`QUESTION: What is osmosis?
ANSWER: The net movement of water
molecules through a partially
permeable membrane.

QUESTION: What is the function
of a ribosome?
ANSWER: Protein synthesis.
HINT: Think about proteins.
EXPLANATION: Ribosomes translate
mRNA into polypeptide chains.
TAGS: Biology, Cells`}
        </pre>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          <li>• Markers are case-insensitive; <code className="font-mono">Q:</code> / <code className="font-mono">A:</code> also work.</li>
          <li>• Questions and answers can span several lines.</li>
          <li>• Optional: HINT, EXPLANATION, TAGS, ALIASES (accepted answers, separated by |).</li>
          <li>• Markdown and maths such as <code className="font-mono">$F = ma$</code> are kept.</li>
        </ul>
        <Button variant="soft" size="sm" className="mt-4 w-full" icon={<ClipboardCopy className="h-3.5 w-3.5" />} onClick={() => copy(EXAMPLE_TEXT, 'Template')}>
          Copy template
        </Button>
      </section>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Download className="h-4 w-4 text-accent" aria-hidden /> Templates
        </h2>
        <div className="mt-3 grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-2 text-sm">
          <span />
          <span className="text-xs font-medium text-muted">Blank</span>
          <span className="text-xs font-medium text-muted">Example</span>
          {(
            [
              ['TXT', () => downloadText(BLANK_TEXT, 'foundy-template-blank.txt'), () => downloadText(EXAMPLE_TEXT, 'foundy-template-example.txt')],
              ['DOCX', () => docx('blank'), () => docx('example')],
              ['CSV', () => downloadText(BLANK_CSV, 'foundy-template-blank.csv', 'text/csv'), () => downloadText(EXAMPLE_CSV, 'foundy-template-example.csv', 'text/csv')],
            ] as const
          ).map(([label, blank, example]) => (
            <div key={label} className="contents">
              <span className="w-12 font-mono text-xs font-semibold">{label}</span>
              <Button variant="outline" size="sm" onClick={blank} aria-label={`Download blank ${label} template`}>
                Blank
              </Button>
              <Button variant="outline" size="sm" onClick={example} aria-label={`Download example ${label} template`}>
                Example
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-4 w-4 text-accent" aria-hidden /> Use any AI assistant
        </h2>
        <p className="mt-1 text-sm text-muted">
          Copy this prompt into ChatGPT, Claude, Gemini or similar together with your notes, then paste the reply here. Foundy never sends your material anywhere — and always check AI-written cards for accuracy.
        </p>
        <Button variant="soft" size="sm" className="mt-3 w-full" icon={<ClipboardCopy className="h-3.5 w-3.5" />} onClick={() => copy(AI_PROMPT, 'AI prompt')}>
          Copy AI prompt
        </Button>
      </section>
    </aside>
  );
}
