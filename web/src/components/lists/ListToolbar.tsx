"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ListForm, type ListDefaults } from "./ListForm";
import { showFreeLimitToast, upgradeHref } from "@/lib/free-limit";
import type { CappedCreateResult } from "@/lib/core/entitlements";
import { BookmarkForm } from "@/components/bookmarks/BookmarkForm";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { LockedExplainer } from "@/components/entitlements/LockedState";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelCard } from "@/components/ui/PixelCard";
import { PixelInput } from "@/components/ui/PixelInput";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Copy, EllipsisVertical, Lock, Pencil, Plus, Trash2 } from "lucide-react";

type Panel = "create" | "edit" | "duplicate" | "clear" | null;

/** Bookmark-create data threaded to the toolbar's "New bookmark" panel (collaborator+). */
export type CreateBookmarkProps = {
  /**
   * `createBookmark` from lib/actions/bookmarks, list id already bound. Resolves
   * to the free-tier refusal instead of throwing when the cap is hit — hence the
   * return value the other toolbar actions don't have.
   */
  action: (formData: FormData) => Promise<CappedCreateResult>;
  tagSuggestions: string[];
  listTags: string[];
  tagColors: Record<string, string>;
};

type ToolbarProps = {
  sourceName: string;
  /** Collaborator+ — may edit list details. */
  canEdit: boolean;
  /**
   * The list is locked (free-tier downgrade): `core.updateList` refuses the edit,
   * so the menu says "Locked list" instead of "Edit list" and its panel explains
   * the state rather than showing a form whose Save would throw. The panel is
   * still reachable because delete and visibility are not taken away by a lock.
   */
  locked?: boolean;
  /** Owner — may clear all bookmarks. */
  canClear: boolean;
  editAction: (formData: FormData) => void | Promise<void>;
  defaults: ListDefaults;
  deleteAction?: (formData: FormData) => void | Promise<void>;
  /**
   * `duplicateList` from lib/actions/lists, source list id already bound.
   * Duplicating creates one owned list plus a copy of every bookmark in the
   * source, so either free cap can refuse it, hence the return value the other
   * destructive toolbar actions don't have.
   */
  duplicateAction: (formData: FormData) => Promise<CappedCreateResult>;
  clearAction: (formData: FormData) => void | Promise<void>;
  /** Owner-only public/private control, rendered inside the edit panel. */
  visibilityChildren?: ReactNode;
  /** Collaborator+ — new-bookmark form data; when set, a louder "New bookmark" trigger shows. */
  createBookmark?: CreateBookmarkProps;
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
 * (the New bookmark button + ⋮ menu — placed beside the title) and
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

/**
 * The toolbar trigger row placed beside the list title: a louder "New bookmark" button
 * (collaborator+), an optional caller-supplied slot (the chat launcher), then the ⋮ menu.
 * The New bookmark button comes first, before the actions menu. (Members moved to a tab.)
 */
export function ListToolbarTriggers({ slot }: { slot?: ReactNode } = {}) {
  const { canEdit, canClear, createBookmark, locked, panel, openPanel } =
    useToolbar();
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
      {createBookmark && (
        <PixelButton
          variant="primary"
          size="xs"
          aria-label="New bookmark"
          aria-expanded={panel === "create"}
          onClick={() => openPanel("create")}
        >
          <Plus size={14} aria-hidden />
          New bookmark
        </PixelButton>
      )}

      {slot}

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
                className={`${menuItem} hover:bg-primary/15 ${
                  locked ? "text-muted" : ""
                }`}
              >
                {locked ? (
                  <>
                    <Lock size={14} aria-hidden />
                    Locked list
                  </>
                ) : (
                  <>
                    <Pencil size={14} aria-hidden />
                    Edit list
                  </>
                )}
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
  const router = useRouter();
  const {
    sourceName,
    panel,
    locked,
    canClear,
    editAction,
    defaults,
    deleteAction,
    duplicateAction,
    clearAction,
    visibilityChildren,
    createBookmark,
    closePanel,
  } = useToolbar();

  if (!panel) return null;
  const defaultName = `Copy of ${sourceName}`.slice(0, 30);

  return (
    <div>
      {panel === "create" && createBookmark && (
        <PixelCard className="flex flex-col gap-4">
          <PanelHeader title="New bookmark" />
          <BookmarkForm
            action={async (formData) => {
              const refusal = await createBookmark.action(formData);
              if (refusal) {
                // Cap hit: keep the panel (and the typed-in bookmark) open, and
                // offer the paywall from the toast rather than navigating away
                // from a form the user just filled in.
                showFreeLimitToast(refusal, () =>
                  router.push(upgradeHref(refusal)),
                );
                return;
              }
              closePanel();
              // Called from inside this client wrapper, the action's revalidatePath
              // doesn't reach the router, so the new card would otherwise only show
              // up on the next navigation.
              router.refresh();
            }}
            submitLabel="Create"
            tagSuggestions={createBookmark.tagSuggestions}
            existingTags={createBookmark.listTags}
            tagColors={createBookmark.tagColors}
          />
        </PixelCard>
      )}

      {panel === "edit" && (
        <PixelCard className="flex flex-col gap-4">
          <PanelHeader title={locked ? "List locked" : "Edit list"} />
          {locked ? (
            // No form at all rather than a disabled one: everything in it would
            // be refused. `canClear` is the owner flag (see ToolbarProps), and
            // only the owner can lift the lock, so only they get the upgrade CTA.
            <LockedExplainer kind="list" canUpgrade={canClear} />
          ) : (
            <ListForm action={editAction} defaults={defaults} submitLabel="Save" />
          )}
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
          <form
            action={async (formData) => {
              // Success redirects to the new copy, so a returned value only ever
              // means a free cap refused it. Same treatment as the other three
              // capped create paths: say why, and offer the way out.
              const refusal = await duplicateAction(formData);
              if (refusal) {
                showFreeLimitToast(refusal, () =>
                  router.push(upgradeHref(refusal)),
                );
              }
            }}
            className="flex flex-col gap-2"
          >
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
    </div>
  );
}
