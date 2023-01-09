# OTS Support Tool
Chrome users install here: https://chrome.google.com/webstore/detail/ots-support-tool/dekjkenpjkfkhflgbkmoligppgdcpkga

## About the OTS Support Tool
The OTS Support Tool is a _browser extension_ that assists NBCULocal OTS website editors, developers, and administrators in capturing meaningful data for the health and support of NBCUniversal OTS public websites. There are two main interfaces: the **Support Tool** and the **DevTool**. Functionality for each described below:

## Support Tool Functions
* __Clear Cache & Refresh__: Clears _browser_ cache for a *single* OTS site, as long as it's the currently active tab. Note that this is different than a "CLI cache clear" that can be administered by site administrators.
* __Take a screenshot__: Copies the contents of the selected Window and exports it as a *.png* image.
* __Record your screen__: Records the contents of the selected Window and exports it as a *.webm* video. Note that if the tab with the *Recording* icon is closed, the recording will stop.
* __Export Session Log__: Exports _.html_ log of all known OTS-sourced network requests. Will also include any outstanding warnings or errors captured by the tool. This will be helpful in triaging errors and/or bugs that can't be easily replicated.

## DevTool Functions
* __Dash__: Presents simple, real-time analysis of known network requests for a page
* __Session__: Displays all known network requests and captured errors in the order that they were made
* __Raw__: Displays all known network requests and captured errors as raw *JSON*

## Other Functions
* Extension is only enabled for NBCUniversal OTS Websites. Will disable itself if no OTS site detected.
* Toolbar icon shows current status of the current page (ok, warn, err, disable)
* Logs each raw network request JSON to the page's console for further analysis
* Auto-update when bug fixes/new features are rolled out on the web store.