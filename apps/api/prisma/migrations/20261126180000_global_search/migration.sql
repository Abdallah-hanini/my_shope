-- WEB-237 global search (ADM-010).
--
-- reporting.search_normalize makes matching case-insensitive and tolerant of common Arabic
-- spelling variants: alef forms (أ إ آ ٱ → ا), alef maqsura (ى → ي), ta marbuta (ة → ه), and drops
-- tatweel (ـ) and short vowels/diacritics (U+064B–U+0652). The same function is applied to the
-- column and to the query, so "ورشه" finds "ورشة" and "احمد" finds "أحمد".
CREATE FUNCTION reporting.search_normalize(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  RETURN lower(translate(t, 'أإآٱىةـًٌٍَُِّْ', 'اااايه'));

COMMENT ON FUNCTION reporting.search_normalize(text) IS 'Search key: lower case, Arabic alef/ya/ta-marbuta variants unified, tatweel and diacritics removed';

-- Journals grow without limit; trigram indexes keep "contains" searches fast (pg_trgm is enabled
-- in the foundation migration). Accounts, branches, periods and users stay small.
CREATE INDEX journal_search_description_trgm ON accounting.journal
  USING gin (reporting.search_normalize(description) gin_trgm_ops);
CREATE INDEX journal_search_number_trgm ON accounting.journal
  USING gin (reporting.search_normalize(number) gin_trgm_ops);
