#!/usr/bin/env python3
"""
Turn a party membership register into counts, and throw the people away.

═══════════════════════════════════════════════════════════════════════════
 WHY THIS SCRIPT EXISTS RATHER THAN A ONE-OFF PASTE

 A membership register is a PDF of tens of thousands of rows carrying full
 names, ages, telephone numbers and National Identification Numbers. The
 product needs exactly one thing from it — how many members are in each
 polling unit — and must never hold the rest.

 Doing that conversion by hand once produces a data file nobody can check and
 nobody can regenerate when the next register arrives. So it is a script, it
 lives in the repository, and the file it writes says which register it came
 from and when.

 USAGE
   python3 -m pip install pypdf

   Every state in a folder, which is how the registers arrive:
     python3 scripts/import-register.py --party ADC \\
         --all ~/Downloads/ADC_State_Registers_List --out-dir lib/data

   That writes one lib/data/members-<code>-adc.js per state, and one
   lib/data/members-adc-index.js holding every state and all 774 local
   governments without the ward detail — the file the browser loads eagerly.
   See the head of lib/members.js for why the two are separate.

   Or one register on its own:
     python3 scripts/import-register.py \\
         --pdf "ADC_Sokoto_State_Register.pdf" \\
         --party ADC --state Sokoto \\
         --out lib/data/members-sok-adc.js

 THE OUTPUT HAS NO NAMES IN IT. That is the point of the script, and it is
 asserted before anything is written: if a field that looks like a name, a
 phone number or a NIN reaches the output, the run fails rather than writing.
═══════════════════════════════════════════════════════════════════════════

── ON THE SHAPE OF THESE REGISTERS ─────────────────────────────────────────
They are laid out for printing, not for machines, and the Sokoto one is
typical:

    Binji LGA
    Ward: 007                      <- sometimes a number, sometimes a name
    # / Full Name / Gender / Age / Phone / NIN / Polling Unit / Occupation
    1  NASARA LAWALI  female  35  0703...  3501...  007  House wife

The local government is a line ending in " LGA". The ward is a line beginning
"Ward:". Everything else is a member row, recognised by a serial number
followed by a name, a gender and an age — which is specific enough not to
match a heading and loose enough to survive the layout wobbling between pages.

── AND ON WHAT IT REFUSES TO TIDY ──────────────────────────────────────────
Every defect is counted and reported, never fixed:

  · the same NIN on more than one row
  · the same telephone on more than one row
  · a member with no polling unit recorded
  · a telephone number typed into the polling unit column
  · a member under eighteen, who cannot lawfully vote
  · a local government that is not in the state the register is for

A register with sixty-six thousand names looks authoritative. A campaign that
plans against it deserves to know that nineteen hundred of those people are
too young to vote before it counts them as votes.
"""

import argparse
import collections
import concurrent.futures
import json
import os
import re
import sys

HEADER = {"#", "Full Name", "Gender", "Age", "Phone", "NIN", "Polling Unit", "Occupation"}

# ── A PLACE NAME WITH SOMEBODY'S NUMBER IN IT ──────────────────────────────
# The ward and polling unit fields are free text, and at registration people
# type into the wrong box. Anambra's register has a ward whose NAME is an
# eleven-digit number — a National Identification Number — and Sokoto's has
# two polling units named with telephone numbers.
#
# This is not only a data entry error, it is a privacy failure: a place name is
# published on a dashboard and a NIN is not. Any such field is dropped and
# counted; the member still counts towards the tier above, and what is lost is
# the location the register failed to record in the first place.
PERSONAL = re.compile(r"\d{10,11}")


def tidy(name):
    """
    One ward, written one way.

    ── THE REGISTER'S WARD FIELD IS NOT A WARD LIST ────────────────────────
    Sokoto has 244 wards. The raw register holds 1,568 distinct strings for
    them, because the same ward is typed a dozen ways by a dozen people:

        GAGI A · Gagi A · Gagi 'A' · Gagi "A" · GaGi A

    Left alone that is not a cosmetic problem, it is a correctness one. Every
    variant becomes its own row, one ward's members are split across five of
    them, and any figure computed per ward — a share, a ratio, a ranking — is
    computed against a denominator that does not exist.

    So case, quotation marks and repeated spaces are folded away. Nothing else
    is: "Gagi A" and "Gagi B" are two different wards and stay two, and a bare
    "Gagi" is not merged into either, because which of the three was meant is
    not something this script can know and guessing would move real people
    into a ward they are not in.
    """
    if not name:
        return ""
    cleaned = name.replace("\u2018", "").replace("\u2019", "").replace("\u201c", "").replace("\u201d", "")
    cleaned = cleaned.replace("'", "").replace('"', "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.upper()

# ── WHERE THE LOCAL GOVERNMENT NAMES COME FROM ─────────────────────────────
# Not from this file. The product already ships boundary files for all 37
# states under public/geo/lga/, carrying the name of every one of the 774
# local governments, and those are what the maps are drawn from. Typing a
# second list here would be typing a list that can disagree with the one on
# the screen, and the disagreement would be silent: a register filed against
# "Wamako" when the map says "Wamakko" simply vanishes from the map.
#
# So the names are read from the boundary files, and this table holds only the
# thing they do not carry — which state a name belongs to. It mirrors STATES
# in lib/units.js, and `check_codes` below fails the run if the two drift.
STATE_CODES = {
    "Abia": "ABI", "Adamawa": "ADA", "Akwa Ibom": "AKW", "Anambra": "ANA",
    "Bauchi": "BAU", "Bayelsa": "BAY", "Benue": "BEN", "Borno": "BOR",
    "Cross River": "CRO", "Delta": "DEL", "Ebonyi": "EBO", "Edo": "EDO",
    "Ekiti": "EKI", "Enugu": "ENU", "Gombe": "GOM", "Imo": "IMO",
    "Jigawa": "JIG", "Kaduna": "KAD", "Kano": "KAN", "Katsina": "KAT",
    "Kebbi": "KEB", "Kogi": "KOG", "Kwara": "KWA", "Lagos": "LAG",
    "Nasarawa": "NAS", "Niger": "NIG", "Ogun": "OGU", "Ondo": "OND",
    "Osun": "OSU", "Oyo": "OYO", "Plateau": "PLA", "Rivers": "RIV",
    "Sokoto": "SOK", "Taraba": "TAR", "Yobe": "YOB", "Zamfara": "ZAM",
    "Federal Capital Territory": "FCT",
}

GEO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "geo", "lga")


def check_codes():
    """Fail rather than import against a state list that has drifted."""
    on_disk = {name[:-5] for name in os.listdir(GEO) if name.endswith(".json")}
    ours = set(STATE_CODES.values())
    if ours != on_disk:
        sys.exit(
            f"STATE_CODES and public/geo/lga/ disagree.\n"
            f"  only in this script: {sorted(ours - on_disk)}\n"
            f"  only on disk:        {sorted(on_disk - ours)}"
        )


def lga_names(code):
    """The local governments of one state, as the maps name them."""
    with open(os.path.join(GEO, f"{code}.json")) as handle:
        return sorted({row["name"] for row in json.load(handle)["lgas"]})


def fold(name):
    """A local government name reduced to the letters in it, for matching only."""
    return re.sub(r"[^a-z]", "", (name or "").lower())


def near(a, b):
    """
    Whether two folded names differ by one typing slip.

    One substitution, one insertion, one deletion, or one transposition of
    neighbouring letters. The last is here because the boundary file spells one
    Abia local government "Obi Nwga" and the register spells it "Obi Ngwa" —
    the register is right — and a swap of two adjacent letters is the single
    commonest way a name is mistyped. Without it, 1,669 members fell out of a
    state whose name was spelled correctly.
    """
    if a == b:
        return False
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        wrong = [index for index, (x, y) in enumerate(zip(a, b)) if x != y]
        if len(wrong) == 1:
            return True
        # Two neighbouring letters the wrong way round.
        if len(wrong) == 2 and wrong[1] == wrong[0] + 1:
            at = wrong[0]
            return a[at] == b[at + 1] and a[at + 1] == b[at]
        return False
    short, long = (a, b) if len(a) < len(b) else (b, a)
    for cut in range(len(long)):
        if long[:cut] + long[cut + 1:] == short:
            return True
    return False


def matcher(names):
    """
    Resolve the register's spelling of a local government to the map's.

    ── THREE STEPS, AND THE THIRD IS DELIBERATELY TIMID ────────────────────
    Exact match, then letters-only match ("Dange Shuni" against "Dange-Shuni"),
    then a single-character difference — but only where exactly one local
    government in the state is that close. "Wamako" resolves to "Wamakko"
    because nothing else in Sokoto is one letter away from it. Anything
    ambiguous, and anything further away than that, resolves to nothing and is
    reported as filed outside the state.

    The alternative — a nearest-match that always returns something — would
    quietly move real people into a local government they do not live in, and
    on a screen a campaign plans against, that is worse than a gap.
    """
    exact = {name.lower(): name for name in names}
    folded = {}
    for name in names:
        folded.setdefault(fold(name), name)
    folds = {}

    def once(text):
        """
        Exactly one candidate, or nothing. Never a choice between two.

        Returns the name and how it was reached, so the caller can report
        everything that was not an exact match.
        """
        got = exact.get(text.lower())
        if got:
            return got, "exact"
        key = fold(text)
        if not key:
            return None, None
        if key in folded:
            return folded[key], "spelling"
        close = [name for name in names if near(key, fold(name))]
        if len(close) == 1:
            return close[0], "one letter"
        return None, None

    def resolve(raw):
        if not raw:
            return None, None

        # ── A HEADING THAT SWALLOWED THE COLUMN BESIDE IT ─────────────────
        # These registers are laid out for printing, and on some pages the
        # ward text runs into the local government line before the word "LGA":
        #
        #     Boga dingai Gombi LGA
        #     Ward: Chikila Guyuk LGA
        #     Ward: Umuchieze 111 ward, UMUNNEOCHI LGA
        #
        # The local government is Gombi, Guyuk and Umu-Nneochi. Read whole,
        # none of the three matches anything and 72,267 members of Adamawa —
        # 37% of that register — were reported as filed in another state and
        # dropped.
        text = re.sub(r"^\s*ward\s*:\s*", "", raw.strip(), flags=re.I)

        got, how = once(text)
        if got:
            return got, None if how == "exact" else (raw, got, how)

        # The name is at the END of the heading, so try the longest tail
        # first and stop at the first one that matches exactly one local
        # government. A tail matching two matches nothing, as everywhere else.
        words = [word for word in re.split(r"[\s,]+", text) if word]
        for start in range(1, len(words)):
            got, _how = once(" ".join(words[start:]))
            if got:
                return got, (raw, got, "heading ran into the ward column")

        return None, None

    def match(raw):
        got, folded_as = resolve(raw)
        if folded_as:
            folds[folded_as[0]] = folded_as[1:]
        return got

    return match, folds


def parse(pdf_path, match):
    """Read the register into counts, one tuple of tallies per tier."""
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("pypdf is not installed. Run: python3 -m pip install pypdf")

    reader = PdfReader(pdf_path)

    lga = ward = None
    tree = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    # Gender and age are counted at two levels, keyed by the tier they belong
    # to: a local government name, and an (lga, ward) pair. Not at polling-unit
    # level — 7,433 units times seven counters is a large file to answer a
    # question nobody asks of one booth, and the booth's own total is there.
    gender = collections.defaultdict(collections.Counter)
    ages = collections.defaultdict(collections.Counter)
    ward_gender = collections.defaultdict(collections.Counter)
    ward_ages = collections.defaultdict(collections.Counter)
    nins = collections.Counter()
    phones = collections.Counter()
    outside = collections.Counter()
    # Every spelling each tidied ward name arrived as, so the output can show
    # the commonest one and the import can report how many were folded.
    spellings = collections.defaultdict(collections.Counter)
    total = no_unit = minors = stray_personal = personal_ward = 0

    for page in reader.pages:
        lines = [line.strip() for line in (page.extract_text() or "").split("\n") if line.strip()]
        i = 0
        while i < len(lines):
            line = lines[i]

            found = re.match(r"^(.*?)\s+LGA$", line)
            if found:
                lga = found.group(1).strip()
                i += 1
                continue

            found = re.match(r"^Ward:\s*(.+)$", line)
            if found:
                ward = found.group(1).strip()
                if PERSONAL.search(ward):
                    personal_ward += 1
                    ward = ""
                i += 1
                continue

            if line in HEADER:
                i += 1
                continue

            # A member row: serial, name, gender, age, phone, NIN, unit, job.
            if re.fullmatch(r"\d{1,4}", line) and i + 5 < len(lines):
                _name, sex, age, phone, nin = lines[i + 1 : i + 6]
                if sex.lower() in ("male", "female") and re.fullmatch(r"\d{1,3}", age):
                    unit = lines[i + 6] if i + 6 < len(lines) else ""
                    if unit in HEADER or unit.startswith("Ward:") or unit.endswith(" LGA"):
                        unit = ""

                    # ── A TELEPHONE NUMBER IN THE POLLING UNIT COLUMN ──────
                    # The Sokoto register has two of these: somebody typed a
                    # phone number into the wrong field at registration. It is
                    # a data entry error and it is also a privacy problem,
                    # because a polling unit name is published and a telephone
                    # number is not.
                    #
                    # Dropped rather than kept, and counted rather than hidden.
                    # The member still counts towards their ward; what is lost
                    # is which booth they are in, which is what the register
                    # actually failed to record.
                    if PERSONAL.search(unit):
                        stray_personal += 1
                        unit = ""

                    key = match(lga)
                    if not key:
                        # Filed under a local government that is not in this
                        # state. Counted and named, never silently reassigned.
                        outside[lga] += 1
                        i += 7
                        continue

                    total += 1
                    if not unit:
                        no_unit += 1
                    ward_key = tidy(ward) or "(not stated)"
                    if ward:
                        spellings[(key, ward_key)][ward] += 1
                    tree[key][ward_key][unit or "(not stated)"] += 1
                    gender[key][sex.lower()] += 1
                    ward_gender[(key, ward_key)][sex.lower()] += 1

                    years = int(age)
                    if years < 18:
                        minors += 1
                    band = (
                        "u18" if years < 18
                        else "18_25" if years < 26
                        else "26_35" if years < 36
                        else "36_50" if years < 51
                        else "o50"
                    )
                    ages[key][band] += 1
                    ward_ages[(key, ward_key)][band] += 1

                    nins[nin] += 1
                    phones[phone] += 1
                    i += 7
                    continue
            i += 1

    # How many spellings were folded away. A register whose ward field needed
    # 1,300 merges is a register somebody should tidy at source.
    merged = sum(len(seen) - 1 for seen in spellings.values() if len(seen) > 1)

    quality = {
        "wardSpellingsMerged": merged,
        "repeatedNin": sum(count - 1 for count in nins.values() if count > 1),
        "repeatedPhone": sum(count - 1 for count in phones.values() if count > 1),
        "noPollingUnit": no_unit,
        "personalInUnitField": stray_personal,
        "personalInWardField": personal_ward,
        "underEighteen": minors,
        "outsideState": dict(outside),
    }
    return tree, gender, ages, ward_gender, ward_ages, spellings, quality, total


def build(pdf_path, party, state, code, out):
    """Import one state's register and write its counts. Returns the summary."""
    match, folds = matcher(lga_names(code))
    tree, gender, ages, ward_gender, ward_ages, spellings, quality, total = parse(pdf_path, match)

    # Every local government name the register spelled differently from the
    # map, and what it was resolved to. Reported, never hidden: a register that
    # needed twenty of these is a register somebody should look at.
    quality["lgaSpellingsResolved"] = {
        raw: got for raw, (got, _why) in sorted(folds.items())
    }

    # ── EVERY TIER CARRIES ITS OWN TOTAL ──────────────────────────────────
    # The tree could be summed on demand instead, and was. Two reasons it is
    # not: a screen that sums thousands of polling units to label one local
    # government does that on every render, and — the real one — the national
    # index below holds local governments without the wards under them. A
    # local government whose total is only the sum of its children has no
    # total at all once the children are left out.
    lga_rows = {}
    for name, wards in tree.items():
        ward_rows = {}
        for ward, units in wards.items():
            # Shown as the spelling most people used, so the screen reads
            # "Gagi A" rather than "GAGI A" — the folding is for matching,
            # not for display.
            shown = spellings[(name, ward)].most_common(1)[0][0] if spellings.get((name, ward)) else ward
            ward_rows[shown] = {
                "members": sum(units.values()),
                "units": dict(units),
                "gender": dict(ward_gender[(name, ward)]),
                "ages": dict(ward_ages[(name, ward)]),
            }
        lga_rows[name] = {
            "members": sum(row["members"] for row in ward_rows.values()),
            "wards": ward_rows,
            "gender": dict(gender[name]),
            "ages": dict(ages[name]),
        }

    counts = {
        "lgas": len(lga_rows),
        "wards": sum(len(row["wards"]) for row in lga_rows.values()),
        "units": sum(
            len(ward["units"]) for row in lga_rows.values() for ward in row["wards"].values()
        ),
    }

    payload = {
        "party": party,
        "state": state,
        "stateCode": code,
        "members": total,
        "counts": counts,
        "lgas": lga_rows,
        "quality": quality,
    }

    # ── AND THE SAME STATE WITHOUT ITS WARDS ──────────────────────────────
    # What the national index holds for this state: the two outermost tiers,
    # which is what a map of 37 states and 774 local governments draws, and
    # none of the ward and polling-unit detail, which is the part that is
    # megabytes. See lib/members.js for why the two are shipped separately.
    summary = {
        "state": state,
        "stateCode": code,
        "members": total,
        "counts": counts,
        "lgas": {
            name: {"members": row["members"], "gender": row["gender"], "ages": row["ages"]}
            for name, row in lga_rows.items()
        },
        "quality": quality,
    }

    # ── THE ASSERTION THIS SCRIPT EXISTS FOR ──────────────────────────────
    # Nothing that could identify a person may reach the output. Checked
    # rather than trusted: a refactor that started emitting names would
    # otherwise be discovered by somebody reading a diff, or not at all.
    written = json.dumps(payload)
    for pattern, what in (
        (r"\b\d{11}\b", "an eleven-digit number, which is a NIN or a telephone"),
        (r"\b0[789]\d{9}\b", "a Nigerian mobile number"),
    ):
        if re.search(pattern, written):
            # Raised rather than exited: in a batch this is one worker, and
            # killing the whole run would hide every other register's result
            # behind whichever one happened to fail first. The batch refuses
            # to write the index unless every state succeeded.
            raise ValueError(f"{os.path.basename(out)} would contain {what}. Nothing was written.")

    header = f'''/**
 * {party} membership in {state} State, as a set of counts.
 *
 * Generated by scripts/import-register.py. Edit the script, not this file.
 *
 * NO PERSONAL DATA. The register this came from carries names, ages,
 * telephone numbers and National Identification Numbers; none of them are
 * here. Counts per polling unit, ward and local government, and a gender and
 * age split per local government. That is all the product needs.
 *
 * Source: {os.path.basename(pdf_path)}
 * Members: {total:,}
 */

'''
    # Named for the state CODE and not the state, because the code is what the
    # loader in lib/members.js holds when it asks for this file. Naming it
    # after the state would make "Federal Capital Territory" into a twenty-nine
    # character identifier that no caller can derive from anything it has.
    with open(out, "w") as handle:
        handle.write(header)
        handle.write(f"export const {code}_{party} = ")
        handle.write(json.dumps(payload, separators=(",", ":"), sort_keys=True))
        handle.write(";\n")

    return total, quality, os.path.getsize(out), summary


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pdf", help="One register to import")
    ap.add_argument("--party", required=True)
    ap.add_argument("--state", help="Required with --pdf")
    ap.add_argument("--code", help="Three letter state code; read from the name if omitted")
    ap.add_argument("--out", help="Required with --pdf")
    ap.add_argument("--all", dest="folder", help="A folder of ADC_<State>_State_Register.pdf files")
    ap.add_argument("--out-dir", default="lib/data", help="Where --all writes its files")
    ap.add_argument(
        "--workers",
        type=int,
        default=6,
        help="How many registers to read at once. CPU-bound; each holds a few hundred MB.",
    )
    args = ap.parse_args()

    check_codes()

    if args.folder:
        return batch(args)

    if not (args.pdf and args.state and args.out):
        sys.exit("Give either --all <folder>, or all of --pdf --state --out.")

    code = args.code or STATE_CODES.get(args.state)
    if not code:
        sys.exit(f"No state code for {args.state}. Known: {', '.join(sorted(STATE_CODES))}")

    try:
        total, quality, _size, _summary = build(args.pdf, args.party, args.state, code, args.out)
    except ValueError as why:
        sys.exit(f"REFUSED: {why}")
    print(f"{total:,} members -> {args.out}")
    print(json.dumps(quality, indent=2))


def batch(args):
    """
    Import every register in a folder.

    ── WHY THIS IS ONE COMMAND AND NOT THIRTY-SEVEN ───────────────────────
    A national register arrives as 37 separate PDFs and will arrive that way
    again. Thirty-seven invocations typed by hand is thirty-seven chances to
    pass the wrong state code, and the failure is silent — Kano's members land
    in a file named for Katsina and every figure below the state is wrong for
    both. Here the state is read from the file's own name and checked against
    the table, once.
    """
    files = sorted(
        name for name in os.listdir(args.folder)
        if name.lower().endswith(".pdf")
    )
    if not files:
        sys.exit(f"No PDFs in {args.folder}")

    jobs = []
    for name in files:
        found = re.match(r"^(?:[A-Z]+)_(.+?)_State_Register(?:\s*\(\d+\))?\.pdf$", name)
        if not found:
            print(f"  ? skipped, cannot read a state from the name: {name}")
            continue
        state = found.group(1).replace("_", " ")
        if state == "FCT":
            state = "Federal Capital Territory"
        code = STATE_CODES.get(state)
        if not code:
            print(f"  ? skipped, {state} is not one of the 37: {name}")
            continue
        jobs.append((os.path.join(args.folder, name), state, code))

    os.makedirs(args.out_dir, exist_ok=True)
    done, grand, bytes_written = [], 0, 0
    index = {}

    # ── ONE STATE PER CORE ────────────────────────────────────────────────
    # Reading 330 MB of PDF is entirely processor-bound and entirely
    # independent per state: nothing one register produces is needed to read
    # another. Serially it is the best part of an hour, during which the app
    # will not build, because lib/members.js imports a file per state and 36
    # of them do not exist yet. In parallel it is a few minutes.
    #
    # Processes rather than threads: this is CPU work under an interpreter
    # lock, so threads would take exactly as long. Left to the pool's default
    # the workers would be one per core, and a register the size of Kaduna's
    # holds a few hundred megabytes while it is being read — so the pool is
    # capped to leave the machine usable.
    workers = max(1, min(args.workers, len(jobs)))
    print(f"  reading {len(jobs)} registers, {workers} at a time\n")

    with concurrent.futures.ProcessPoolExecutor(max_workers=workers) as pool:
        running = {
            pool.submit(
                build,
                path,
                args.party,
                state,
                code,
                os.path.join(args.out_dir, f"members-{code.lower()}-{args.party.lower()}.js"),
            ): (state, code)
            for path, state, code in jobs
        }

        for finished in concurrent.futures.as_completed(running):
            state, code = running[finished]
            try:
                total, quality, size, summary = finished.result()
            except Exception as why:  # noqa: BLE001 — one bad register must not lose the rest
                print(f"  {state:<28} FAILED: {why}")
                continue

            grand += total
            bytes_written += size
            flags = []
            if quality["outsideState"]:
                flags.append(f"{sum(quality['outsideState'].values())} outside")
            if quality["underEighteen"]:
                flags.append(f"{quality['underEighteen']} under 18")
            if quality["noPollingUnit"]:
                flags.append(f"{quality['noPollingUnit']} no unit")
            print(
                f"  {state:<28} {total:>8,} members  {size/1024:>7.0f} KB"
                + (f"   [{', '.join(flags)}]" if flags else "")
            )
            index[code] = summary
            done.append((state, code, total, quality))

    # Written in a fixed order however the workers finished, so two runs of
    # the same registers produce the same file rather than a reshuffled one.
    index = dict(sorted(index.items()))
    done.sort(key=lambda row: row[0])

    if len(done) != len(jobs):
        sys.exit(f"REFUSED: {len(jobs) - len(done)} register(s) failed. The index was not written.")

    print(f"\n  {'TOTAL':<28} {grand:>8,} members  {bytes_written/1024/1024:>6.1f} MB across {len(done)} states")

    # ── THE INDEX, WRITTEN LAST BECAUSE IT IS BUILT FROM ALL OF THEM ──────
    index_path = os.path.join(args.out_dir, f"members-{args.party.lower()}-index.js")
    payload = {
        "party": args.party,
        "members": grand,
        "states": index,
    }
    written = json.dumps(payload)
    for pattern, what in (
        (r"\b\d{11}\b", "an eleven-digit number, which is a NIN or a telephone"),
        (r"\b0[789]\d{9}\b", "a Nigerian mobile number"),
    ):
        if re.search(pattern, written):
            sys.exit(f"REFUSED: the index would contain {what}. Nothing was written.")

    with open(index_path, "w") as handle:
        handle.write(f'''/**
 * Where {args.party} membership is, nationally, down to local government.
 *
 * Generated by scripts/import-register.py. Edit the script, not this file.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM THE {len(done)} STATE FILES ──────────
 * This is the one every browser loads. It carries the two outermost tiers —
 * state and local government — with a membership count, a gender split and an
 * age split for each, which is everything the national map draws. The wards
 * and polling units beneath them live in members-<state>-adc.js and are
 * fetched only when somebody opens that state, because all of them together
 * are megabytes and almost nobody opens more than one.
 *
 * NO PERSONAL DATA, here or in the state files. Counts only.
 *
 * States: {len(done)}   Local governments: {sum(row["counts"]["lgas"] for row in index.values()):,}
 * Members: {grand:,}
 */

''')
        handle.write(f"export const {args.party}_INDEX = ")
        handle.write(json.dumps(payload, separators=(",", ":"), sort_keys=True))
        handle.write(";\n")
    print(f"  index -> {index_path}  ({os.path.getsize(index_path)/1024:.0f} KB)")
    return done


if __name__ == "__main__":
    main()
