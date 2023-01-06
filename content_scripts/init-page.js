//Set initial page status
sessionStorage.setItem("sessionStatus", "ok");
console.log(`Session status: %c${sessionStorage.getItem("sessionStatus")}`, "color: green;");

//Listen for messages from Background
chrome.runtime.onMessage.addListener((message, sender, respond) => {
    console.log(`${location.host} received message from ${sender.origin}`, message, sender);
    switch(message.req){
        case "logs":
            const logs = message.logTypes.map(type => JSON.parse(sessionStorage.getItem(type + "Log")))
                .flat(1)
                .filter(entry => entry);
            respond({logs: logs});
        break;
        case "flush":
            message.types.forEach(type => sessionStorage.removeItem(type + "Log"));
            respond({removed: message.types});
        break;
        case "status":
            respond({status: sessionStorage.getItem("sessionStatus")});
        break;
    };
    return true;
});

//Listen for Window/DOM errors
const errListener = (error, url) => {
    error = {
        req: "err",
        entry: {
            timeStamp: Date.now(),
            error: error.message,
            url: url ? url : location.href,
        },
    };
    chrome.runtime.sendMessage(error);
    console.log(`%cWindow error detected: %o`,`background-color:red;color:white;`, error);
};

//Sends session status to Background
const sendStatus = (enable = true) => {
    const sessionStatus = enable ? sessionStorage.getItem("sessionStatus") : "disable";
    try{ chrome.runtime.sendMessage({req: "status", status: sessionStatus}) }
    catch(e) { console.log(e.message) }
    return sessionStatus;
};

//Attach listeners to current page
removeEventListener("error", errListener);
addEventListener("error", errListener);
addEventListener("beforeunload", () => sendStatus(false));
onblur = () => sendStatus(false);
onfocus = () => sendStatus();