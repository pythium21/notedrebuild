import type { BlockType } from '@/lib/pages';

export type BlockOptionType = BlockType | 'sub-page' | 'link-page';

export const BLOCK_OPTIONS: { type: BlockOptionType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text', icon: '📝' },
  { type: 'heading', label: 'Heading', icon: '🔠' },
  { type: 'checklist', label: 'Checklist', icon: '☑️' },
  { type: 'bullet', label: 'Bullet', icon: '•' },
  { type: 'sub-page', label: 'Sub-page', icon: '📄' },
  { type: 'link-page', label: 'Link to page', icon: '🔗' },
];

export function BlockMenu({
  onSelect,
  onClose,
  busy,
}: {
  onSelect: (type: BlockOptionType) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <>
      <div className="block-menu-scrim" onClick={onClose} />
      <div className="block-menu">
        <div className="block-menu__title">Turn into</div>
        {BLOCK_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            type="button"
            className="block-menu__option"
            onClick={() => onSelect(opt.type)}
            disabled={busy}
          >
            <span aria-hidden>{opt.icon}</span> {opt.label}
          </button>
        ))}
      </div>
    </>
  );
}
