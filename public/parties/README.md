# Party logos

The result cards and the standings draw a party's own mark here — see
`components/dash/PartyMark.jsx`.

Two files ship with the product: `apc.png` and `adc.png`. Every other party in
`lib/party-register.js` is drawn as a block of its own colour with its code on
it, and that is a finished state rather than a placeholder.

## Adding one

Two steps, and both are needed.

1. Name the file after the party's id in `lib/party-register.js`, lowercased,
   `.png`:

       PDP  ->  public/parties/pdp.png

2. Add `logo: true` to that party's row in the register.

The second step is not bureaucracy. These marks are drawn into result cards
that get rendered to a file on the server for broadcast, and a browser's
`onError` fallback does not run there — so a party whose file is missing would
export a broken image into a graphic going out under the organisation's name.
The register states which files exist, and nothing is requested that is not
known to be there.

## The file

Square is easiest but not required — `apc.png` is 300×270 and `adc.png` is
330×302, and both are drawn with `object-contain` inside a square slot, so
nothing is ever cropped or stretched.

At least 128px on the long edge. The slot is 24–44px on screen, which is up to
88 real pixels on a retina display, and the same mark is drawn much larger
inside an exported story card.

PNG with transparency is fine. So is a logo with its own solid background:
every mark is drawn inside a hairline border with a small radius, so a
full-bleed background reads as a badge instead of bleeding into a white card.

## If there is no file

The party is drawn as a solid block of its colour with its code in white. Most
of this product's charts identify parties exactly that way already, and a
missing file costs a party nothing that matters — it still has its own colour,
its own row, its own column in an export and its own box on the filing form.

This directory is allowed to hold two files forever.

## Rights

A party's logo is its trademark. These are used here to identify the party
whose votes are being reported, which is what a trademark is for and what
reporting an election requires; they are not used to suggest the party endorses
this product or its operator.

Do not add a mark that has been altered, recoloured or redrawn. A party's own
emblem, reproduced faithfully, is the only version that belongs on a card
reporting that party's result.
