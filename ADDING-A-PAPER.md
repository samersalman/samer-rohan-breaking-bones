# Adding a new paper to the website

Each paper on the site gets a title, journal, date, authors, a "Read the paper" link, and a short plain-English summary. Everything lives in `data/papers.json`.

## The fast way (with Claude Code)

1. Open Claude Code in this folder (`samer-rohan-breaking-bones`).
2. Paste this, filling in the blank:

   > Add this paper to the website for [month]: [PDF path or link to the abstract].
   > Write the summary, show it to me, and push once I approve.

   You can list several papers in one message.
3. Claude reads the paper, then adds:
   - the title, journal, authors, DOI, and the "Read the paper" link (`https://doi.org/<DOI>`)
   - the date and month
   - topic tags (for example Orthopedic surgery > Spine)
   - a summary of about 50 words. The last sentence says why the paper matters to an everyday person.
4. Read the summary Claude shows you. Reply "approve" or ask for changes.
5. Claude marks the summary as approved (`"reviewed": true`) and pushes to `main`. The live site updates within a minute or two:
   https://samersalman.github.io/samer-rohan-breaking-bones/

## Doing it by hand

1. Find the paper's **DOI**. It is on the PDF's first page or the abstract page (it looks like `10.1016/j.injury.2026.113938`).
2. Open `data/papers.json` and copy an existing paper entry (from `{` to `},`). Paste it at the top of the `"papers"` list.
3. Change these fields:

   | Field | What to put |
   |---|---|
   | `id`, `doi` | the DOI |
   | `url` | `https://doi.org/` + the DOI |
   | `title`, `journal`, `authors` | from the paper |
   | `date`, `month`, `year` | publication date, e.g. `"2026-11-24"`, `11`, `2026` |
   | `dateLocked` | `true` (so the weekly sync keeps your date) |
   | `source` | `"manual"` |
   | `summary` | about 50 plain words; the last sentence says why it matters |
   | `reviewed` | `true` once an author has checked the summary against the paper |
   | `topics`, `subtopics` | ids from `data/taxonomy.json` (e.g. `["ortho"]`, `["trauma"]`) |
   | `hidden` | `false` (or delete it). `true` keeps the paper off the site. |
   | `pmid` | the PubMed ID, if there is one yet |

4. Check the JSON is valid: `python3 -m json.tool data/papers.json > /dev/null` (no output means it is fine).
5. Preview locally: run `python3 -m http.server` in this folder and open http://localhost:8000. Add `?preview=1` to the address to see summaries that are not approved yet.
6. Commit and push to `main`:
   ```
   git add data/papers.json
   git commit -m "Add <short paper name>"
   git push origin HEAD:main
   ```

## Good to know

- **Summary not showing?** It only appears once `"reviewed": true` is set. Until then the site shows just the title and link.
- **Letters and replies** are hidden by default (`"hidden": true`). Set `"hidden": false` to show one.
- **Weekly sync:** every Monday a GitHub Action checks our ORCID profiles and opens a pull request for any new papers. It fills in the title, journal and authors but not the summary. Add the summary in that pull request, set `reviewed` to `true`, then merge.
- **PubMed ID:** new papers often have no PMID for a week or two. Add it later; the site works without it.
- Field details are in `data/README.md`.

## The logo scavenger hunt (easter egg)

Tapping the top logo 7 times breaks it in two and starts a 5-clue scavenger hunt. Each answer is a number from a paper's "In short" summary. The last screen shows a secret phrase that people DM to @BreakkingBones.

- Clues, hints, answers and the phrase live in `scripts/hunt-source.json`. That file is **git-ignored**, so it is only on the computer that built the hunt. The public `data/hunt.json` holds only hashed answers and the encrypted phrase.
- **To change a clue, answer or the phrase:** edit `scripts/hunt-source.json`, run `python3 -I scripts/make_hunt.py`, then commit and push `data/hunt.json`.
- **If you edit a summary that a clue uses**, run the script again. It prints a WARNING when an answer no longer appears in that month's public summaries.
