// renderer.js
const listenCapture = require('./listenCapture.js');
const { createLogger } = require('../../../common/services/renderer-logger.js');

const logger = createLogger('UI.Renderer');
const params        = new URLSearchParams(window.location.search);
const isListenView  = params.get('view') === 'listen';


window.pickleGlass = {
    startCapture: listenCapture.startCapture,
    stopCapture: listenCapture.stopCapture,
    isLinux: listenCapture.isLinux,
    isMacOS: listenCapture.isMacOS,
    captureManualScreenshot: listenCapture.captureManualScreenshot,
    getCurrentScreenshot: listenCapture.getCurrentScreenshot,
};


window.api.renderer.onChangeListenCaptureState((_event, { status }) => {
    if (!isListenView) {
        logger.info('[Renderer] Non-listen view: ignoring capture-state change');
        return;
    }
    if (status === "stop") {
        logger.info('[Renderer] Session ended – stopping local capture');
        listenCapture.stopCapture();
    } else {
        logger.info('[Renderer] Session initialized – starting local capture');
        listenCapture.startCapture();
    }
});
