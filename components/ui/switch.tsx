"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Accessible switch (role="switch"). Works inside forms via a hidden input. */
export function Switch({
  checked,
  onCheckedChange,
  name,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange?: (v: boolean) => void;
  name?: string;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-primary" : "bg-input",
          className,
        )}
      >
        <span className={cn("inline-block h-6 w-6 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
      {name ? <input type="hidden" name={name} value={checked ? "on" : "off"} /> : null}
    </>
  );
}
