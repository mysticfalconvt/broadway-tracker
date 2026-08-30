-- Roles read off web pages arrived HTML-escaped and were stored that way:
-- "Johnny Bevan &amp; Others" is one role with an ampersand in it, not an
-- entity anybody meant to keep. Writing now decodes on the way in; this is the
-- rows that got here first.
--
-- Roles only, deliberately. A person's name, a venue's name and a production's
-- name each carry a derived key alongside them — match_key, local_key — that is
-- computed in TypeScript from rules SQL does not have (NFKD, accent stripping,
-- apostrophes joining rather than separating). Rewriting the name here without
-- reproducing those exactly would leave the key pointing at the old spelling,
-- and a key that disagrees with its name is how two of the same performer stop
-- deduplicating and quietly become two people. Those go through the admin
-- editors, which recompute the key as they save.
--
-- Ordered so &amp; is last: decoding it first would turn a double escape like
-- &amp;lt; into a live &lt;, which the next rule would then eat.
UPDATE castings SET role = replace(role, '&nbsp;', ' ') WHERE role LIKE '%&nbsp;%';
UPDATE castings SET role = replace(role, '&quot;', '"') WHERE role LIKE '%&quot;%';
UPDATE castings SET role = replace(role, '&#39;', '''') WHERE role LIKE '%&#39;%';
UPDATE castings SET role = replace(role, '&rsquo;', '’') WHERE role LIKE '%&rsquo;%';
UPDATE castings SET role = replace(role, '&lt;', '<') WHERE role LIKE '%&lt;%';
UPDATE castings SET role = replace(role, '&gt;', '>') WHERE role LIKE '%&gt;%';
UPDATE castings SET role = replace(role, '&amp;', '&') WHERE role LIKE '%&amp;%';
