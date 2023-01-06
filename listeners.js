import { Background } from "./ext/background.js";

chrome.runtime.onStartup.addListener(() => Background.startup());

chrome.runtime.onConnect.addListener(devtool => devtool.onMessage.addListener(message => Background.devtoolListener(message, devtool)));

chrome.runtime.onMessage.addListener((message, sender, respond) => Background.msgListener(message, sender, respond));

chrome.webRequest.onCompleted.addListener(req => Background.webListener(req), {urls: Background.manifest.host_permissions});

chrome.webRequest.onErrorOccurred.addListener(error => Background.errListener(error), {urls: Background.manifest.host_permissions});

chrome.webNavigation.onErrorOccurred.addListener(error => Background.errListener(error), Background.otsFilter);

chrome.webNavigation.onCommitted.addListener(details => Background.navListener(details), Background.otsFilter);

chrome.downloads.onDeterminingFilename.addListener((download, suggest) => Background.downloadListener(download, suggest));

chrome.notifications.onClicked.addListener(nId => Background.notifyAction(nId));