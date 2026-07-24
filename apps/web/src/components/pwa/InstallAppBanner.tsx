"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "makyschool-pwa-install-dismissed";

function isIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua);
  return isIos && isSafari;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

/** Soft prompt: Chromium install, or iOS Add to Home Screen hint. */
export function InstallAppBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    if (isIosSafari()) {
      setShowIosHint(true);
      setVisible(true);
      return;
    }

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  function dismiss() {
    setVisible(false);
    setDeferred(null);
    setShowIosHint(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center p-4 sm:justify-end">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-theme bg-theme-surface p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-theme-accent-muted text-theme-accent">
            <Download className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-theme-primary">Install MakySchool</p>
            {showIosHint ? (
              <p className="mt-1 text-xs leading-relaxed text-theme-muted">
                Tap <Share className="inline h-3.5 w-3.5 align-text-bottom" /> Share, then{" "}
                <span className="font-medium text-theme-primary">Add to Home Screen</span> to use
                MakySchool like an app.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-theme-muted">
                Add MakySchool to your home screen or desktop for faster access.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {!showIosHint ? (
                <button type="button" className="ms-btn-primary text-sm" onClick={() => void install()}>
                  Install
                </button>
              ) : null}
              <button type="button" className="ms-btn-ghost text-sm" onClick={dismiss}>
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-theme-muted hover:bg-nav-hover hover:text-theme-primary"
            aria-label="Dismiss"
            onClick={dismiss}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
