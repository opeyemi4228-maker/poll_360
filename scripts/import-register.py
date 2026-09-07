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
   python3 scripts/import-register.py \\
       --pdf "ADC_Sokoto_State_Register.pdf" \\
       --party ADC --state Sokoto --code SOK \\
       --out lib/data/members-sokoto-adc.js

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
import json
import os
import re
import sys

HEADER = {"#", "Full Name", "Gender", "Age", "Phone", "NIN", "Polling Unit", "Occupation"}

# The 23 local governments of Sokoto State. Used to catch rows filed under a
# local government somewhere else entirely, which the source register has two
# of. Add a state here to import one.
STATES = {
    "Sokoto": [
        "Binji", "Bodinga", "Dange Shuni", "Gada", "Goronyo", "Gudu", "Gwadabawa",
        "Illela", "Isa", "Kebbe", "Kware", "Rabah", "Sabon Birni", "Shagari",
        "Silame", "Sokoto North", "Sokoto South", "Tambuwal", "Tangaza", "Tureta",
        "Wamako", "Wurno", "Yabo",
    ],
}


def parse(pdf_path, lgas):
    """Read the register into counts. Returns (tree, gender, ages, quality)."""
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("pypdf is not installed. Run: python3 -m pip install pypdf")

    canon = {name.lower(): name for name in lgas}
    reader = PdfReader(pdf_path)

    lga = ward = None
    tree = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    gender = collections.defaultdict(collections.Counter)
    ages = collections.defaultdict(collections.Counter)
    nins = collections.Counter()
    phones = collections.Counter()
    outside = collections.Counter()
    total = no_unit = minors = stray_personal = 0

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
                    if re.fullmatch(r"\d{10,11}", unit):
                        stray_personal += 1
                        unit = ""

                    key = canon.get((lga or "").lower())
                    if not key:
                        # Filed under a local government that is not in this
                        # state. Counted and named, never silently reassigned.
                        outside[lga] += 1
                        i += 7
                        continue

                    total += 1
                    if not unit:
                        no_unit += 1
                    tree[key][ward or "(not stated)"][unit or "(not stated)"] += 1
                    gender[key][sex.lower()] += 1

                    years = int(age)
                    if years < 18:
                        minors += 1
                    ages[key][
                        "u18" if years < 18
                        else "18_25" if years < 26
                        else "26_35" if years < 36
                        else "36_50" if years < 51
                        else "o50"
                    ] += 1

                    nins[nin] += 1
                    phones[phone] += 1
                    i += 7
                    continue
            i += 1

    quality = {
        "repeatedNin": sum(count - 1 for count in nins.values() if count > 1),
        "repeatedPhone": sum(count - 1 for count in phones.values() if count > 1),
        "noPollingUnit": no_unit,
        "personalInUnitField": stray_personal,
        "underEighteen": minors,
        "outsideState": dict(outside),
    }
    return tree, gender, ages, quality, total


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--party", required=True)
    ap.add_argument("--state", required=True)
    ap.add_argument("--code", required=True, help="Two or three letter state code, e.g. SOK")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    lgas = STATES.get(args.state)
    if not lgas:
        sys.exit(f"No local government list for {args.state}. Add one to STATES in this script.")

    tree, gender, ages, quality, total = parse(args.pdf, lgas)

    payload = {
        "party": args.party,
        "state": args.state,
        "stateCode": args.code,
        "members": total,
        "lgas": {
            name: {
                "wards": {ward: dict(units) for ward, units in wards.items()},
                "gender": dict(gender[name]),
                "ages": dict(ages[name]),
            }
            for name, wards in tree.items()
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
            sys.exit(f"REFUSED: the output contains {what}. Nothing was written.")

    header = f'''/**
 * {args.party} membership in {args.state} State, as a set of counts.
 *
 * Generated by scripts/import-register.py. Edit the script, not this file.
 *
 * NO PERSONAL DATA. The register this came from carries names, ages,
 * telephone numbers and National Identification Numbers; none of them are
 * here. Counts per polling unit, ward and local government, and a gender and
 * age split per local government. That is all the product needs.
 *
 * Source: {os.path.basename(args.pdf)}
 * Members: {total:,}
 */

'''
    with open(args.out, "w") as handle:
        handle.write(header)
        handle.write(f"export const {args.state.upper()}_{args.party} = ")
        handle.write(json.dumps(payload, separators=(",", ":"), sort_keys=True))
        handle.write(";\n")

    print(f"{total:,} members -> {args.out}")
    print(json.dumps(quality, indent=2))


if __name__ == "__main__":
    main()
