/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** where share links point from the iOS, Android and desktop apps, such as https://example.com/calc/ */
  readonly VITE_PUBLIC_URL?: string;
}
