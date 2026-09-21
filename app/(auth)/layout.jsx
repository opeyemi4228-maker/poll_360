/**
 * The sign-in chrome, which is no chrome at all.
 *
 * The sign-in page sits outside `(site)` so it does not get the masthead and
 * footer: a person signing in has one thing to do, and a menu of the website
 * around the form only offers them ways to wander off. The page carries its
 * own way back to the website instead.
 *
 * Route groups never appear in a path, so `/login` is where it always was.
 */
export default function AuthLayout({ children }) {
  return <main id="main">{children}</main>;
}
