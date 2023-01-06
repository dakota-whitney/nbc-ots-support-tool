export class Background {
    static get manifest(){
        return chrome.runtime.getManifest();
    };
    static get dt_title(){
        return this.manifest.name.replace(/Support\s/, "Dev");
    };
    static get otsDomains(){
        return this.manifest.host_permissions
        .map(host => new URL(host.replaceAll(/\*\.?/g,"")).host.split(".")[0]);
    };
    static get otsFilter(){
        return {
            url: Background.otsDomains.map(domain => {
                return {hostContains: domain}
            })
        };
    };
    static async getCurrentTab(prop = ""){
        const [ currentTab ] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
            windowType: "normal"
        });
        return prop ? currentTab[prop] : currentTab;
    };
    static async startup(){
        const currentURL = await this.getCurrentTab("url");
        if(!currentURL) return await this.setStatus("disable");
        if(this.otsDomains.find(ots => new URL(currentURL).host.includes(ots))) return await this.setStatus("ok");
        else return await this.setStatus("disable");
    };
    static status(status = ""){
        let color = "#595959" //Default - Gray
        if(status == "ok") color = "#006400" //Green
        else if(status == "warn") color = "#FFA500" //Orange
        else if(status == "err") color = "#8B0000" //Red
        return [status, color];
    };
    static log(source, event, ...payload){
        const style = `background-color:${event == "err" ? "red" : event == "res" ? "blue" : "gray"};color:white;`;
        return console.log(`%c${source} detected ${event}:`, style, ...payload);
    };
    static async storeEntry(tabId, ...entryMeta){
        if(entryMeta.length < 3) entryMeta.push( this.status("ok") );
        const script = {
            target: {tabId: tabId},
            func: storeEntry,
            args: [this.manifest.name, ...entryMeta]
        };
        try{ return await chrome.scripting.executeScript(script) }
        catch(e){
            console.log(e.message);
            script.target.tabId = await this.getCurrentTab("id");

            return await chrome.scripting.executeScript(script)
            .catch(err => console.log(err.message));
        };
    };
    static async webListener(req = {}){
        this.log(this.name, req.method, req);
        try{ await chrome.runtime.sendMessage({dt_req: "ping"}) }
        catch(e){
            console.log(e.message);
            return await this.storeEntry(req.tabId, "har", req)
            .catch(e => console.log(e.message));
        };
    };
    static async errListener(details = {}){
        this.log(this.name, "err", details)
        const status = details.error.match(/cache|aborted/i) ? "warn" : "err";
        const color = await this.setStatus(status);

        try{ await chrome.runtime.sendMessage({dt_req: "err", error: details}) }
        catch(e) { console.log(`%c${e.message}`, `background-color:${color};color:white;`) }

        return await this.storeEntry(details.tabId, "err", details, [status, color])
        .catch(e => console.log(`%c${e.message}`, `background-color:${color};color:white;`));
    };
    static devtoolListener(message = {}, port = {}){
        this.log(this.name, port.name, message, port);
        const tabId = message.tabId;
        switch(message.req){
            case "har":
                this.storeEntry(tabId, message.req, message.har)
            break;
            case "export":
                chrome.downloads.download({url: message.blobURL});
            break;
            case "reset":
                chrome.tabs.sendMessage(tabId, {req: "flush", types: message.logTypes})
                .then(() => {
                    this.setStatus("ok");
                    this.notify("reset");
                });
            break;
        };
        return true;
    };
    static async setStatus(status = ""){
        const color = this.status(status)[1];
        console.log(`%cSetting status: ${status}`, `background-color:${color};color:white;`);

        await chrome.action.setBadgeText({text: status == "load" ? "..." : " "});
        await chrome.action.setBadgeBackgroundColor({color: color});
        await chrome.action.setTitle({title: this.manifest.name + `\nStatus: ${status}`});

        status == "disable" ? await chrome.action.disable() : await chrome.action.enable();
        return color;
    };
    static msgListener(message = {}, sender = {}, respond = () => {}){
        this.log(this.name, message.req, message, sender);
        const status = message.status;
        const tabId = sender.tab ? sender.tab.id : message.tabId;
        switch(message.req){
            case "har":
                this.storeEntry(tabId, message.type, message.entry)
                .then(res => respond({res: res}));
            break;
            case "err":
                this.setStatus(status)
                .then(color => this.storeEntry(tabId, status, message.error, [status, color]))
                .then(res => respond({res: res}));
            break;
            case "status":
                chrome.action.getTitle({})
                .then(title => !title.includes("load") ? this.setStatus(status) : message.force ? this.setStatus(status) : null)
                .then(() => respond({status: status}));
            break;
            case "cache":
                this.setStatus("load")
                .then(() => chrome.tabs.get(tabId))
                .then(({url}) => new URL(url).origin)
                .then(origin => chrome.browsingData.removeCache({origins: [origin]})
                .then(() => chrome.tabs.reload({bypassCache: true}))
                .then(() => {
                    this.setStatus("ok");
                    if(message.notify) this.notify("cache", new URL(origin).host);
                    respond({removed: origin});
                }));
            break;
            case "screen":
                this.getMedia(message.mime, tabId)
                .then(dlId => respond({dlId: dlId}));
            break;
            case "notify":
                respond({n: this.notify(message.nId)});
            break;
        };
        return true;
    };
    static downloadListener(download = {}, suggest = () => {}){
        const { byExtensionId, byExtensionName, mime, id } = download;
        this.log(this.name, mime, download);
        const timestamp = new Date().toLocaleString({hour12: true}).replaceAll(/\W/g,"-");
        if(byExtensionId !== chrome.runtime.id) return suggest();
        this.getCurrentTab("url").then(url => {
            const source = url ? new URL(url).host : byExtensionName.replaceAll(/\W/g,"_");
            suggest({filename: `${source}_${timestamp}.${mime.split("/")[1]}`});
            this.notify(id);
        });
        return true;
    };
    static async navListener(details = {}){
        const { transitionType, url, tabId } = details;
        this.log(this.name, transitionType, details);

        const [ currentDomain ] = new URL(url).host.split(".").slice(-2);
        if(!this.otsDomains.includes(currentDomain)) return await this.setStatus("disable");
        else await this.setStatus("ok");

        try{
            return await chrome.scripting.executeScript({
            target: {tabId: tabId},
            files: ["./content_scripts/init-page.js"]
        })}
        catch(e){
            console.log(e.message);
            return await this.setStatus("disable");
        };
    };
    static notifyAction(nId = ""){
        this.log(this.name, nId);
        if(parseInt(nId)) chrome.downloads.show(parseInt(nId));
        return chrome.notifications.clear(nId);
    };
    static notify(nId, ...details){
        const notification = {
            type: "basic",
            iconUrl: "/icons/support_128.png",
            title: this.manifest.name
        };

        switch(nId){
            case "cache":
                notification.message = `Cache cleared for ${details[0]}`;
            break;
            case "reset":
                notification.message = "Session log has been flushed";
            break;
            case "support":
                notification.message = `Click the support icon on your Browser toolbar to use the ${notification.title}`;
            break;
            case "devtool":
                notification.message = `Open Browser Developer Tools (CMD+OPT+I) and look for ${Background.dt_title} tab`;
            break;
            default:
                notification.message = "Download is ready. Click here to see in Downloads folder";
                nId = nId.toString();
            break;
        };

        chrome.notifications.create(nId, notification, nId => setTimeout(chrome.notifications.clear, 5000, nId));
        notification.id = nId;
        return notification;
    };
    static async getMedia(mimeType, tabId){
        try{
            const screen = await chrome.tabs.get(tabId);
            const streamId = await new Promise(res => chrome.desktopCapture.chooseDesktopMedia(["window"], screen, streamId => res(streamId)));
            if(!streamId) return streamId;
            if(mimeType.includes("video")) await chrome.tabs.duplicate(tabId).then(() => chrome.tabs.update(tabId, {pinned: true}));

            const [{result: mediaURL}] = await chrome.scripting.executeScript({
                target: {tabId: tabId},
                func: getMediaURL,
                args: [streamId, mimeType]
            });

            if(mimeType.includes("video")) await chrome.tabs.remove(tabId);
            return await chrome.downloads.download({url: mediaURL});
        }
        catch(e) { return console.log(e.message) };
    };
};

const storeEntry = (...entryMeta) => {
    const storeLog = (type, log) => {
        type = type + "Log";
        try{
            sessionStorage.setItem(type, JSON.stringify(log));
            return true;
        }
        catch(e){
            const removed = log.shift();
            console.log(`${type} over quota. Removing: %o`, removed);
            return false;
        };
    };
    const [name, type, entry, [status, color]] = [...entryMeta];
    console.groupCollapsed(`%c${name} Output`, `background-color:${color};color:white;font-style:italic;`);
    if(!status.match(/ok/)) sessionStorage.setItem("sessionStatus", status);
    console.log(`Storing to ${type}Log`, entry);
    let log = sessionStorage.getItem(`${type}Log`);
    log = log ? JSON.parse(log) : [];
    log.push(entry);
    let underQuota = storeLog(type, log);
    while(!underQuota) underQuota = storeLog(type, log);
    console.log(`Current ${type}Log`, JSON.parse( sessionStorage.getItem(`${type}Log`) ));
    console.log(`Session Status: %c${sessionStorage.getItem("sessionStatus")}`, `color: ${color}`)
    return console.groupEnd();
};

const getMediaURL = (streamId, mimeType) => new Promise(async (res,rej) => {
    const constraints = {
        audio: false,
        video: {
            mandatory: {
                width: { ideal: 4096 },
                height: { ideal: 2160 },
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: streamId
            }
        }
    };

    try{
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if(mimeType.includes("image")){
            const { outerWidth, outerHeight } = window;
            const canvas = document.createElement("canvas");
            canvas.width = outerWidth;
            canvas.height = outerHeight;

            const video = document.createElement("video");
            video.srcObject = stream;
            await video.play();

            canvas.getContext("2d").drawImage(video, 0, 0, outerWidth, outerHeight);
            stream.getTracks().forEach(track => track.stop());
            res(canvas.toDataURL(mimeType));
        }
        else{
            const recording = new MediaRecorder(stream, {mimeType: mimeType});
            recording.ondataavailable = e => res(URL.createObjectURL(new Blob([e.data], {type: mimeType})));
            recording.start();
        };
    }
    catch(e) {
        console.error(e.message);
        return rej(e.message);
    };
});