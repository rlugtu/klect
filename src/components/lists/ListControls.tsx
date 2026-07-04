"use client";

import { useState, type ReactNode } from "react";
import { ListForm, type ListDefaults } from "./ListForm";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { Pencil, Users, X } from "lucide-react";

function PanelHeader({
  title,
  onClose,
}: {
  title?: string;
  onClose: () => void;
}) {
  return (
    <div
      className={`flex items-center ${title ? "justify-between" : "justify-end"}`}
    >
      {title && <h2 className="text-sm">{title}</h2>}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="text-muted hover:text-danger cursor-pointer text-xl leading-none"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Owner/collaborator list controls: an Edit trigger (left) and a Share trigger
 * (right). Delete lives inside the edit panel, so it's only shown while editing.
 * Both panels expand full-width below the trigger row.
 */
export function ListControls({
  editAction,
  defaults,
  deleteAction,
  shareChildren,
}: {
  editAction: (formData: FormData) => void | Promise<void>;
  defaults: ListDefaults;
  deleteAction?: (formData: FormData) => void | Promise<void>;
  shareChildren?: ReactNode;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PixelButton
          variant="secondary"
          size="xs"
          onClick={() => setEditOpen((o) => !o)}
        >
          {editOpen ? <X size={14} aria-hidden /> : <Pencil size={14} aria-hidden />}
          {editOpen ? "Close" : "Edit"}
        </PixelButton>
        {shareChildren && (
          <PixelButton
            variant="secondary"
            size="xs"
            onClick={() => setShareOpen((o) => !o)}
          >
            {shareOpen ? <X size={14} aria-hidden /> : <Users size={14} aria-hidden />}
            {shareOpen ? "Cancel" : "Members"}
          </PixelButton>
        )}
      </div>

      {editOpen && (
        <PixelCard className="flex flex-col gap-4">
          <PanelHeader onClose={() => setEditOpen(false)} />
          <ListForm
            action={editAction}
            defaults={defaults}
            submitLabel="Save"
          />
          {deleteAction && (
            <div className="border-border flex flex-col gap-2 border-t-2 pt-4">
              <span className="font-pixel text-muted text-sm uppercase">
                Danger zone
              </span>
              <ConfirmDeleteButton
                action={deleteAction}
                label="Delete list"
                confirmText="Delete this list?"
              />
            </div>
          )}
        </PixelCard>
      )}

      {shareOpen && shareChildren && (
        <PixelCard className="flex flex-col gap-5">
          <PanelHeader title="Sharing" onClose={() => setShareOpen(false)} />
          {shareChildren}
        </PixelCard>
      )}
    </div>
  );
}
