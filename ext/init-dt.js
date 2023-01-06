//Import custom functions/classes
import { evalStatus } from "./session.js";
import { Background } from "./background.js";

(async () => {
  //Verify OTS domain
  const status = await evalStatus("load");
  const host = await new Promise(res => chrome.devtools.inspectedWindow.eval("location.host", host => res(host)));
  if(!host || !Background.otsDomains.includes(host.split(".").slice(-2)[0])) return await evalStatus(status);
  else await evalStatus(status);

  //Create DevTool instance - appears as tab in DevTools
  const devtool = await new Promise(res => chrome.devtools.panels.create(
    Background.dt_title,
    "./icons/support_32.png",
    "/ext/ui.html",
    panel => res(panel)
  ));

  //Verify session and icon status are synced
  devtool.onShown.addListener(() => evalStatus("sync"));
  devtool.onHidden.addListener(() => evalStatus("sync"));
  return devtool;
})();