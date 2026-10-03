import type { ReactNode } from "react"
import { Circle, Line, Path, Polyline, Rect } from "react-native-svg"

import type { GlyphName, S } from "./glyphTypes"

/** The first half of the icon drawings: navigation, actions and people. */
export const shapesA: Record<
  Extract<
    GlyphName,
    | "home"
    | "users"
    | "calendar"
    | "bed"
    | "chart"
    | "settings"
    | "shield"
    | "plus"
    | "search"
    | "bell"
    | "more"
    | "close"
    | "menu"
    | "user"
    | "clipboard"
    | "broom"
    | "message"
    | "arrowRight"
    | "arrowLeft"
    | "login"
    | "logout"
    | "camera"
    | "image"
  >,
  (s: S) => ReactNode
> = {
  home: (s) => (
    <>
      <Path {...s} d="M3 11.5 12 4l9 7.5" />
      <Path {...s} d="M5 10.5V20h14v-9.5" />
      <Path {...s} d="M10 20v-6h4v6" />
    </>
  ),
  users: (s) => (
    <>
      <Circle {...s} cx="9" cy="8" r="3.5" />
      <Path {...s} d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <Path {...s} d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <Path {...s} d="M17.5 13.6A6.5 6.5 0 0 1 21.5 20" />
    </>
  ),
  calendar: (s) => (
    <>
      <Rect {...s} x="3" y="5" width="18" height="16" rx="3" />
      <Line {...s} x1="3" y1="10" x2="21" y2="10" />
      <Line {...s} x1="8" y1="3" x2="8" y2="7" />
      <Line {...s} x1="16" y1="3" x2="16" y2="7" />
    </>
  ),
  bed: (s) => (
    <>
      <Path {...s} d="M3 18V8" />
      <Path {...s} d="M3 13h18v5" />
      <Path {...s} d="M3 13V9a1 1 0 0 1 1-1h5a2 2 0 0 1 2 2v3" />
      <Path {...s} d="M11 13V9a2 2 0 0 1 2-2h5a3 3 0 0 1 3 3v3" />
    </>
  ),
  chart: (s) => (
    <>
      <Path {...s} d="M4 20V10" />
      <Path {...s} d="M10 20V4" />
      <Path {...s} d="M16 20v-7" />
      <Path {...s} d="M22 20H2" />
    </>
  ),
  settings: (s) => (
    <>
      <Circle {...s} cx="12" cy="12" r="3" />
      <Path
        {...s}
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
      />
    </>
  ),
  shield: (s) => (
    <>
      <Path {...s} d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
      <Polyline {...s} points="9 12 11 14 15 10" />
    </>
  ),
  plus: (s) => (
    <>
      <Line {...s} x1="12" y1="5" x2="12" y2="19" />
      <Line {...s} x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  minus: (s) => <Line {...s} x1="5" y1="12" x2="19" y2="12" />,
  search: (s) => (
    <>
      <Circle {...s} cx="11" cy="11" r="7" />
      <Line {...s} x1="20" y1="20" x2="16.2" y2="16.2" />
    </>
  ),
  bell: (s) => (
    <>
      <Path {...s} d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
      <Path {...s} d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  back: (s) => <Polyline {...s} points="14 6 8 12 14 18" />,
  forward: (s) => <Polyline {...s} points="10 6 16 12 10 18" />,
  chevronRight: (s) => <Polyline {...s} points="10 7 15 12 10 17" />,
  chevronDown: (s) => <Polyline {...s} points="6 10 12 15 18 10" />,
  chevronUp: (s) => <Polyline {...s} points="6 15 12 10 18 15" />,
  more: (s) => (
    <>
      <Circle {...s} cx="6" cy="12" r="1" fill={s.stroke} />
      <Circle {...s} cx="12" cy="12" r="1" fill={s.stroke} />
      <Circle {...s} cx="18" cy="12" r="1" fill={s.stroke} />
    </>
  ),
  check: (s) => <Polyline {...s} points="5 12.5 10 17 19 7" />,
  close: (s) => (
    <>
      <Line {...s} x1="6" y1="6" x2="18" y2="18" />
      <Line {...s} x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  menu: (s) => (
    <>
      <Line {...s} x1="4" y1="7" x2="20" y2="7" />
      <Line {...s} x1="4" y1="12" x2="20" y2="12" />
      <Line {...s} x1="4" y1="17" x2="20" y2="17" />
    </>
  ),
  user: (s) => (
    <>
      <Circle {...s} cx="12" cy="8" r="4" />
      <Path {...s} d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  clipboard: (s) => (
    <>
      <Rect {...s} x="5" y="4" width="14" height="17" rx="2" />
      <Rect {...s} x="9" y="2" width="6" height="4" rx="1" />
      <Line {...s} x1="9" y1="11" x2="15" y2="11" />
      <Line {...s} x1="9" y1="15" x2="13" y2="15" />
    </>
  ),
  broom: (s) => (
    <>
      <Path {...s} d="M14 3 8.5 8.5" />
      <Path {...s} d="M11 6 6 11a4 4 0 0 0 0 5.7L7.3 18a4 4 0 0 0 5.7 0l5-5z" />
      <Path {...s} d="M4 21l3-3" />
    </>
  ),
  message: (s) => (
    <>
      <Path {...s} d="M4 5h16v11H9l-5 4z" />
      <Line {...s} x1="8" y1="9" x2="16" y2="9" />
      <Line {...s} x1="8" y1="12.5" x2="13" y2="12.5" />
    </>
  ),
  arrowRight: (s) => (
    <>
      <Line {...s} x1="4" y1="12" x2="20" y2="12" />
      <Polyline {...s} points="14 6 20 12 14 18" />
    </>
  ),
  arrowLeft: (s) => (
    <>
      <Line {...s} x1="20" y1="12" x2="4" y2="12" />
      <Polyline {...s} points="10 6 4 12 10 18" />
    </>
  ),
  login: (s) => (
    <>
      <Path {...s} d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
      <Polyline {...s} points="9 8 13 12 9 16" />
      <Line {...s} x1="3" y1="12" x2="13" y2="12" />
    </>
  ),
  logout: (s) => (
    <>
      <Path {...s} d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
      <Polyline {...s} points="16 8 20 12 16 16" />
      <Line {...s} x1="9" y1="12" x2="20" y2="12" />
    </>
  ),
  camera: (s) => (
    <>
      <Path {...s} d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <Circle {...s} cx="12" cy="13" r="3.5" />
    </>
  ),
  image: (s) => (
    <>
      <Rect {...s} x="4" y="5" width="16" height="14" rx="2" />
      <Circle {...s} cx="9" cy="10" r="1.5" />
      <Path {...s} d="M20 16l-5-5-7 8" />
    </>
  ),
}
