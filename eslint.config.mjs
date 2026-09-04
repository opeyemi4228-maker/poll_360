import coreWebVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

/* eslint-config-next 16 ships a real flat config, so it is imported directly.
   Wrapping it in FlatCompat — which the older Next scaffolds did — throws a
   circular-structure error on load, because the plugin object it exports now
   references itself. */
const config = [
  ...coreWebVitals,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      /* Git worktrees live under here, and a worktree is a whole second copy
         of this repository. Linting it reports every problem twice — once in
         the file somebody is editing and once in another branch's copy of it,
         which is not theirs to fix and cannot be fixed from here. */
      ".claude/**",
      /* Prisma's client is machine-written, minified in places, and declares
         its own runtime names in ways `no-undef` cannot follow. Linting it
         reports 128 problems in code nobody here edits and buries the ones in
         code somebody does. */
      "lib/generated/**",
    ],
  },
  {
    /* ══════════════════════════════════════════════════════════════════════
       A NAME THAT DOES NOT EXIST IS AN ERROR, NOT A WARNING

       This was not switched on, because eslint-config-next does not switch it
       on, and it cost two screens on one evening: `RoomWatch` read a renamed
       variable and the alerts console went white; `PlanningMap` called
       `dropState`, which has never existed, so a triple tap on a loading
       frame threw instead of dropping the state.

       Neither is caught by anything else this project runs. The build does
       not catch them — an undefined identifier inside a component is a
       perfectly valid module until the line executes. The tests do not catch
       them: node's runner cannot import a client component, so no test in
       this repository renders one. That leaves this rule, and a person
       clicking every tab before they push.

       So the globals are declared rather than the rule loosened. Browser for
       everything under components/, node for the scripts and the server
       modules; both, everywhere, because the boundary between them in a Next
       application is a directive at the top of a file and not a directory,
       and a config that has to know which is which is a config that will be
       wrong about a file somebody moves.
       ══════════════════════════════════════════════════════════════════════ */
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-undef": "error",
    },
  },
];

export default config;
