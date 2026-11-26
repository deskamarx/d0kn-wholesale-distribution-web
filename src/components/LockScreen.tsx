import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLanguage } from "../i18n";
import { useToast } from "./Feedback";
import {
  clearLocalAppData,
  hasPlatformAuthenticator,
  verifyPin,
  verifyPlatformCredential,
} from "../lib/security";

export default function LockScreen({
  onUnlock,
  onReset,
}: {
  onUnlock: () => void;
  onReset: () => void;
}) {
  const { t } = useLanguage();
  const { notify } = useToast();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deviceAvailable, setDeviceAvailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    let active = true;
    void hasPlatformAuthenticator().then((available) => {
      if (active) setDeviceAvailable(available);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const focusables = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deviceAvailable]);

  const unlockWithPin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!pin) {
      setError(t("Enter your PIN to continue."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const valid = await verifyPin(pin);
      if (valid) {
        setPin("");
        notify(t("Workspace unlocked"), { tone: "success" });
        onUnlock();
      } else {
        setError(t("Incorrect PIN. Try again."));
        notify(t("Incorrect PIN. Try again."), { tone: "danger" });
      }
    } catch {
      setError(t("Local unlock is unavailable in this browser."));
      notify(t("Local unlock is unavailable in this browser."), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const unlockWithDevice = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const valid = await verifyPlatformCredential();
      if (valid) {
        notify(t("Workspace unlocked"), { tone: "success" });
        onUnlock();
      } else {
        setError(t("Device unlock was not completed."));
        notify(t("Device unlock was not completed."), { tone: "danger" });
      }
    } catch {
      setError(t("Device unlock is unavailable in this browser."));
      notify(t("Device unlock is unavailable in this browser."), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const resetLocalData = () => {
    const message = t(
      "Clear this browser's workspace and remove the PIN? This cannot be undone."
    );
    if (!window.confirm(message)) return;
    clearLocalAppData();
    setPin("");
    setError("");
    notify(t("Local workspace and PIN cleared"), { tone: "success" });
    onReset();
  };

  return (
    <div
      className="dialog-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-title"
      style={{ zIndex: 200, background: "rgba(8, 14, 35, 0.74)" }}
    >
      <div aria-hidden="true" style={{ position: "absolute", inset: 0 }} />
      <div className="dialog-card" ref={cardRef} style={{ width: "min(420px, 100%)", padding: 24, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 18 }}>
          <div className="brand-mark" style={{ width: 52, height: 52, flexBasis: 52, borderRadius: 16 }}>
            D0K
          </div>
          <div style={{ display: "flex", flexDirection: "column", textAlign: "left", minWidth: 0 }}>
            <strong style={{ fontSize: 16, color: "var(--text)", lineHeight: 1.25 }}>
              {t("D0K@N Global Distribution")}
            </strong>
            <span className="muted-text" style={{ margin: 0, fontSize: 11 }}>
              {t("Wholesale · Import · Logistics")}
            </span>
          </div>
        </div>

        <h2 id="lock-title" style={{ margin: "0 0 8px", fontSize: 20 }}>
          {t("Workspace locked")}
        </h2>
        <p className="muted-text" style={{ marginBottom: 18 }}>
          {t("Enter your local PIN to open this workspace. Records never leave this device.")}
        </p>

        <form onSubmit={unlockWithPin} noValidate>
          <div className="field" style={{ textAlign: "left" }}>
            <label htmlFor="lock-pin">{t("Local PIN")}</label>
            <input
              ref={inputRef}
              id="lock-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              pattern="[0-9]*"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, "").slice(0, 12));
                if (error) setError("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby="lock-message"
              placeholder={t("4 to 12 digits")}
            />
          </div>

          <div id="lock-message" role={error ? "alert" : undefined} aria-live="polite">
            {error && (
              <p style={{ margin: "0 0 12px", color: "var(--danger)", fontSize: 12 }}>{error}</p>
            )}
          </div>

          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? t("Unlocking…") : t("Unlock")}
            </button>
            {deviceAvailable && (
              <button type="button" disabled={busy} onClick={unlockWithDevice}>
                {t("Use device unlock")}
              </button>
            )}
          </div>
        </form>

        <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <button type="button" className="link-button" onClick={resetLocalData}>
            {t("Forgot PIN? Reset local data")}
          </button>
        </div>
        <span className="dialog-meta">{t("PIN verification happens on this device only.")}</span>
      </div>
    </div>
  );
}
