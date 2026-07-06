-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '';

-- Backfill existing tags with a random palette color (best-effort; keep this
-- array in sync with TAG_COLORS in src/lib/tag-colors.ts).
UPDATE "Tag"
SET "color" = (ARRAY[
  '#e43b44','#f77622','#ffb02e','#f9c74f','#3fa34d','#2a9d8f',
  '#4f6df5','#5a67d8','#9b5de5','#e84c9a','#c77dff','#8d6e63'
])[floor(random() * 12)::int + 1]
WHERE "color" = '';
