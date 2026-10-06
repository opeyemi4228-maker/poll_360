import { Camera, Clock, FileText, MapPin, TriangleAlert } from "lucide-react";

import { formatNumber } from "@/lib/utils";

import SpotMap from "./SpotMap";

/**
 * What a picture's own file says, laid out to be read by a person.
 *
 * Four questions, in the order somebody checking a result sheet asks them:
 * when was it taken, where, with what, and what is the file itself. Every
 * answer is either what the file says or the plain words "not recorded" —
 * never a blank, because an empty box reads as a fault in the screen and a
 * missing detail is itself the finding.
 *
 * It takes one shape, `report`, built by `fromAnalysis` (a file somebody just
 * handed over) or `fromRow` (a sheet whose details are held in Data Bank), so
 * the analyser page and the sheet page cannot drift into showing the same
 * facts two different ways.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-09-19 23:29:16" as "19 September 2026, 23:29:16". */
export function words(stamp) {
  const found = String(stamp ?? "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!found) return null;
  return `${Number(found[3])} ${MONTHS[Number(found[2]) - 1]} ${found[1]}, ${found[4]}`;
}

/** World time as Lagos time, which is an hour ahead all year. */
function lagos(stamp) {
  const at = Date.parse(`${String(stamp ?? "").replace(" ", "T").replace(/Z$/, "")}Z`);
  if (Number.isNaN(at)) return null;
  return new Date(at + 3600000).toISOString().slice(0, 19).replace("T", " ");
}

function megabytes(bytes) {
  if (!Number.isFinite(bytes)) return null;
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const KINDS = { jpeg: "Photograph (.jpeg)", png: "Picture (.png)", pdf: "Document (.pdf)" };

/** From `analyse()` in lib/picture.js, with the place it resolves to. */
export function fromAnalysis(found, { where = null, map = null, name = null, size = null, fingerprint = null } = {}) {
  return {
    map,
    name,
    kind: found.kind,
    size: size ?? found.size,
    fingerprint: fingerprint ?? found.fingerprint,
    width: found.width,
    height: found.height,
    device: found.camera,
    taken: { at: found.taken?.at ?? null, offset: found.taken?.offset ?? null, saved: found.taken?.saved ?? null, satellite: found.place?.satelliteTime ?? null },
    place: found.place ? { ...found.place, state: where?.state ?? null, lga: where?.lga ?? null } : null,
    settings: found.settings,
    document: found.document,
    notes: found.notes ?? [],
    flags: [],
  };
}

/**
 * A stored moment as world time, "2026-09-19 22:29:16". The database hands a
 * moment back written in whatever zone its session is in, so it is read as
 * the moment it is and not as the digits it happens to be written with.
 */
function worldTime(value) {
  const moment = value instanceof Date ? value.getTime() : Date.parse(value ?? "");
  return Number.isNaN(moment) ? null : new Date(moment).toISOString().slice(0, 19).replace("T", " ");
}

/** From a row of the IReV picture details held in Data Bank. */
export function fromRow(row, flags = [], map = null, unit = null) {
  return {
    map,
    /* Where the polling unit is, for a sheet whose file names no place. */
    unit,
    kind: row.kind,
    width: row.width,
    height: row.height,
    device: row.device_model || row.device_make ? { make: row.device_make, model: row.device_model, software: row.software } : null,
    taken: {
      at: row.taken_at,
      satellite: worldTime(row.satellite_at),
      received: worldTime(row.stored_at),
    },
    place:
      row.latitude != null
        ? { latitude: row.latitude, longitude: row.longitude, altitude: row.altitude, state: row.taken_state, lga: row.taken_lga }
        : null,
    document: row.saved_with || row.document_at ? { savedWith: row.saved_with, created: row.document_at ? { at: row.document_at } : null } : null,
    notes: row.notes ? [row.notes] : [],
    flags,
  };
}

/**
 * Why a file carries no place, as far as the file itself can say. Measured on
 * INEC's own sheets: those since late 2025 nearly always carry one, those of
 * 2023 about one in four, and those of 2024 none at all.
 */
function whyNoPlace(report) {
  if (!report.device && !report.taken?.at) {
    return report.kind === "pdf"
      ? "The camera\u2019s details were removed before this sheet was published as a document."
      : "It carries no camera details of any kind, which is how INEC published its 2024 sheets and how any picture arrives after WhatsApp or a screenshot.";
  }
  if (report.kind === "pdf") {
    return "The device recorded the time but not its position, as most of INEC\u2019s 2023 sheets did.";
  }
  return "The device recorded the time but not its position. Its location was off, or it had no fix when the picture was taken.";
}

/** A program's own name for itself, as something a person would recognise. */
function program(name) {
  if (/imagemagick/i.test(name)) return "ImageMagick, a program that turns pictures into documents";
  return name;
}

function Panel({ icon: Icon, title, children }) {
  return (
    <section className="rounded-dash border border-dash-line bg-dash-card p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-[0.75rem] font-medium text-dash-muted">
        <Icon size={14} strokeWidth={2.25} />
        {title}
      </h3>
      <dl className="mt-3 space-y-2.5">{children}</dl>
    </section>
  );
}

function Line({ label, children, strong = false }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 text-[0.8125rem]">
      <dt className="text-dash-muted">{label}</dt>
      <dd className={empty ? "text-dash-muted" : strong ? "figure font-bold text-dash-ink" : "wrap-break-word text-dash-ink"}>
        {empty ? "not recorded" : children}
      </dd>
    </div>
  );
}

export default function PictureReport({ report }) {
  const { taken, place, device, settings, document } = report;

  const satelliteLagos = lagos(taken?.satellite);
  const receivedLagos = lagos(taken?.received);
  /* The device's clock against the satellites'. More than a few minutes apart
     means the device's clock was wrong, or was set. */
  const drift =
    taken?.at && satelliteLagos
      ? Math.round(Math.abs(Date.parse(taken.at.replace(" ", "T") + "Z") - Date.parse(satelliteLagos.replace(" ", "T") + "Z")) / 60000)
      : null;

  const spot = place ? `${Math.abs(place.latitude).toFixed(5)}° ${place.latitude >= 0 ? "N" : "S"}, ${Math.abs(place.longitude).toFixed(5)}° ${place.longitude >= 0 ? "E" : "W"}` : null;
  const deviceName = [device?.make, device?.model].filter(Boolean).filter((part, index, all) => all.indexOf(part) === index).join(" ");

  return (
    <div className="space-y-4">
      {report.flags?.length > 0 && (
        <div className="flex gap-3 rounded-dash border border-red-300 bg-red-50 px-4 py-3.5">
          <TriangleAlert size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-red-700" />
          <ul className="space-y-1 text-[0.875rem] font-semibold text-red-900">
            {report.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel icon={Clock} title="When it was taken">
          {!taken?.at && !satelliteLagos && receivedLagos ? (
            <Line label="Photographed">
              <span className="font-semibold">The file does not say.</span> The time below is when INEC&rsquo;s own
              system received the sheet, so it was photographed before then.
            </Line>
          ) : (
            <>
              <Line label="Device clock" strong>{words(taken?.at)}</Line>
              <Line label="Satellite clock" strong>
                {satelliteLagos ? `${words(satelliteLagos)} Lagos time` : null}
              </Line>
            </>
          )}
          {drift !== null && (
            <Line label="The two agree">
              {drift <= 5 ? "Yes, to within a few minutes" : `No. They are ${formatNumber(drift)} minutes apart, so the device clock was wrong or had been set.`}
            </Line>
          )}
          {receivedLagos && (
            <Line label="Received by INEC" strong={!taken?.at}>{`${words(receivedLagos)} Lagos time`}</Line>
          )}
          {taken?.saved && taken.saved !== taken.at && <Line label="Saved again">{words(taken.saved)}</Line>}
          {document?.created?.at && !receivedLagos && <Line label="Document made">{words(document.created.at)}</Line>}
        </Panel>

        <Panel icon={MapPin} title="Where it was taken">
          {place ? (
            <>
              <Line label="Place" strong>{[place.lga, place.state].filter(Boolean).join(", ") || "Outside Nigeria"}</Line>
              <Line label="Coordinates">{spot}</Line>
            </>
          ) : (
            <>
              <Line label="Place">
                <span className="font-semibold">The file does not say.</span>{" "}
                {whyNoPlace(report)}
              </Line>
              {report.unit?.area && (
                <Line label="The polling unit is in" strong>{report.unit.area}</Line>
              )}
            </>
          )}
          {place?.altitude != null && <Line label="Height">{`${formatNumber(Math.round(place.altitude))} m above sea level`}</Line>}
          {place?.accuracy != null && <Line label="Accurate to">{`${place.accuracy} m`}</Line>}
          {place && (
            <Line label="Map">
              <a
                href={`https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=16/${place.latitude}/${place.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                Open this spot on a street map
              </a>
            </Line>
          )}
        </Panel>

        <Panel icon={Camera} title="What took it">
          <Line label="Device" strong>{deviceName || null}</Line>
          <Line label="Camera app">{device?.software}</Line>
          {device?.lens && <Line label="Lens">{device.lens}</Line>}
          {device?.serial && <Line label="Serial number">{device.serial}</Line>}
          {settings && (
            <Line label="Settings">
              {[settings.exposure, settings.aperture, settings.iso ? `ISO ${settings.iso}` : null, settings.focalLength, settings.flash ? `flash ${settings.flash}` : null]
                .filter(Boolean)
                .join(" · ") || null}
            </Line>
          )}
        </Panel>

        <Panel icon={FileText} title="The file">
          {report.name && <Line label="Name">{report.name}</Line>}
          <Line label="Kind">{KINDS[report.kind] ?? null}</Line>
          <Line label="Picture size">{report.width ? `${formatNumber(report.width)} × ${formatNumber(report.height)} pixels` : null}</Line>
          {report.size != null && <Line label="File size">{megabytes(report.size)}</Line>}
          {document?.pages && <Line label="Pages">{document.pages}</Line>}
          {(document?.savedWith || document?.madeWith) && (
            <Line label="Made with">{[document.madeWith, document.savedWith].filter(Boolean).map(program).join(" · ")}</Line>
          )}
          {report.fingerprint && (
            <Line label="Fingerprint">
              <code className="figure text-[0.75rem] break-all">{report.fingerprint}</code>
            </Line>
          )}
        </Panel>
      </div>

      {(report.map || report.unit?.map) && (
        <section className="rounded-dash border border-dash-line bg-dash-card p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-[0.75rem] font-medium text-dash-muted">
            <MapPin size={14} strokeWidth={2.25} />
            {report.map ? "The spot on the map" : "Where the polling unit is"}
          </h3>
          {!report.map && (
            <p className="mt-2 text-[0.8125rem] text-dash-muted">
              This is the area the polling unit is registered in, from INEC&rsquo;s own list. It is not where the
              picture was taken, which the file does not record.
            </p>
          )}
          <SpotMap map={report.map ?? report.unit.map} className="mt-3" />
        </section>
      )}

      {report.notes?.length > 0 && (
        <ul className="space-y-1.5 rounded-dash border border-dash-line bg-dash-bg px-4 py-3 text-[0.8125rem] text-dash-ink">
          {report.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <p className="text-[0.75rem] leading-relaxed text-dash-muted">
        These details are written into the file by the device that made it. They are what the file says about itself,
        and anybody holding the file could have changed them, so read them as a lead to follow and not as proof.
      </p>
    </div>
  );
}
