"use client";

import {
  Suspense,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Link2, X } from "lucide-react";
import { BodyPortal } from "@/components/ui/BodyPortal";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { BookmarkThumb } from "@/components/bookmarks/BookmarkThumb";
import { fetchLinkMetadata, type MetadataResult } from "@/lib/actions/metadata";
import { createBookmark } from "@/lib/actions/bookmarks";
import { readPref, writePref } from "@/lib/client-prefs";
import { listIdFromPath, type PaletteList } from "@/lib/commands";
import { showFreeLimitToast, upgradeHref } from "@/lib/free-limit";
import { toast } from "@/lib/toast";

/** Where the last quick add went, per viewer (this browser only). */
export const quickAddListKey = (userId: string) => `klect:quick-add-list:${userId}`;

/**
 * The pasted text as an http(s) URL, or null. Only a single token counts, so
 * pasting a sentence that happens to contain a link does not open the dialog.
 */
export function pastedUrl(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t) || t.length > 2048) return null;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

type Props = {
  url: string;
  userId: string;
  pathname: string;
  lists: Promise<PaletteList[]>;
  onClose: () => void;
};

/**
 * Paste-a-URL quick capture (lg+): a compact modal with the pasted link, a
 * list picker and the autofilled name and photo. Autofill is the same
 * `fetchLinkMetadata` call the full form makes, started on open; Save is the
 * same `createBookmark` server action a list's "New bookmark" uses (role,
 * lock and free-cap checks all happen there). Saving before autofill finishes
 * waits for it, so the bookmark gets the details either way.
 *
 * The picker offers lists the viewer can add to (collaborator or owner, not
 * locked) and defaults to the current list when on one, else the last list
 * used here, else the first. Modal dialog: focus starts on the name field, Tab
 * is held inside, Esc or the backdrop closes, and the caller restores focus.
 */
export function QuickAddDialog(props: Props) {
  const titleId = useId();
  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[14vh]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="pixel-box bg-panel text-ink flex w-full max-w-md flex-col overflow-hidden"
        >
          <div className="list-panel-head flex items-center gap-3 px-4 py-3">
            <h2 id={titleId} className="font-pixel text-primary flex-1 text-base font-semibold">
              Quick add
            </h2>
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Close"
              className="text-muted hover:text-ink cursor-pointer"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <Suspense fallback={<p className="text-muted px-4 py-6 text-sm">Loading your lists…</p>}>
            <QuickAddBody {...props} />
          </Suspense>
        </div>
      </div>
    </BodyPortal>
  );
}

function QuickAddBody({ url, userId, pathname, lists: listsPromise, onClose }: Props) {
  const router = useRouter();
  const lists = use(listsPromise).filter((l) => l.canAdd);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const autofill = useRef<Promise<MetadataResult> | null>(null);

  const [listId, setListId] = useState(() => {
    const ids = new Set(lists.map((l) => l.id));
    const current = listIdFromPath(pathname);
    if (current && ids.has(current)) return current;
    const last = readPref(quickAddListKey(userId));
    if (last && ids.has(last)) return last;
    return lists[0]?.id ?? "";
  });
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "failed">("loading");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Autofill once, on open. The promise is kept so Save can wait for it.
  useEffect(() => {
    let live = true;
    const p = fetchLinkMetadata(url).catch(
      (): MetadataResult => ({ ok: false, error: "Couldn't read that page.", sourceUrl: url }),
    );
    autofill.current = p;
    void p.then((r) => {
      if (!live) return;
      setStatus(r.ok ? "done" : "failed");
      if (!r.ok) return;
      if (r.data.title) setName((n) => (n ? n : r.data.title ?? ""));
      setImage(r.data.images[0] ?? null);
    });
    return () => {
      live = false;
    };
  }, [url]);

  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving || !listId) return;
    setSaving(true);
    const result = await (autofill.current ?? Promise.resolve(null));
    const d = result?.ok ? result.data : null;

    const fd = new FormData();
    // The typed name wins; otherwise the autofilled title; otherwise the site.
    const finalName = (nameTouched ? name : name || d?.title || "").trim() || host;
    fd.set("name", finalName);
    fd.set("urls", [d?.sourceUrl ?? url, url].filter((v, i, a) => a.indexOf(v) === i).join("\n"));
    fd.set("description", d?.description ?? "");
    for (const img of d?.images ?? []) fd.append("images", img);
    fd.set("location", d?.location ?? "");
    if (d?.location && d.latitude !== null && d.longitude !== null) {
      fd.set("latitude", String(d.latitude));
      fd.set("longitude", String(d.longitude));
    }
    if (d?.video) {
      fd.set("videoUrl", d.video.url);
      fd.set("videoType", d.video.type);
    }
    for (const tag of d?.tags ?? []) fd.append("tags", tag);

    const list = lists.find((l) => l.id === listId);
    try {
      const refusal = await createBookmark(listId, fd);
      if (refusal) {
        setSaving(false);
        showFreeLimitToast(refusal, () => router.push(upgradeHref(refusal)));
        return;
      }
    } catch {
      setSaving(false);
      toast.error("Couldn't save the bookmark. Try again.");
      return;
    }
    writePref(quickAddListKey(userId), listId);
    toast.success(`Saved to ${list?.name ?? "your list"}`, {
      action: { label: "Open", onClick: () => router.push(`/lists/${listId}`) },
    });
    router.refresh();
    onClose();
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = Array.from(
      e.currentTarget
        .closest('[role="dialog"]')
        ?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]",
        ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (lists.length === 0) {
    return (
      <div className="flex flex-col gap-3 px-4 py-4 text-sm" onKeyDown={onKeyDown}>
        <p>There is no list you can add to yet. Create a list first, then paste the link again.</p>
        <div className="flex justify-end">
          <PixelButton size="sm" variant="secondary" onClick={onClose} autoFocus>
            Close
          </PixelButton>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={save} onKeyDown={onKeyDown} className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-3">
        <BookmarkThumb
          images={image ? [image] : []}
          url={url}
          name={name || host}
          className="pixel-box-sm size-14 shrink-0"
          loading="eager"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 truncate text-sm">
            <Link2 size={14} aria-hidden className="text-muted shrink-0" />
            <span className="truncate" title={url}>
              {url}
            </span>
          </span>
          <span className="text-muted text-xs" role="status" aria-live="polite">
            {status === "loading"
              ? "Getting details from the page…"
              : status === "failed"
                ? "Couldn't read the page. You can still save it."
                : "Details filled in."}
          </span>
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">Name</span>
        <PixelInput
          ref={nameRef}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
          placeholder={status === "loading" ? "Filling in…" : host}
          maxLength={200}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">List</span>
        <select
          value={listId}
          onChange={(e) => setListId(e.target.value)}
          className="pixel-box-sm bg-panel text-ink w-full cursor-pointer px-2 py-2.5 text-base"
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.icon} {l.name}
              {l.shared ? " (shared)" : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-end gap-2">
        <PixelButton type="button" size="sm" variant="secondary" onClick={onClose}>
          Cancel
        </PixelButton>
        <PixelButton type="submit" size="sm" disabled={saving}>
          {saving ? (status === "loading" ? "Finishing details…" : "Saving…") : "Save"}
        </PixelButton>
      </div>
    </form>
  );
}
