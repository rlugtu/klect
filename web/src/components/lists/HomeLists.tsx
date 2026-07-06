"use client";

import { useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import type { ListCardData } from "@/lib/types";
import { ListCard } from "./ListCard";
import { reorderLists } from "@/lib/actions/lists";

function DragHandle({
  onPointerDown,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      onPointerDown={onPointerDown}
      className="border-border text-muted flex touch-none cursor-grab select-none items-center border-r-4 px-3 text-xl active:cursor-grabbing"
    >
      ⠿
    </button>
  );
}

function ListRow({ item }: { item: ListCardData }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="list-none"
    >
      <ListCard
        list={item}
        handle={<DragHandle onPointerDown={(e) => controls.start(e)} />}
      />
    </Reorder.Item>
  );
}

export function HomeLists({ lists }: { lists: ListCardData[] }) {
  const [items, setItems] = useState(lists);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleReorder(next: ListCardData[]) {
    setItems(next);
    // Debounce persistence so a drag doesn't fire on every frame.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void reorderLists(next.map((i) => i.id));
    }, 600);
  }

  if (items.length === 0) {
    return (
      <p className="text-muted">
        No lists yet — create your first one above. 🕹️
      </p>
    );
  }

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={handleReorder}
      className="flex flex-col gap-3"
    >
      {items.map((item) => (
        <ListRow key={item.id} item={item} />
      ))}
    </Reorder.Group>
  );
}
