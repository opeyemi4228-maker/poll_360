import DashLayout from "@/components/dash/DashLayout";
import { requireCapability } from "@/lib/guard";

import Examiner from "./Examiner";

export const metadata = { title: "Picture analyser", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Hand it a picture and it says what the picture's own file records: when it
 * was taken, where, and with what.
 *
 * It sits with the verification screens because that is the question it
 * answers. A result sheet arrives as a photograph, and before anybody argues
 * about the figures on it there is an earlier question — is this a picture of
 * that booth, on that day. The file often knows.
 */
export default async function PicturePage() {
  const admin = await requireCapability("results:verify", "/admin/picture");

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title="Picture analyser"
      lead="When a picture was taken, where, and with what camera, read from the details the device wrote into the file. Works on photographs and on scanned documents."
    >
      <Examiner />
    </DashLayout>
  );
}
