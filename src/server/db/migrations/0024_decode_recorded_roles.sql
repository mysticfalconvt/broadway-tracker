-- The same escaping, in the table that records who somebody actually saw.
-- Roles were decoded on the casting path and not on this one, so a cover
-- recorded as "Johnny Bevan &amp; Others" never matched the casting it was
-- meant to supersede, and the billed performer went on being offered.
UPDATE seen_performers SET role = replace(role, '&nbsp;', ' ') WHERE role LIKE '%&nbsp;%';
UPDATE seen_performers SET role = replace(role, '&quot;', '"') WHERE role LIKE '%&quot;%';
UPDATE seen_performers SET role = replace(role, '&#39;', '''') WHERE role LIKE '%&#39;%';
UPDATE seen_performers SET role = replace(role, '&rsquo;', '’') WHERE role LIKE '%&rsquo;%';
UPDATE seen_performers SET role = replace(role, '&lt;', '<') WHERE role LIKE '%&lt;%';
UPDATE seen_performers SET role = replace(role, '&gt;', '>') WHERE role LIKE '%&gt;%';
UPDATE seen_performers SET role = replace(role, '&amp;', '&') WHERE role LIKE '%&amp;%';
