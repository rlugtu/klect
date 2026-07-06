"use client";

import { useState } from "react";
import { createList } from "@/lib/actions/lists";
import { ListForm } from "./ListForm";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";

/** "New list" button that reveals an inline create form. */
export function CreateListPanel() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <PixelButton onClick={() => setOpen(true)}>＋ New list</PixelButton>
    );
  }

  return (
    <PixelCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm">New list</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="text-muted hover:text-danger cursor-pointer text-lg leading-none"
        >
          ×
        </button>
      </div>
      <ListForm action={createList} submitLabel="Create" />
    </PixelCard>
  );
}
