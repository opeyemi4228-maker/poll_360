export const metadata = { title: "Video wall", robots: { index: false } };

/** A wall screen is opened by the address the Super Admin made for it. */
export default function WallIndex() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b1024] p-10 text-center text-white">
      <p className="max-w-xl text-[1.5rem] leading-relaxed">
        This is where a screen on the wall is shown. Open the address the Super Admin made for this display. It ends with a key of its own.
      </p>
    </main>
  );
}
