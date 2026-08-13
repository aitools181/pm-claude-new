"use client";
import { SettingsShell } from "../../../../components/settings/SettingsShell";
import { Select, Switch } from "../../../../components/ui";
import { useTheme } from "../../../../components/theme/ThemeProvider";

type NavPrefs = { showFavorites?: boolean; showRecents?: boolean; collapseSidebarOnLaunch?: boolean; projectOpenMode?: "last"|"list"|"board"; compactSections?: boolean };
export default function NavigationSettings(){
  const theme=useTheme(); const prefs=(theme.preferences.navigationPreferences||{}) as NavPrefs;
  const save=(patch:Partial<NavPrefs>)=>theme.setPreferences({navigationPreferences:{...prefs,...patch}});
  return <SettingsShell><div className="settings-section"><h2>Navigation</h2><p>The supplied Asana capture identified this settings section but did not expose its internal controls. These are PM Platform navigation preferences rather than claimed Asana parity.</p>
    <div className="setting-block"><Switch label="Show Favorites" description="Keep favorite projects visible in persistent navigation." checked={prefs.showFavorites!==false} onChange={showFavorites=>save({showFavorites})}/><Switch label="Show Recents" description="Show recently visited destinations below primary navigation." checked={prefs.showRecents!==false} onChange={showRecents=>save({showRecents})}/><Switch label="Collapse sidebar on launch" description="Start with the workspace sidebar collapsed on narrower workspaces." checked={!!prefs.collapseSidebarOnLaunch} onChange={collapseSidebarOnLaunch=>save({collapseSidebarOnLaunch})}/><Switch label="Compact navigation sections" description="Reduce vertical spacing in long navigation lists." checked={!!prefs.compactSections} onChange={compactSections=>save({compactSections})}/>
      <label className="setting-row"><span><strong>Default project view</strong><small>Used when a project has no explicit saved default view.</small></span><Select value={prefs.projectOpenMode||"last"} onChange={e=>save({projectOpenMode:e.target.value as NavPrefs["projectOpenMode"]})}><option value="last">Last used</option><option value="list">List</option><option value="board">Board</option></Select></label>
    </div></div></SettingsShell>;
}
