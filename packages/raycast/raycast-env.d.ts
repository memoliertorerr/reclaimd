/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `list` command */
  export type List = ExtensionPreferences & {
  /** Slow detectors - Run higher-cost detectors (e.g. Time Machine snapshots, orphaned node_modules). None exist until a later build step; the toggle is wired now. */
  "includeSlow": boolean
}
}

declare namespace Arguments {
  /** Arguments passed to the `list` command */
  export type List = {}
}

