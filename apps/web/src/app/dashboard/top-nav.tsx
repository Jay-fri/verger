"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconHome, IconClipboardList, IconLibrary, IconSettings, IconLogout, type Icon } from "@tabler/icons-react";
import { signOutAction } from "@/lib/auth/actions";
import { RoleBadge } from "@/components/ui";

type NavItem = { href: string; label: string; icon: Icon };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: IconHome },
  { href: "/dashboard/prep", label: "Prep", icon: IconClipboardList },
  { href: "/dashboard/library", label: "Library", icon: IconLibrary },
  { href: "/dashboard/settings", label: "Settings", icon: IconSettings },
];

// "Home" is only exactly active at /dashboard itself — every other item is
// active on itself and any of its sub-routes (e.g. /dashboard/prep/[id]).
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-accent-gold/15 text-accent-gold"
                : "text-text-secondary hover:bg-surface hover:text-text-primary"
            }`}
          >
            <Icon size={17} stroke={1.75} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-surface"
      >
        <span className="bg-accent-gold text-accent-gold-ink flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
          {initialOf(name)}
        </span>
        <span className="hidden text-sm font-medium text-text-primary sm:inline">{name}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="border-border bg-surface absolute top-full right-0 z-50 mt-2 w-56 rounded-xl border p-1.5 shadow-lg"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-text-primary">{name}</p>
            <p className="truncate text-xs text-text-secondary">{email}</p>
            <div className="mt-1.5">
              <RoleBadge role={role} />
            </div>
          </div>
          <div className="border-border my-1 border-t" />
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="hover:bg-danger/10 hover:text-danger flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text-secondary"
            >
              <IconLogout size={16} stroke={1.75} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
