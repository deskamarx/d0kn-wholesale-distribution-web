import type { JSX } from "react";

export type NavIconName =
  | "dashboard"
  | "intelligence"
  | "analytics"
  | "products"
  | "suppliers"
  | "imports"
  | "shipments"
  | "warehouse"
  | "customers"
  | "quotations"
  | "orders"
  | "invoices"
  | "payments"
  | "compliance"
  | "search"
  | "settings"
  | "more"
  | "device";

interface Props {
  name: NavIconName | string;
  size?: number;
}

function paths(name: string): JSX.Element {
  switch (name) {
    case "dashboard":
      return (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      );
    case "intelligence":
      return (
        <>
          <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z" />
          <path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
        </>
      );
    case "analytics":
      return (
        <>
          <path d="M4 20V4M4 20h16" />
          <path d="M8 17v-5M12 17V7M16 17v-8M20 17v-3" />
        </>
      );
    case "products":
      return (
        <>
          <path d="M12 2 3 7v10l9 5 9-5V7z" />
          <path d="m3 7 9 5 9-5" />
          <path d="M12 12v10" />
        </>
      );
    case "suppliers":
      return (
        <>
          <path d="M3 21h18" />
          <path d="M5 21V9l5 3V9l5 3V5h4v16" />
          <path d="M8 6h2M8 10h2M17 9h1M17 13h1" />
        </>
      );
    case "imports":
      return (
        <>
          <path d="M3 17l3 3 3-3M6 20V10" />
          <path d="M9 13h5a5 5 0 0 0 0-10h-2" />
          <path d="M14 6l-2-2M14 6l-2 2" />
          <path d="M3 10h6v3H3z" />
        </>
      );
    case "shipments":
      return (
        <>
          <path d="M3 7h11v10H3z" />
          <path d="M14 10h4l3 3v4h-7z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </>
      );
    case "warehouse":
      return (
        <>
          <path d="M3 21V8l9-5 9 5v13" />
          <path d="M3 21h18" />
          <path d="M7 21v-8h10v8" />
          <path d="M7 16h10" />
        </>
      );
    case "customers":
      return (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.5a3 3 0 0 1 0 5.5" />
          <path d="M17 14a5 5 0 0 1 3.5 4.8" />
        </>
      );
    case "quotations":
      return (
        <>
          <path d="M5 3h14v18l-3-2-4 2-4-2-3 2z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </>
      );
    case "orders":
      return (
        <>
          <path d="M6 2h9l4 4v16H6z" />
          <path d="M15 2v5h4" />
          <path d="M9 12h6M9 16h4" />
        </>
      );
    case "invoices":
      return (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h4" />
        </>
      );
    case "payments":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
        </>
      );
    case "compliance":
      return (
        <>
          <path d="M12 2 4 5v6c0 5 3.4 9.2 8 11 4.6-1.8 8-6 8-11V5z" />
          <path d="m9 12 2 2 4-4" />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </>
      );
    case "settings":
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2.8 2.8-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21h-4v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1L4.2 17l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3v-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8L4.2 7 7 4.2l.1.1a1.6 1.6 0 0 0 1.8.3A1.6 1.6 0 0 0 10 3.1V3h4v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1L19.8 7l-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1H21v4h-.1a1.6 1.6 0 0 0-1.5 1z" />
        </>
      );
    case "more":
      return (
        <>
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </>
      );
    case "device":
      return (
        <>
          <rect x="5" y="2" width="14" height="20" rx="3" />
          <path d="M10 18h4" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="8" />;
  }
}

export default function NavIcon({ name, size = 20 }: Props) {
  return (
    <svg
      className="nav-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths(name)}
    </svg>
  );
}
