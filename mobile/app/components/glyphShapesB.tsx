import type { ReactNode } from "react"
import { Circle, Line, Path, Polyline, Rect } from "react-native-svg"

import type { GlyphName, S } from "./glyphTypes"

/** The second half of the icon drawings: objects, money, time and status. */
export const shapesB: Record<
  Extract<
    GlyphName,
    | "edit"
    | "receipt"
    | "phone"
    | "rupee"
    | "clock"
    | "alert"
    | "info"
    | "star"
    | "bag"
    | "grid"
    | "list"
    | "sun"
    | "globe"
    | "lock"
    | "key"
    | "qr"
    | "share"
    | "trash"
    | "refresh"
    | "building"
    | "wallet"
    | "percent"
    | "undo"
  >,
  (s: S) => ReactNode
> = {
  edit: (s) => (
    <>
      <Path {...s} d="M4 20h4l10-10-4-4L4 16z" />
      <Line {...s} x1="12" y1="8" x2="16" y2="12" />
    </>
  ),
  receipt: (s) => (
    <>
      <Path {...s} d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <Line {...s} x1="9" y1="8" x2="15" y2="8" />
      <Line {...s} x1="9" y1="12" x2="15" y2="12" />
    </>
  ),
  phone: (s) => (
    <Path
      {...s}
      d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"
    />
  ),
  rupee: (s) => (
    <>
      <Line {...s} x1="6" y1="5" x2="18" y2="5" />
      <Line {...s} x1="6" y1="9" x2="18" y2="9" />
      <Path {...s} d="M6 5h4a4 4 0 0 1 0 8H6l8 7" />
    </>
  ),
  clock: (s) => (
    <>
      <Circle {...s} cx="12" cy="12" r="8" />
      <Polyline {...s} points="12 8 12 12 15 14" />
    </>
  ),
  alert: (s) => (
    <>
      <Path {...s} d="M12 4 2.5 20h19z" />
      <Line {...s} x1="12" y1="10" x2="12" y2="14" />
      <Circle {...s} cx="12" cy="17" r="0.8" fill={s.stroke} />
    </>
  ),
  info: (s) => (
    <>
      <Circle {...s} cx="12" cy="12" r="8" />
      <Line {...s} x1="12" y1="11" x2="12" y2="16" />
      <Circle {...s} cx="12" cy="8" r="0.8" fill={s.stroke} />
    </>
  ),
  star: (s) => (
    <Path {...s} d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z" />
  ),
  wrench: (s) => <Path {...s} d="M14.5 5.5a4 4 0 0 0 5 5L9 21l-4-4L15.5 6.5a4 4 0 0 0-1-1z" />,
  bag: (s) => (
    <>
      <Path {...s} d="M5 8h14l-1 12H6z" />
      <Path {...s} d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  grid: (s) => (
    <>
      <Rect {...s} x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <Rect {...s} x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <Rect {...s} x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <Rect {...s} x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  list: (s) => (
    <>
      <Line {...s} x1="9" y1="7" x2="20" y2="7" />
      <Line {...s} x1="9" y1="12" x2="20" y2="12" />
      <Line {...s} x1="9" y1="17" x2="20" y2="17" />
      <Circle {...s} cx="5" cy="7" r="0.8" fill={s.stroke} />
      <Circle {...s} cx="5" cy="12" r="0.8" fill={s.stroke} />
      <Circle {...s} cx="5" cy="17" r="0.8" fill={s.stroke} />
    </>
  ),
  sun: (s) => (
    <>
      <Circle {...s} cx="12" cy="12" r="4" />
      <Path
        {...s}
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"
      />
    </>
  ),
  moon: (s) => <Path {...s} d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  globe: (s) => (
    <>
      <Circle {...s} cx="12" cy="12" r="8" />
      <Path {...s} d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16" />
    </>
  ),
  lock: (s) => (
    <>
      <Rect {...s} x="5" y="11" width="14" height="10" rx="2" />
      <Path {...s} d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  key: (s) => (
    <>
      <Circle {...s} cx="8" cy="15" r="4" />
      <Path {...s} d="M11 12 20 3M17 6l2 2M14 9l2 2" />
    </>
  ),
  qr: (s) => (
    <>
      <Rect {...s} x="4" y="4" width="6" height="6" rx="1" />
      <Rect {...s} x="14" y="4" width="6" height="6" rx="1" />
      <Rect {...s} x="4" y="14" width="6" height="6" rx="1" />
      <Path {...s} d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2" />
    </>
  ),
  share: (s) => (
    <>
      <Path {...s} d="M12 15V4" />
      <Polyline {...s} points="8 8 12 4 16 8" />
      <Path {...s} d="M5 13v6h14v-6" />
    </>
  ),
  trash: (s) => (
    <>
      <Path {...s} d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </>
  ),
  refresh: (s) => (
    <>
      <Path {...s} d="M20 12a8 8 0 1 1-2.3-5.7" />
      <Polyline {...s} points="20 3 20 8 15 8" />
    </>
  ),
  filter: (s) => <Path {...s} d="M4 5h16l-6 8v6l-4-2v-4z" />,
  building: (s) => (
    <>
      <Rect {...s} x="5" y="3" width="14" height="18" rx="1.5" />
      <Path {...s} d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
    </>
  ),
  wallet: (s) => (
    <>
      <Rect {...s} x="3" y="6" width="18" height="13" rx="2" />
      <Path {...s} d="M3 10h18M16 14.5h2" />
    </>
  ),
  percent: (s) => (
    <>
      <Line {...s} x1="19" y1="5" x2="5" y2="19" />
      <Circle {...s} cx="7" cy="7" r="2.5" />
      <Circle {...s} cx="17" cy="17" r="2.5" />
    </>
  ),
  undo: (s) => (
    <>
      <Polyline {...s} points="8 5 3 10 8 15" />
      <Path {...s} d="M3 10h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
}
