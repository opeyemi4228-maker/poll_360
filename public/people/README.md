# Portraits

The room draws the principal's photograph here — see `lib/principal.js`.

**Nothing in this directory is shipped with the product, deliberately.** A
photograph of a real person is somebody's copyright and somebody's likeness,
and neither belongs in a repository by default.

## Adding one

Name the file after the candidate, lowercased, spaces replaced with hyphens,
`.jpg`:

    Atiku Abubakar  ->  public/people/atiku-abubakar.jpg

`slug()` in `lib/principal.js` is the function that decides the name; if a
portrait is not appearing, call that with the candidate's name and compare.

Square, and at least 128×128 — it is drawn at 64px and on a retina display
that is 128 real pixels. Larger is fine; it is cropped to a circle.

## If there is no file

The room draws the candidate's initials in the party's colour instead, and
that is a finished state rather than a placeholder. This directory is allowed
to stay empty forever.

## Rights

Only add an image you hold the rights to publish. This one renders inside a
signed-in dashboard rather than on the public site, which is narrower than a
press licence usually is — but it is still publication, and it is still
somebody's likeness.
