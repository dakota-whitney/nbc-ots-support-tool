//Import custom classes
import { SessionPanel, Popup } from "./panel.js";
import { SessionGrid, SessionLog } from "./session.js";
import { Background } from "./background.js";

//Create DOM refs
const main = document.querySelector("main");
const footer = document.querySelector("footer");

//If DevTool opened
if(chrome.devtools){
    document.title = Background.dt_title;

    const sessionPanel = new SessionPanel(main, footer, SessionLog.types);
    const grid = sessionPanel.getElement("#dash");
    const sessionGrid = new SessionGrid(grid);

    const background = chrome.runtime.connect({name: "devtool"});
    const sessionLog = new SessionLog(background, main);

    chrome.devtools.network.onRequestFinished.addListener(har => sessionPanel.render(sessionLog, sessionGrid, har));

    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if(message.dt_req) Background.log(document.title, message.dt_req, message, sender);
        else return false;
        if(message.error) sessionPanel.render(sessionLog, sessionGrid, message.error);
        respond({response: message.dt_req + " received"});
        return true;
    });

    sessionLog.init().then(initialized => sessionPanel.init(initialized, sessionGrid));
}
//If popup opened
else{
    document.title = Background.manifest.name;
    const popup = new Popup(main, footer);
    popup.init();
};

document.querySelector("#title").innerText = document.title;
footer.querySelector("#pointer").onclick = SessionPanel.point;
footer.querySelector("#version").innerText = "Version " + Background.manifest.version;