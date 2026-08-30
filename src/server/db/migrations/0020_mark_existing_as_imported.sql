-- Say honestly where the castings that already exist came from.
--
-- Every one of them arrived through /admin/import, from JSON prepared by hand
-- and read by a person before it was pasted. The column defaults to 'member',
-- which would claim somebody in the room vouched for these dates. Nobody did.
--
-- This is worth doing now and nearly impossible later: with eleven rows the
-- answer is known, and after a few hundred researched ones it would be a guess.
UPDATE "castings" SET "source" = 'import';
UPDATE "productions" SET "source" = 'import';
