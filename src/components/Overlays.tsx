import { useEffect, useRef, type ReactNode } from "react";
import { useLanguage } from "../i18n";
import { APP_VERSION, CHANGELOG_ID, PHASE2_CHANGES } from "../lib/preferences";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dialog-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="dialog-backdrop" type="button" aria-label={t("Close")} onClick={onClose} />
      <div className="dialog-card" ref={ref}>
        <div className="dialog-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t("Close")}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: "?", label: "Show this shortcut sheet" },
  { keys: "/", label: "Focus global search" },
  { keys: "V", label: "Toggle voice control" },
  { keys: "T", label: "Toggle light / dark theme" },
  { keys: "Alt + 1…9, 0", label: "Jump to a workspace module" },
  { keys: "Esc", label: "Close an open panel or dialog" },
];

export function ShortcutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onClose={onClose} title={t("Keyboard shortcuts")}>
      <p className="muted-text">{t("Shortcuts are ignored while typing in a field.")}</p>
      <div className="shortcut-grid">
        {SHORTCUTS.map((item) => (
          <div className="shortcut-row" key={item.keys}>
            <kbd>{item.keys}</kbd>
            <span>{t(item.label)}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function WhatsNewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onClose={onClose} title={t("What's new in {version}", { version: APP_VERSION })}>
      <p className="muted-text">{t("Phase 2 adds deeper workflows while your local data and signed APK stay untouched.")}</p>
      <ul className="changelog-list">
        {PHASE2_CHANGES.map((change) => <li key={change}>{t(change)}</li>)}
      </ul>
      <div className="actions">
        <button className="primary" type="button" onClick={onClose}>{t("Got it")}</button>
      </div>
      <span className="dialog-meta">{CHANGELOG_ID}</span>
    </Dialog>
  );
}

export function ModuleGuideDialog({
  open,
  onClose,
  title,
  description,
  points,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  points: string[];
}) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="muted-text">{description}</p>
      <ul className="changelog-list">
        {points.map((point) => <li key={point}>{t(point)}</li>)}
      </ul>
      <div className="actions">
        <button className="primary" type="button" onClick={onClose}>{t("Close")}</button>
      </div>
    </Dialog>
  );
}

export function InstallPrompt({
  visible,
  onInstall,
  onDismiss,
}: {
  visible: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLanguage();
  if (!visible) return null;
  return (
    <div className="install-prompt" role="status">
      <strong>{t("Install D0K@N Global")}</strong>
      <span>{t("Add this workspace to your home screen for offline access.")}</span>
      <div className="actions">
        <button className="small primary" type="button" onClick={onInstall}>{t("Install")}</button>
        <button className="small ghost" type="button" onClick={onDismiss}>{t("Not now")}</button>
      </div>
    </div>
  );
}
