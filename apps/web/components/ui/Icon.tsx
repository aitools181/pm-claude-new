import type { SVGProps } from "react";

export type IconName =
  | "menu" | "search" | "plus" | "home" | "inbox" | "calendar" | "projects"
  | "goal" | "portfolio" | "chart" | "docs" | "meeting" | "time" | "approval"
  | "people" | "settings" | "integration" | "shield" | "backup" | "sparkles"
  | "chat" | "board" | "list" | "timeline" | "gantt" | "backlog" | "release"
  | "chevronDown" | "chevronRight" | "close" | "more" | "check" | "circle"
  | "subtask" | "comment" | "activity" | "link" | "trash" | "copy" | "eye"
  | "bell" | "filter" | "sort" | "star" | "lock" | "user" | "flag" | "arrowLeft"
  | "tag" | "paperclip" | "download" | "sliders" | "help";

const paths: Record<IconName, React.ReactNode> = {
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
  inbox: <><path d="M4 4h16v14H4z" /><path d="M4 13h5l2 3h2l2-3h5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  projects: <><rect x="3" y="4" width="8" height="7" rx="1" /><rect x="13" y="4" width="8" height="7" rx="1" /><rect x="3" y="13" width="8" height="7" rx="1" /><rect x="13" y="13" width="8" height="7" rx="1" /></>,
  goal: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  portfolio: <><path d="M9 6V4h6v2" /><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 11h18M10 11v2h4v-2" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  docs: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  meeting: <><path d="M4 7h16v12H4z" /><path d="M8 3v4M16 3v4M8 12h3M13 12h3M8 16h3" /></>,
  time: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  approval: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
  people: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M15 14c3 0 5 2 5 5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.5-1.2.9-1.9-2.1-2.1-1.9.9-1.2-.5L10.5 3h-3l-.7 2-1.2.5-1.9-.9-2.1 2.1.9 1.9-.5 1.2-2 .7v3l2 .7.5 1.2-.9 1.9 2.1 2.1 1.9-.9 1.2.5.7 2h3l.7-2 1.2-.5 1.9.9 2.1-2.1-.9-1.9.5-1.2z" /></>,
  integration: <><path d="M8 12h8M12 8v8" /><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /></>,
  backup: <><path d="M5 8a8 8 0 1 1-1 7" /><path d="M4 8V3M4 8h5" /><path d="M12 7v5l3 2" /></>,
  sparkles: <><path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8zM5 14l.7 1.8L7.5 16l-1.8.7L5 18.5l-.7-1.8L2.5 16l1.8-.7z" /></>,
  chat: <><path d="M4 4h16v12H8l-4 4z" /></>,
  board: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="14" rx="1" /></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  timeline: <><path d="M4 6h9M4 12h14M4 18h7" /><circle cx="15" cy="6" r="2" /><circle cx="20" cy="12" r="2" /><circle cx="13" cy="18" r="2" /></>,
  gantt: <><path d="M3 5h18M3 19h18" /><rect x="5" y="7" width="8" height="3" rx="1" /><rect x="10" y="11" width="9" height="3" rx="1" /><rect x="7" y="15" width="6" height="2" rx="1" /></>,
  backlog: <><path d="M5 5h14v4H5zM5 11h14v4H5zM5 17h14v2H5z" /></>,
  release: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v3h16v-3" /></>,
  chevronDown: <><path d="m7 9 5 5 5-5" /></>,
  chevronRight: <><path d="m9 7 5 5-5 5" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  circle: <><circle cx="12" cy="12" r="8" /></>,
  subtask: <><path d="M6 4v10a4 4 0 0 0 4 4h8" /><path d="m15 15 3 3-3 3" /></>,
  comment: <><path d="M4 5h16v12H8l-4 4z" /></>,
  activity: <><path d="M3 12h4l2-6 4 12 2-6h6" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12" /><circle cx="12" cy="12" r="3" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  filter: <><path d="M4 5h16l-6 7v6l-4 2v-8z" /></>,
  sort: <><path d="M8 6h12M8 12h8M8 18h4M4 4v16M2 18l2 2 2-2" /></>,
  star: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-5 3-8 8-8s8 3 8 8" /></>,
  flag: <><path d="M5 21V4M5 5h12l-2 4 2 4H5" /></>,
  arrowLeft: <><path d="m15 18-6-6 6-6" /></>,
  tag: <><path d="M20 13 13 20l-9-9V4h7z" /><circle cx="8.5" cy="8.5" r="1" /></>,
  paperclip: <><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L14 3a3.5 3.5 0 0 1 5 5l-9.5 9.5a2 2 0 1 1-3-3L15 6" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 19h16" /></>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="13" cy="18" r="2" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.8 2c-1 .7-1.6 1.2-1.6 2.5" /><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none" /></>,
};

export function Icon({ name, size = 18, ...props }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
