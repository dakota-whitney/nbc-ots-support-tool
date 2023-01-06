import { SessionPanel } from "./panel.js";
import { Background } from "./background.js";

export class SessionLog {
    constructor(port = {}, root = HTMLElement){
        this._port = port;
        this._display = root.querySelector("#session");
        this._raw = root.querySelector("#raw");
        this._entries = [];
    };
    static types = ["har", "err"];
    async init(){
        document.body.classList.add("loading");
        const status = await evalStatus("load");
        if(status !== "ok") document.getElementById("err-export").disabled = false;

        const raw = await SessionLog.getAll();
        this._entries = raw.map(entry => SessionLog.normalize(entry))
            .sort((a,b) => Date.parse(a.request.time) - Date.parse(b.request.time));
        this._display.innerHTML = SessionLog.toHTML(this._entries);

        await evalStatus(status);
        document.body.classList.remove("loading");
        return this;
    };
    get tabId(){
        return chrome.devtools.inspectedWindow.tabId;
    };
    get entries(){
        return this._entries;
    };
    set entries(entry = {}){
        const entryType = entry.error ? "err" : "har";
        Background.log(this.constructor.name, entryType, entry);
        document.getElementById(`${entryType}-export`).disabled = false;

        if(SessionPanel.currentView == "raw") this._raw.innerText += JSON.stringify(entry);
        try{ if(entryType == "har") this._port.postMessage({req: "har", tabId: this.tabId, har: entry}) }
        catch(e) { console.log(e.message) };

        entry = SessionLog.normalize(entry);
        this._entries.push(entry);
        this._display.innerHTML = SessionLog.toHTML(this._entries);
    };
    static normalize(entry = {}){
        if(!entry || entry == {}) return entry;
        const remote = new URL(entry.url ? entry.url : entry.request.url);
        return {
            request: {
                time: new Date(entry.timeStamp ? entry.timeStamp : entry.startedDateTime).toLocaleString({hour12: true}),
                host: remote.host,
                resource: remote.pathname,
                method: entry.method ? entry.method : entry.request ? entry.request.method : "n/a",
                query: [...remote.searchParams.entries()]
            },
            timings: entry.timings ? {
                completed: `${entry.time.toFixed(2)}ms`,
                blocked: `${entry.timings.blocked.toFixed(2)}ms`,
                waiting: `${entry.timings.wait.toFixed(2)}ms`,
                receiving: `${entry.timings.receive.toFixed(2)}ms`
            } : null,
            response: {
                status: entry.response ? entry.response.status : entry.statusCode ? entry.statusCode : entry.error,
                cache: entry.fromCache ? entry.fromCache : entry._fromCache ? entry._fromCache : false,
                type: entry.response ? entry.response.content.mimeType : entry.type,
                headers: entry.response ? entry.response.headers : entry.responseHeaders ? entry.responseHeaders : "",
            },
        };
    };
    static async getSession(logType = ""){
        const getLog = `sessionStorage.getItem("${logType}Log")`;
        return await new Promise((res, rej) => chrome.devtools.inspectedWindow.eval(getLog, (log, info) => {
            if(info) rej(info);
            else res(log ? JSON.parse(log) : []);
        }));
    };
    static async setSession(logType = "", log = []){
        const setLog = `sessionStorage.setItem('${logType}Log', '${JSON.stringify(log)}')`;
        return await new Promise((res, rej) => chrome.devtools.inspectedWindow.eval(setLog, (r, info) => {
            if(info) rej(info);
            else res(r);
        }));
    };
    static async getAll(){
        const logs = [];
        for(const type of this.types) logs.push(...await this.getSession(type));
        return logs;
    };
    async export(target = HTMLButtonElement){
        try{
            const [ logType ] = target.id.split("-");
            let payload = logType.match(/session|raw/) ? await SessionLog.getAll() : await SessionLog.getSession(logType);

            if(logType == "session") payload = SessionLog.exportHTML(payload);
            else payload = JSON.stringify(payload);

            const blob = new Blob([payload], {type: logType == "session" ? "text/html" : "application/json"});
            const blobURL = URL.createObjectURL(blob);
            return this._port.postMessage({req: "export", blobURL: blobURL});
        }
        catch(e){ return console.log(e.message) };
    };
    static exportHTML(sessionLog = []){
        if(sessionLog.length === 0) return "";
        else sessionLog = sessionLog.map(entry => this.normalize(entry))
            .sort((a,b) => Date.parse(a.request.time) - Date.parse(b.request.time));
        const date = new Date().toLocaleDateString({hour12: true});
        const dom = new DOMParser().parseFromString(document.querySelector("html").outerHTML, "text/html");
        dom.querySelectorAll("#logo, #devtool-ui, #popup-ui").forEach(elem => elem.remove());
        dom.querySelectorAll("title, #title").forEach(title => title.innerText = `OTS Session Log - ${date}`);
        dom.querySelector("main").innerHTML = this.toHTML(sessionLog);
        return dom.querySelector("html").outerHTML;
    };
    static toHTML(sessionLog = []){
        let tableStr = "<table><thead class='sticky'><tr><th>" + Object.keys(sessionLog[0])
        .map(th => SessionPanel.toTitle(th)).join("</th><th>") + "</th></tr></thead>";

        tableStr += sessionLog.map((entry, i) => {
            let rowClass = i % 2 == 0 ? "dark-row " : "";
            rowClass += (Number.isInteger(entry.response.status) ? entry.response.status >= 400 ? "err" : "ok" : entry.response.status.match(/cache|aborted/i) ? "warn" : "err") + "-row";
            return `<tr class="${rowClass}"><td>` + Object.values(entry).map(cell => cell ?
                Object.entries(cell).map(([tdKey, tdData]) => {
                    if(Array.isArray(tdData)) tdData = tdData.map(queryHeaders => Object.entries(queryHeaders)
                        .map(([key, val], i) => val + (i % 2 > 0 ? "<br />" : key.match(/\d/) ? "=" : ":"))
                        .join("")).join("<br />");
                    return `<span class="td-key ${tdKey}">${SessionPanel.toTitle(tdKey)}: ${tdKey.match(/query|headers/) ? "[...]" : ""}<span class="td-data ${tdKey}">${tdData}</span></span>`
                }).join("<br />") : "")
            .join("</td><td>") + "</td></tr>";
        }).join("");

        return tableStr + "</table>";
    };
    async reset(){
        document.body.classList.add("loading");

        try{
            await chrome.runtime.sendMessage({req: "cache", tabId: this.tabId, notify: false});
            this._port.postMessage({req: "reset", tabId: this.tabId, logTypes: SessionLog.types});
            this._entries = [];
            this._display.innerHTML = "";
            this._raw.innerText = "";
            document.querySelectorAll(".dash-card").forEach(card => card.querySelector("table").innerHTML = "");
        }
        catch(e){ console.log(e.message) }

        return document.body.classList.remove("loading");
    };
};

export class SessionGrid {
    constructor(root = HTMLElement){
        this._root = root;
        this._cards = ["requests", "responses", "timings", "errors"].map(name => {
            const title = document.createElement("legend");
            title.innerText = SessionPanel.toTitle(name);
            const table = document.createElement("table");
            table.innerHTML = "<thead class='sticky'></thead>"

            const card = document.createElement("fieldset");
            card.appendChild(title);
            card.appendChild(table);
            card.id = name + "-card";
            card.classList.add("dash-card");

            return root.appendChild(card);
        });
    };
    render(entries = []){
        this._cards.forEach(card => card.querySelector("table").innerHTML = "");
        const hosts = [...new Set(entries.map(({request}) => request.host))];
        const rendered = {
            requests: hosts.map(host => {
                    const {length: total} = entries.filter(({request}) => request.host === host)
                    return {
                        host: host,
                        total: total
                    };
                }).sort(({total: a}, {total: b}) => b - a),

            responses: hosts.map(host => {
                const {length: fromCache} = entries.filter(({request, response}) => response.cache && request.host === host);
                return {
                        host: host,
                        fromCache: fromCache,
                    };
                }).sort(({fromCache: a},{fromCache: b}) => b - a),

            timings: entries.filter(entry => entry.timings)
                .sort((a, b) => parseFloat(b.timings.waiting) - parseFloat(a.timings.waiting))
                .map(({request, timings}) => {
                    return {
                        host: request.host,
                        responseWait: timings.waiting,
                    };
                }),

            errors: entries.filter(({response}) => !Number.isInteger(response.status))
                .map(({request, response}) => {
                    return {
                        host: request.host,
                        error: response.status,
                        resource: request.resource
                    };
                }),
        };

        for(const [cardName, cardData] of Object.entries(rendered)){
            if(cardData.length === 0) continue;
            const table = this._cards.find(card => card.id.includes(cardName)).querySelector("table");
            table.insertAdjacentHTML("afterbegin", "<thead class='sticky'><tr><th>" + Object.keys(cardData[0])
            .map(k => SessionPanel.toTitle(k)).join("</th><th>") + "</th></tr></thead>");
            table.innerHTML += cardData.map((tr, i) => {
                return `<tr class='${i % 2 == 0 ? "dark-row" : ""}'><td>${Object.values(tr).join("</td><td>")}</td></tr>`;
            }).join("");
        };

        return rendered;
    };
};

export const evalStatus = status => new Promise(res => {
    try{
      chrome.devtools.inspectedWindow.eval("sessionStorage.getItem('sessionStatus')", sessionStatus => {
        if(status) chrome.runtime.sendMessage({
            req: "status",
            status: status == "sync" ? sessionStatus : status,
            force: status == "sync" ? false : true
        });

        res(sessionStatus ? sessionStatus : "disable");
      });
    }
    catch(e){ res("disable") }
});