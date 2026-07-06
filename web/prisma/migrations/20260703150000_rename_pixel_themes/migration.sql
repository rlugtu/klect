-- Rename the retro theme enum values to the pixel-* naming.
-- RENAME VALUE is data-preserving: existing rows keep their value under the new label.
ALTER TYPE "Theme" RENAME VALUE 'LIGHT' TO 'PIXEL_LIGHT';
ALTER TYPE "Theme" RENAME VALUE 'DARK' TO 'PIXEL_DARK';
