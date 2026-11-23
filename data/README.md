# Editing papers

All paper content lives in `data/papers.json` (2026 and later, shown on the calendar) and `data/archive.json` (older papers, not on the calendar). Edit the JSON only, never the site code. Keep commas and quotes valid; paste the file into any JSON checker if unsure.

## Fields you write by hand
- `headline`: plain-English headline for a general reader.
- `bottomLine`: 2-3 plain sentences.
- `takeaways`: exactly 3 short strings.
- `technical`: 1-2 sentences with the real numbers (shown under the Technical toggle).
- `tags`: optional short words.
- `instagram`: URL of the post, once there is one.
- `hidden`: set to `true` to keep a paper (letter reply, conference abstract, uncertain DOI) in the data but off the site.
- `note`: free-text reminder for the authors (never shown on the site). The sync keeps it.
- `summary`: about 50 words in plain English; the last sentence says why it matters to an everyday person. Drafted from the paper's abstract and not shown on the site until `reviewed` is `true`. The sync never overwrites it.
- `dateLocked`: set to `true` when you set `date`, `month` and `year` by hand (for example to the PubMed online-ahead-of-print date). The sync then never changes those three fields.
- `rawTitle`: written by the sync when it strips a conference prefix such as `ID: 1234567` or `PO-ABC-001` from `title`; it keeps the original.
- `reviewed`: controls whether the plain-English text is public. The first 41 summaries were checked against each paper's abstract (and open-access full text where available) by independent validators before being set to `true`. For any new paper, an author should check every number against the paper before setting it to `true`. Drafts start as `false`.

Everything else (title, journal, date, authors, DOI, PubMed ID) is filled from ORCID, Crossref and PubMed. The sync never overwrites the hand-written fields above.

## Adding a paper by hand
Copy an existing entry, set `"source": "manual"`, and fill `doi`, `title`, `journal`, `date` (YYYY-MM-DD), `month`, `year`, `authors`, `url`. Only published papers belong here. To add 2027, just add entries with `"year": 2027`.

## Automatic updates
A GitHub Action (`.github/workflows/sync-orcid.yml`) runs every Monday and can be run by hand from the Actions tab. It pulls public ORCID works for both authors, keeps published journal articles with a DOI, removes duplicates, enriches from Crossref and PubMed, and opens a pull request only when something changed. New papers arrive as drafts ("Summary coming.", `reviewed: false`). Fill in the plain-English fields in the pull request, then merge.

Not included automatically: preprints, software, books, chapters, and ORCID entries with no DOI. Add those by hand only if you want them (usually not). Conference abstracts and replies to letters that carry a journal DOI do come through; set `"hidden": true` on any you do not want shown.

Safety rules: a new paper whose Crossref title does not match is not added; an existing paper with a mismatch is kept and a warning is printed. A paper that disappears from ORCID is kept with a warning, never dropped silently. The script exits non-zero if a new paper has no Crossref record.

Run it locally (needs internet, nothing to install):
- `python3 -I scripts/sync_orcid.py --dry-run` reports what would change and writes nothing.
- `python3 -I scripts/sync_orcid.py` does the real run and rewrites the JSON files.
- `--help` shows usage and does not sync.
