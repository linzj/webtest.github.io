if (!location.search) {
    location.search = 50000;
}

let worker = null;

const canvasContainer = document.querySelector('d3fc-canvas');
canvasContainer.addEventListener('measure', ({ detail }) => {
    if (worker == null) {
        worker = new Worker(`worker.js#${Number(location.search.substring(1))}`);
        const canvas = canvasContainer
            .querySelector('canvas');
        if (canvas.transferControlToOffscreen == null) {
            alert(`It looks like OffscreenCanvas isn't supported by your browser`);
        }
        const offscreenCanvas = canvas.transferControlToOffscreen();
        worker.postMessage({ offscreenCanvas }, [offscreenCanvas]);
        worker.addEventListener('message', ({ data }) => {
            if (data !== 'frame') {
                document.querySelector('#loading>p').innerText = data;
            } else {
                document.querySelector('#loading').style.display = 'none';
            }
        });
    }
    const { width, height } = detail;
    worker.postMessage({ width, height });
});
canvasContainer.requestRedraw();
