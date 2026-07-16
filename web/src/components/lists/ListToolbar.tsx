"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ListForm, type ListDefaults } from "./ListForm";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelInput } from "@/components/ui/PixelInput";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Copy, EllipsisVertical, Pencil, Trash2, Users } from "lucide-react";

type Panel = "edit" | "duplicate" | "members" | "clear" | null;

type ToolbarProps = {
  sourceName: string;
  /** Collaborator+ — may edit list details. */
  canEdit: boolean;
  /** Owner — may manage members. */
  canManageMembers: boolean;
  /** Owner — may clear all bookmarks. */
  canClear: boolean;
  editAction: (formData: FormData) => void | Promise<void>;
  defaults: ListDefaults;
  deleteAction?: (formData: FormData) => void | Promise<void>;
  duplicateAction: (formData: FormData) => void | Promise<void>;
  clearAction: (formData: FormData) => void | Promise<void>;
  /** Owner-only public/private control, rendered inside the edit panel. */
  visibilityChildren?: ReactNode;
  membersChildren?: ReactNode;
};

type ToolbarState = ToolbarProps & {
  panel: Panel;
  openPanel: (next: Panel) => void;
  closePanel: () => void;
};

const ToolbarCtx = createContext<ToolbarState | null>(null);

function useToolbar() {
  const ctx = useContext(ToolbarCtx);
  if (!ctx) throw new Error("ListToolbar parts must be used within <ListToolbar>");
  return ctx;
}

/**
 * Provider for the single-list toolbar. Renders {@link ListToolbarTriggers}
 * (the Members button + ⋮ menu — placed beside the title) and
 * {@link ListToolbarPanels} (the full-width expanding panels) as separate slots
 * sharing one open/close state, so the menu can sit inline while its panels
 * flow full width. Consolidates the former ListControls + ListActions.
 */
export function ListToolbar({
  children,
  ...props
}: ToolbarProps & { children: ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  const openPanel = (next: Panel) =>
    setPanel((cur) => (cur === next ? null : next));
  const closePanel = () => setPanel(null);

  return (
    <ToolbarCtx.Provider value={{ ...props, panel, openPanel, closePanel }}>
      {children}
    </ToolbarCtx.Provider>
  );
}

export function ListToolbarTriggers() {
  const { canEdit, canManageMembers, canClear, panel, openPanel } = useToolbar();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the ⋮ menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function pick(next: Panel) {
    setMenuOpen(false);
    openPanel(next);
  }

  const menuItem =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm cursor-pointer";

  return (
    <div className="flex items-center gap-2">
      {canManageMembers && (
        <PixelButton
          variant="secondary"
          size="xs"
          aria-label="Members"
          aria-expanded={panel === "members"}
          onClick={() => openPanel("members")}
        >
          <Users size={14} aria-hidden />
          Members
        </PixelButton>
      )}

      <div className="relative" ref={menuRef}>
        <PixelButton
          variant="secondary"
          size="xs"
          aria-label="List actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <EllipsisVertical size={14} aria-hidden />
        </PixelButton>

        {menuOpen && (
          <div
            role="menu"
            className="pixel-box bg-panel absolute right-0 z-20 mt-2 w-48 overflow-hidden p-1"
          >
            {canEdit && (
              <button
                type="button"
                role="menuitem"
                onClick={() => pick("edit")}
                className={`${menuItem} hover:bg-primary/15`}
              >
                <Pencil size={14} aria-hidden />
                Edit list
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => pick("duplicate")}
              className={`${menuItem} hover:bg-primary/15`}
            >
              <Copy size={14} aria-hidden />
              Duplicate list
            </button>
            {canClear && (
              <>
                <div className="border-border my-1 border-t-2" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => pick("clear")}
                  className={`${menuItem} text-danger hover:bg-danger/10`}
                >
                  <Trash2 size={14} aria-hidden />
                  Clear list
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PanelHeader({ title }: { title: string }) {
  const { closePanel } = useToolbar();
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm">{title}</h2>
      <button
        type="button"
        aria-label="Close"
        onClick={closePanel}
        className="text-muted hover:text-danger cursor-pointer text-xl leading-none"
      >
        ×
      </button>
    </div>
  );
}

export function ListToolbarPanels() {
  const {
    sourceName,
    panel,
    editAction,
    defaults,
    deleteAction,
    duplicateAction,
    clearAction,
    visibilityChildren,
    membersChildren,
  } = useToolbar();

  if (!panel) return null;
  const defaultName = `Copy of ${sourceName}`.slice(0, 30);

  return (
    <div>
      {panel === "edit" && (
        <PixelCard className="flex flex-col gap-4">
          <PanelHeader title="Edit list" />
          <ListForm action={editAction} defaults={defaults} submitLabel="Save" />
          {visibilityChildren && (
            <div className="border-border flex flex-col gap-2 border-t-2 pt-4">
              <span className="font-pixel text-muted text-sm uppercase">
                Visibility
              </span>
              {visibilityChildren}
            </div>
          )}
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

      {panel === "duplicate" && (
        <PixelCard className="flex flex-col gap-4">
          <PanelHeader title="Duplicate list" />
          <form action={duplicateAction} className="flex flex-col gap-2">
            <FieldLabel>New list name</FieldLabel>
            <p className="text-muted text-xs">
              Makes a private copy you own with all the bookmarks — members,
              polls, and comments are not carried over.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">New list name</span>
              <PixelInput
                name="name"
                defaultValue={defaultName}
                placeholder="Copy of…"
                required
                maxLength={30}
              />
            </label>
            <SubmitButton label="Duplicate list" pendingLabel="Duplicating…" />
          </form>
        </PixelCard>
      )}

      {panel === "clear" && (
        <PixelCard className="flex flex-col gap-3">
          <PanelHeader title="Clear list" />
          <p className="text-muted text-xs">
            Removes every bookmark in this list. The list itself stays.
          </p>
          <ConfirmDeleteButton
            action={clearAction}
            label="Clear all bookmarks"
            confirmText="Delete all bookmarks in this list?"
          />
        </PixelCard>
      )}

      {panel === "members" && membersChildren && (
        <PixelCard className="flex flex-col gap-5">
          <PanelHeader title="Members" />
          {membersChildren}
        </PixelCard>
      )}
    </div>
  );
}
