"use client";

import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

// Opens on hover, focus and click/tap. Hover and focus are timer-free: leaving
// closes it unless a click pinned it open.
export function InfoPopover({
  sections,
}: {
  sections: Array<{ title: string; text: string }>;
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const hover = (on: boolean) => {
    if (!pinned.current) setOpen(on);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        pinned.current = false; // Escape / outside click
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="About this advice"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -my-1 ml-1 inline-flex size-6 items-center justify-center rounded-full align-middle focus-visible:ring-3 focus-visible:outline-none"
          onClick={(e) => {
            e.preventDefault(); // skip Radix's toggle: hover/focus already opened it
            pinned.current = !pinned.current;
            setOpen(pinned.current);
          }}
          onMouseEnter={() => hover(true)}
          onMouseLeave={() => hover(false)}
          onFocus={() => hover(true)}
          onBlur={() => hover(false)}
        >
          <HugeiconsIcon icon={InformationCircleIcon} size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="max-w-[min(20rem,calc(100vw-2rem))] space-y-3"
        onMouseEnter={() => hover(true)}
        onMouseLeave={() => hover(false)}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {sections.map((s) => (
          <div key={s.title}>
            <h4 className="font-semibold">{s.title}</h4>
            <p className="text-muted-foreground">{s.text}</p>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
