import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

type DialogProps = {
  "data-qa"?: string;
  ariaDescribedBy?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  backdropClassName: string;
  children: ReactNode;
  className: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
};

type BackgroundState = {
  element: HTMLElement;
  ariaHidden: string | null;
  inert: boolean;
};

export function Dialog({
  "data-qa": dataQa,
  ariaDescribedBy,
  ariaLabel,
  ariaLabelledBy,
  backdropClassName,
  children,
  className,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  onClose
}: DialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const [portalHost] = useState(() => {
    if (typeof document === "undefined") {
      return null;
    }
    const host = document.createElement("div");
    host.className = "app-dialog-portal";
    host.dataset.appDialogPortal = "true";
    return host;
  });

  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!portalHost || typeof document === "undefined") {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.appendChild(portalHost);
    document.body.style.overflow = "hidden";

    const backgroundStates = Array.from(document.body.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child !== portalHost)
      .map<BackgroundState>((element) => ({
        element,
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: element.hasAttribute("inert")
      }));

    for (const state of backgroundStates) {
      state.element.setAttribute("inert", "");
      state.element.setAttribute("aria-hidden", "true");
    }

    const focusTimer = window.setTimeout(() => {
      const initialFocus = initialFocusRef?.current ?? getFocusableElements(dialogRef.current)[0];
      (initialFocus ?? dialogRef.current)?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      for (const state of backgroundStates) {
        if (!state.inert) {
          state.element.removeAttribute("inert");
        }
        if (state.ariaHidden === null) {
          state.element.removeAttribute("aria-hidden");
        } else {
          state.element.setAttribute("aria-hidden", state.ariaHidden);
        }
      }
      document.body.style.overflow = previousOverflow;
      portalHost.remove();
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [initialFocusRef, portalHost]);

  if (!portalHost) {
    return null;
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (closeOnEscape) {
        onCloseRef.current();
      }
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className={backdropClassName}
      data-app-dialog-backdrop="true"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onCloseRef.current();
        }
      }}
    >
      <section
        ref={dialogRef}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className={className}
        data-qa={dataQa}
        role="dialog"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>,
    portalHost
  );
}

export function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[inert]") &&
      !element.hasAttribute("hidden")
  );
}
