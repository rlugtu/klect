"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createList } from "@/lib/actions/lists";
import { showFreeLimitToast, upgradeHref } from "@/lib/free-limit";
import { ListForm } from "./ListForm";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";

/**
 * "New list" button that reveals an inline create form. `defaultOpen` starts it
 * open (the desktop sidebar's "+" links to `/?newList=1` to land on it ready).
 */
export function CreateListPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);

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
      <ListForm
        action={async (formData) => {
          // Success redirects, so a returned value only ever means the free list
          // cap refused it. The toast carries an Upgrade action rather than
          // navigating on its own, so the half-filled form survives the refusal.
          const refusal = await createList(formData);
          if (refusal) {
            showFreeLimitToast(refusal, () => router.push(upgradeHref(refusal)));
          }
        }}
        submitLabel="Create"
        showVisibility
      />
    </PixelCard>
  );
}
