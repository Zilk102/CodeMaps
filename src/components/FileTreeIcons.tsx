// Icons of the file explorer: expand chevron, folder, and file icons chosen by extension or name.
import React from 'react';

/** Right-pointing chevron that rotates a quarter turn when its folder is expanded. */
export const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    style={{
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.1s',
      minWidth: 16,
      opacity: 0.6,
    }}
  >
    <path
      d="M6 4L10 8L6 12"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Outline folder icon. */
const FolderIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ minWidth: 16, color: 'var(--t2)' }}
  >
    <path
      d="M1.5 4.5C1.5 3.39543 2.39543 2.5 3.5 2.5H6.58579C6.851 2.5 7.10536 2.60536 7.29289 2.79289L8.70711 4.20711C8.89464 4.39464 9.149 4.5 9.41421 4.5H12.5C13.6046 4.5 14.5 5.39543 14.5 6.5V11.5C14.5 12.6046 13.6046 13.5 12.5 13.5H3.5C2.39543 13.5 1.5 12.6046 1.5 11.5V4.5Z"
      stroke="currentColor"
      strokeWidth="1.2"
    />
  </svg>
);

/** React logo, used for tsx and jsx files. */
const ReactIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="-11.5 -10.23174 23 20.46348"
    xmlns="http://www.w3.org/2000/svg"
    style={{ minWidth: 16 }}
  >
    <circle cx="0" cy="0" r="2.05" fill="#61dafb" />
    <g stroke="#61dafb" strokeWidth="1" fill="none">
      <ellipse rx="11" ry="4.2" />
      <ellipse rx="11" ry="4.2" transform="rotate(60)" />
      <ellipse rx="11" ry="4.2" transform="rotate(120)" />
    </g>
  </svg>
);

/** TypeScript logo, used for ts files. */
const TypeScriptIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    xmlns="http://www.w3.org/2000/svg"
    style={{ minWidth: 16 }}
  >
    <rect x="2" y="2" width="12" height="12" fill="#3178c6" />
    <path
      d="M7.4 9.9H8.6V13H9.8V9.9H11V8.8H7.4V9.9ZM5.3 10.6C5.3 10.1 5.4 9.8 5.7 9.5C5.9 9.3 6.3 9.2 6.7 9.2C7 9.2 7.3 9.3 7.5 9.4L7.3 10.4C7.1 10.3 6.9 10.3 6.7 10.3C6.5 10.3 6.4 10.3 6.3 10.4C6.3 10.5 6.2 10.6 6.2 10.8C6.2 10.9 6.3 11 6.3 11.1C6.4 11.2 6.5 11.2 6.7 11.3L7.1 11.4C7.5 11.5 7.8 11.7 8 11.9C8.2 12.1 8.3 12.4 8.3 12.8C8.3 13.2 8.1 13.6 7.8 13.8C7.5 14 7.1 14.1 6.6 14.1C6.1 14.1 5.7 14 5.3 13.8L5.6 12.8C5.8 12.9 6 13 6.2 13.1C6.4 13.1 6.5 13.2 6.7 13.2C6.9 13.2 7 13.1 7.1 13C7.2 12.9 7.3 12.8 7.3 12.6C7.3 12.4 7.2 12.3 7.1 12.2C7 12.1 6.9 12.1 6.7 12L6.3 11.9C5.9 11.8 5.6 11.6 5.5 11.4C5.4 11.2 5.3 10.9 5.3 10.6Z"
      fill="white"
    />
  </svg>
);

/** Small coloured text mark used as an icon. */
const BadgeIcon = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <span
    style={{
      color,
      fontWeight: 'bold',
      fontSize: 11,
      minWidth: 16,
      textAlign: 'center',
    }}
  >
    {children}
  </span>
);

const HtmlIcon = () => <BadgeIcon color="#e34c26">&lt;&gt;</BadgeIcon>;
const JsonIcon = () => <BadgeIcon color="#cbcb41">{`{}`}</BadgeIcon>;

const EmojiIcon = ({ glyph }: { glyph: string }) => (
  <span style={{ fontSize: 12, minWidth: 16, textAlign: 'center' }}>{glyph}</span>
);

/** Plain document icon for files with no specific icon. */
const GenericFileIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    style={{ minWidth: 16, color: 'var(--t2)' }}
  >
    <path
      d="M4 2.5C4 1.67157 4.67157 1 5.5 1H9.5L13.5 5V13.5C13.5 14.3284 12.8284 15 12 15H5.5C4.67157 15 4 14.3284 4 13.5V2.5Z"
      stroke="currentColor"
      strokeWidth="1.2"
    />
  </svg>
);

const ICON_BY_EXTENSION: Record<string, React.ComponentType> = {
  tsx: ReactIcon,
  jsx: ReactIcon,
  ts: TypeScriptIcon,
  html: HtmlIcon,
  json: JsonIcon,
};

/** Name-based fallbacks (checked in order) for files without a dedicated extension icon. */
const ICON_BY_NAME_HINT: Array<[string, string]> = [
  ['config', '⚙️'],
  ['vite', '⚡'],
];

/**
 * Icon for an explorer row: a folder for directories, otherwise by extension (tsx, jsx, ts, html,
 * json), then by name hint (config, vite), else a plain file.
 */
export const FileIcon = ({ name, isDir }: { name: string; isDir: boolean }) => {
  if (isDir) return <FolderIcon />;

  const ext = name.split('.').pop()?.toLowerCase();
  const ByExtension = ext && Object.hasOwn(ICON_BY_EXTENSION, ext) ? ICON_BY_EXTENSION[ext] : null;
  if (ByExtension) return <ByExtension />;

  const hint = ICON_BY_NAME_HINT.find(([needle]) => name.includes(needle));
  if (hint) return <EmojiIcon glyph={hint[1]} />;

  return <GenericFileIcon />;
};
