#!/usr/bin/env python3
"""Sync published journal articles from ORCID into data/papers.json and data/archive.json.

Run:  python3 -I scripts/sync_orcid.py            (real run, writes data/*.json)
      python3 -I scripts/sync_orcid.py --dry-run  (report only, writes nothing)
      python3 -I scripts/sync_orcid.py --help     (usage only, does not sync)
Exit code is non-zero if a NEW paper has no Crossref record.
Stdlib only. No personal email is sent anywhere. Hand-written fields are preserved.
"""
import argparse, json, re, sys, time, html, subprocess, urllib.request, urllib.parse
from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parent.parent
PAPERS = ROOT / "data" / "papers.json"
ARCHIVE = ROOT / "data" / "archive.json"
SITE_YEAR = 2026
AUTHORS = {
    "0009-0007-9897-4071": "Samer G. Salman",
    "0000-0002-8611-6711": "Rohan A. Phadke",
}
HAND_FIELDS = ["headline", "bottomLine", "takeaways", "technical", "reviewed", "instagram", "tags", "hidden", "note", "dateLocked", "summary"]
UA = "breaking-bones-site-sync/1.0 (public research site; https://github.com/)"


def get(url, accept="application/json", tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa
            last = e
            if "CERTIFICATE_VERIFY_FAILED" in str(e):  # python.org builds on macOS lack CA bundle
                try:
                    r = subprocess.run(["curl", "-sfL", "-m", "30", "-H", "Accept: " + accept, "-A", UA, url],
                                       capture_output=True, timeout=40)
                    if r.returncode == 0 and r.stdout:
                        return r.stdout.decode("utf-8", "replace")
                except Exception as e2:  # noqa
                    last = e2
            time.sleep(1.5 * (i + 1))
    print(f"  fetch failed: {url[:90]} ({last})", file=sys.stderr)
    return None


def norm_title(t):
    t = html.unescape(re.sub(r"<[^>]+>", " ", t or "")).lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def titles_match(a, b):
    a, b = norm_title(a), norm_title(b)
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    sa, sb = set(a.split()), set(b.split())
    return len(sa & sb) / max(1, min(len(sa), len(sb))) >= 0.8


def strip_title_prefix(t):
    """Remove conference-abstract prefixes such as 'ID: 4120624 ' or 'PO-FPII-036 '."""
    t = re.sub(r"^\s*ID:\s*\d+\s+", "", t or "")
    t = re.sub(r"^\s*PO-[A-Za-z0-9]+-\d+\s+", "", t)
    return t.strip()


def clean(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t or ""))).strip()


def orcid_works(oid):
    raw = get(f"https://pub.orcid.org/v3.0/{oid}/works")
    if not raw:
        sys.exit(f"Could not fetch ORCID {oid}; aborting so existing data is untouched.")
    out, skipped = [], []
    for g in json.loads(raw).get("group", []):
        s = g["work-summary"][0]
        title = ((s.get("title") or {}).get("title") or {}).get("value", "")
        if s.get("type") != "journal-article":
            skipped.append((s.get("type"), title, "not a journal article"))
            continue
        doi = None
        for e in (s.get("external-ids") or {}).get("external-id", []):
            if e["external-id-type"] == "doi":
                doi = e["external-id-value"].strip().lower()
                doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi)
                break
        if not doi:
            skipped.append(("journal-article", title, "no DOI"))
            continue
        pd = s.get("publication-date") or {}
        g_ = lambda k: ((pd.get(k) or {}) or {}).get("value")
        out.append({"doi": doi, "title": title, "year": g_("year"), "month": g_("month"), "day": g_("day"),
                    "journal": (s.get("journal-title") or {}).get("value", "")})
    return out, skipped


def crossref(doi):
    raw = get("https://api.crossref.org/works/" + urllib.parse.quote(doi, safe="/"))
    if not raw:
        return None
    try:
        return json.loads(raw)["message"]
    except Exception:
        return None


def cr_date(m):
    best = None
    for k in ("published-online", "published", "published-print", "issued"):
        p = (m.get(k) or {}).get("date-parts", [[None]])[0]
        if p and p[0]:
            t = tuple(p + [None] * (3 - len(p)))
            key = (t[0], t[1] or 13, t[2] or 32)
            if best is None or key < best[0]:
                best = (key, t)
    return best[1] if best else None


def pubmed(doi):
    """Return (pmid, abstract) via NCBI E-utilities (no email)."""
    q = urllib.parse.quote(f"{doi}[AID]")
    raw = get(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term={q}")
    time.sleep(0.4)
    try:
        ids = json.loads(raw)["esearchresult"]["idlist"]
    except Exception:
        return None, None, None
    if len(ids) != 1:
        return None, None, None
    pmid = ids[0]
    xml = get(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id={pmid}", accept="application/xml")
    time.sleep(0.4)
    if not xml:
        return pmid, None, None
    tm = re.search(r"<ArticleTitle>(.*?)</ArticleTitle>", xml, re.S)
    parts = re.findall(r"<AbstractText([^>]*)>(.*?)</AbstractText>", xml, re.S)
    abs_ = []
    for attrs, body in parts:
        lab = re.search(r'Label="([^"]+)"', attrs)
        txt = clean(body)
        abs_.append((lab.group(1).title() + ": " if lab else "") + txt)
    return pmid, " ".join(abs_) or None, clean(tm.group(1)) if tm else None


def fmt_date(t, fallback):
    y, m, d = (t or (None, None, None))
    if not y:
        y, m, d = fallback
    y = int(y); m = int(m) if m else 1; d = int(d) if d else 1
    return f"{y:04d}-{m:02d}-{d:02d}", m, y


PREPRINT_PREFIXES = ("10.1101/", "10.13140/", "10.2139/", "10.21203/", "10.48550/", "10.31219/", "10.31234/")


def build_record(w, owners):
    doi = w["doi"]
    rec = {"id": doi, "doi": doi, "title": w["title"], "journal": w["journal"], "authors": [],
           "url": "https://doi.org/" + doi, "source": "orcid", "_abstract": None, "_problems": []}
    cr = crossref(doi)
    dt = None
    if cr:
        ct = clean((cr.get("title") or [""])[0])
        if ct and titles_match(strip_title_prefix(ct), strip_title_prefix(w["title"])):
            rec["title"] = ct
            rec["rawTitle"] = ct
            rec["journal"] = clean((cr.get("container-title") or [rec["journal"]])[0]) or rec["journal"]
            rec["authors"] = [" ".join(x for x in (a.get("given"), a.get("family")) if x) or a.get("name", "")
                              for a in cr.get("author", [])]
            dt = cr_date(cr)
            if cr.get("type") not in (None, "journal-article"):
                rec["_problems"].append(f"Crossref type {cr.get('type')}")
            ab = clean(cr.get("abstract", ""))
            if ab:
                rec["_abstract"] = re.sub(r"^Abstract:?\s*", "", ab)
        else:
            rec["_problems"].append("Crossref title MISMATCH: " + ct[:60])
    else:
        rec["_problems"].append("no Crossref record")
    pmid, pab, ptitle = pubmed(doi)
    if pmid and ptitle and titles_match(ptitle, rec["title"]):
        rec["pmid"] = pmid
        if pab:
            rec["_abstract"] = pab
    elif pmid:
        rec["_problems"].append("PubMed title MISMATCH, ignored")
    fb = (w["year"], w["month"], w["day"])
    rec["date"], rec["month"], rec["year"] = fmt_date(dt, fb)
    if not rec["authors"]:
        rec["authors"] = sorted(owners)
    rec["_owners"] = sorted(owners)
    raw = rec.pop("rawTitle", rec["title"])
    rec["title"] = strip_title_prefix(rec["title"])
    rec["_raw"] = raw if raw != rec["title"] else None
    return rec


def main():
    ap = argparse.ArgumentParser(description="Sync published journal articles from ORCID into data/*.json.")
    ap.add_argument("--dry-run", action="store_true", help="report what would change; write no files")
    args = ap.parse_args()
    dry = args.dry_run
    works, skipped = {}, []
    for oid, name in AUTHORS.items():
        ws, sk = orcid_works(oid)
        skipped += [(name,) + s for s in sk]
        print(f"ORCID {oid} ({name}): {len(ws)} journal articles with DOI")
        for w in ws:
            e = works.setdefault(w["doi"], {"w": w, "owners": set()})
            e["owners"].add(name)
    print(f"{len(works)} unique DOIs after dedupe")

    old = {}
    for f in (PAPERS, ARCHIVE):
        if f.exists():
            for p in json.loads(f.read_text()).get("papers", []):
                old[p["doi"].lower()] = p

    merged = []
    works_skipped = set()
    report = {"new": [], "no_abstract": [], "problems": [], "new_no_crossref": [], "new_mismatch": [], "vanished": []}
    for doi, e in sorted(works.items()):
        if doi.startswith(PREPRINT_PREFIXES):
            print(f"  skipped: preprint/repository DOI {doi}")
            works_skipped.add(doi)
            continue
        rec = build_record(e["w"], e["owners"])
        prev = old.get(doi)
        if any(x.startswith("Crossref type") for x in rec["_problems"]):
            works_skipped.add(doi)
            if prev:
                print(f"  WARNING: existing paper {doi} is not a journal article per Crossref; kept unchanged")
                merged.append(dict(prev))
                report["problems"].append(f"{doi}: Crossref type mismatch, kept existing entry")
            else:
                print(f"  skipped: not a journal article per Crossref {doi}")
            continue
        mismatch = any(x.startswith("Crossref title MISMATCH") for x in rec["_problems"])
        if mismatch and not prev:
            print(f"  skipped NEW paper {doi}: Crossref title mismatch ({rec['_problems'][0]}); not added")
            report["new_mismatch"].append(doi)
            works_skipped.add(doi)
            continue
        ab, probs = rec.pop("_abstract"), rec.pop("_problems")
        rec.pop("_owners")
        raw_title = rec.pop("_raw", None)
        if prev:
            out = dict(prev)
            for k in ("title", "journal", "date", "month", "year", "authors", "url", "doi"):
                if not any(x.startswith("Crossref title MISMATCH") or x == "no Crossref record" for x in probs) or k in ("doi", "url"):
                    out[k] = rec[k] if k in rec else out.get(k)
            if prev.get("dateLocked"):
                for k in ("date", "month", "year"):
                    out[k] = prev[k]
            if not any(x.startswith("Crossref title MISMATCH") or x == "no Crossref record" for x in probs):
                if raw_title:
                    out["rawTitle"] = raw_title
                else:
                    out.pop("rawTitle", None)
            if mismatch:
                print(f"  WARNING: existing paper {doi} has a Crossref title mismatch; kept existing fields, needs a human look")
            if rec.get("pmid"):
                out["pmid"] = rec["pmid"]
            for k in HAND_FIELDS:
                if k in prev:
                    out[k] = prev[k]
        else:
            out = {"id": doi, "doi": doi, "title": rec["title"],
                   "headline": "", "journal": rec["journal"], "date": rec["date"], "month": rec["month"],
                   "year": rec["year"], "authors": rec["authors"], "url": rec["url"],
                   "bottomLine": "Summary coming.", "takeaways": [], "technical": "",
                   "tags": [], "status": "published", "reviewed": False, "source": "orcid", "instagram": ""}
            if raw_title:
                out["rawTitle"] = raw_title
            if rec.get("pmid"):
                out["pmid"] = rec["pmid"]
            report["new"].append(doi)
            if "no Crossref record" in probs:
                report["new_no_crossref"].append(doi)
        out["headline"] = out.get("headline") or ""
        if not ab:
            report["no_abstract"].append(doi)
        for p in probs:
            report["problems"].append(f"{doi}: {p}")
        out["_abstract"] = ab  # stripped below, kept in a sidecar for drafting
        merged.append(out)

    sidecar = {m["doi"]: m.pop("_abstract") for m in merged}
    import os
    if os.environ.get("ABSTRACT_CACHE") and not dry:  # optional local file for drafting summaries; never committed
        Path(os.environ["ABSTRACT_CACHE"]).write_text(json.dumps(sidecar, indent=1, ensure_ascii=False))

    # Keep manual papers that ORCID does not list
    orcid_dois = set(works)  # preprint DOIs dropped above are not re-added
    for doi, p in old.items():
        if doi not in orcid_dois and p.get("source") == "manual":
            merged.append(p)
        elif doi not in orcid_dois:
            print(f"  WARNING: {doi} is no longer listed in ORCID; kept (remove by hand if intended)")
            report["vanished"].append(doi)
            merged.append(p)

    key = lambda p: p["date"]
    cur = sorted([p for p in merged if p["year"] >= SITE_YEAR], key=key, reverse=True)
    arc = sorted([p for p in merged if p["year"] < SITE_YEAR], key=key, reverse=True)
    if dry:
        print("DRY RUN: no files written")
    else:
        PAPERS.write_text(json.dumps({"site": {"year": SITE_YEAR}, "papers": cur}, indent=2, ensure_ascii=False) + "\n")
        ARCHIVE.write_text(json.dumps({"papers": arc}, indent=2, ensure_ascii=False) + "\n")

    from collections import Counter
    print("Per year:", dict(sorted(Counter(p["year"] for p in merged).items())))
    print("New:", len(report["new"]), "| no abstract:", len(report["no_abstract"]))
    for s in skipped:
        print("  skipped:", s)
    for p in report["problems"]:
        print("  PROBLEM:", p)
    if report["new_no_crossref"]:
        print("ERROR: new paper(s) with no Crossref record:", ", ".join(report["new_no_crossref"]), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
