import { SessionGrid, SessionLog } from "./session.js";
import { Background } from "./background.js";

export class SessionPanel {
    constructor(main = HTMLElement, footer = HTMLElement, logTypes = SessionLog.types){
        logTypes = ["session", ...logTypes, "raw"]
        const root = document.createElement("div");
        root.id = "devtool-ui";
        this._root = main.appendChild(root);

        const controls = document.createElement("div");
        controls.id = "controls";
        controls.innerHTML = "<label for='view-ctrl'>View: </label>";
        this._root.appendChild(controls);

        const dropdown = document.createElement("select");
        dropdown.name = "view-ctrl";
        dropdown.id = dropdown.name;

        this._views = ["dash", logTypes[0], "raw"].map((view, i) => {
            dropdown.innerHTML += `<option value="${view}" ${i == 0 ? "selected" : ""}>${SessionPanel.toTitle(view)}</option>`;
            if(i == 0) this._currentView = view;

            const section = document.createElement("section");
            section.id = view;
            section.classList.add("view");
            if(i > 0) section.classList.add("hidden");
            if(view == "raw") section.innerHTML = "<code></code>";

            return this._root.appendChild(section);
        });

        controls.appendChild(dropdown);

        const reset = document.createElement("span");
        reset.id = "reset";
        reset.classList.add("material-symbols-outlined")
        reset.innerText = "refresh";

        controls.appendChild(reset);
        controls.innerHTML += "<br />";

        for(const type of logTypes) controls.insertAdjacentHTML("beforeend",`<button id="${type + "-export"}" class="export" ${type.match(/session|raw/) ? "" : "disabled"}>Export ${SessionPanel.toTitle(type)} Log</button>`);
        footer.querySelector("#pointer").innerText = Background.manifest.name;
    };
    init(sessionLog = SessionLog, sessionGrid = SessionGrid){
        this.getElements("button.export").forEach(btn => btn.onclick = ({target}) => sessionLog.export(target));
        this.getElement("#view-ctrl").onchange = ({target:{value}}) => this.currentView = value;
        this.getElement("#reset").onclick = () => sessionLog.reset();
        sessionGrid.render(sessionLog.entries);
    };
    get currentView(){
        return this._currentView;
    };
    set currentView(view = ""){
        this._views.forEach(section => {
            if(section.id == view) section.classList.remove("hidden");
            else section.classList.add("hidden");
        });
        const rawView = this.getElement("#raw");
        if(view == "raw") SessionLog.getAll().then(raw => rawView.innerText = JSON.stringify(raw));
        else rawView.innerText = "";
        this._currentView = view;
    };
    static get currentView(){
        return document.getElementById("view-ctrl").value;
    };
    getElement(selector = ""){
        return this._root.querySelector(selector);
    };
    getElements(...selectors){
        return [...this._root.querySelectorAll(...selectors)];
    };
    render(sessionLog = SessionLog, sessionGrid = SessionGrid, entry = {}){
        sessionLog.entries = entry;
        return sessionGrid.render(sessionLog.entries);
    };
    static point({target: {innerText}}){
        const nId = innerText.split(" ")[1].toLowerCase();
        return chrome.runtime.sendMessage({req: "notify", nId: nId});
    };
    static toTitle(str){
        return str[0].toUpperCase() + str.substring(1).replaceAll(/[a-z][A-Z]/g, m => m[0] + " " + m[1]);
    };
};

export class Popup {
    constructor(main = HTMLElement, footer = HTMLElement){
        const root = document.createElement("div");
        root.id = "popup-ui";
        this._root = main.appendChild(root);
        this._buttons = ["cache", "screenshot", "recording", "export", "ticket"].map(id => {
            const btn = document.createElement("button");
            btn.id = id;
            switch(id){
                case "cache":
                    btn.innerText = "Clear Cache & Refresh";
                break;
                case "export":
                    btn.innerText = "Export Session Log";
                break;
                case "ticket":
                    btn.innerText = "Submit a Support Ticket";
                    btn.onclick = this.submitTicket;
                break;
                default:
                    btn.classList.add("screen");
                    btn.innerText = id == "screenshot" ? "Take a Screenshot" : "Record Your Screen";
                break;
            };
            return root.appendChild(btn);
        });
        footer.querySelector("#pointer").innerText = Background.dt_title;
    };
    get buttons(){
        return this._buttons;
    };
    async init(){
        try{
            this._currentTab = await Background.getCurrentTab();
            const { status } = await chrome.tabs.sendMessage(this._currentTab.id, {req: "status"});
            await chrome.runtime.sendMessage({req: "status", status: status});
        }
        catch(e) {
            console.log(e.message);
            await chrome.runtime.sendMessage({req: "status", status: "disable"});
            close();
        };

        this._root.querySelector("#cache").onclick = () => this.removeCache();
        this._root.querySelector("#export").onclick = () => this.quickExport();
        this._root.querySelectorAll(".screen").forEach(btn => {
            btn.onclick = ({target: {id}}) => this.captureScreen(id == "screenshot" ? "image/png" : "video/webm");
        });
        return this;
    };
    removeCache(){
        document.body.classList.add("loading");
        this.buttons.forEach(btn => btn.disabled = true);
        chrome.runtime.sendMessage({req: "cache", tabId: this._currentTab.id, notify: true})
        .then(res => {
            Background.log(this.constructor.name, "res", res);
            this.buttons.forEach(btn => btn.disabled = false);
            return document.body.classList.remove("loading");
        });
    };
    async quickExport(){
        let sessionLog = SessionLog.types;
        try{
            const response = await chrome.tabs.sendMessage(this._currentTab.id, {req: "logs", logTypes: sessionLog});
            sessionLog = response.logs;
        }
        catch(e){
            console.log(e.message);
            const [{result}] = await chrome.scripting.executeScript({
                target: {tabId: this._currentTab.id},
                func: types => types.map(type => JSON.parse(sessionStorage.getItem(type + "Log")))
                    .flat(1)
                    .filter(entry => entry),
                args: [sessionLog]
            }).catch(e => console.log(e.message));
            sessionLog = result;
        };

        Background.log(this.constructor.name, "export", sessionLog);
        if(Array.isArray(sessionLog) && sessionLog.length > 0) sessionLog = SessionLog.exportHTML(sessionLog);
        else return sessionLog;

        const logBlob = new Blob([sessionLog], {type: "text/html"});
        const logURL = URL.createObjectURL(logBlob);
        return await chrome.downloads.download({url: logURL});
    };
    submitTicket(){
        const ticketWindow = {
            type: "popup",
            height: 650,
            width: 500,
            url: "https://jira.inbcu.com/servicedesk/customer/portal/261",
            focused: true,
            setSelfAsOpener: true
        };

        return chrome.windows.create(ticketWindow);
    };
    captureScreen(mimeType = ""){
        const reqScreen = {
            req: "screen",
            mime: mimeType,
            tabId: this._currentTab.id
        };
        const disclaimer = `PRIVACY DISCLAIMER\n\nBy continuing, you acknowledge that the contents of your screen may be accessed by the ${Background.manifest.name}, and shared with other teams within your organization`;
        if(!confirm(disclaimer)) return undefined;
        else return chrome.runtime.sendMessage(reqScreen);
    };
};