import * as svgControl from './svgControl.js';
import * as client from './client.js';

let currentState = null;
let currentWorker = null;
let uploadConvertedCommands = null;
let currentPreviewId = 0;
let rendererFn = null;

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ PROGRESS BAR ===
function activateProgressBar() {
    const bar = #progressBar;
    bar.addClass("progress-bar-striped");
    bar.addClass("progress-bar-animated");
    bar.removeClass("bg-success");
    bar.text("");
}

function deactivateProgressBar() {
    const bar = #progressBar;
    bar.removeClass("progress-bar-striped");
    bar.removeClass("progress-bar-animated");
    bar.addClass("bg-success");
    bar.text("Success");
}

// === G-CODE ФУНКЦИИ ===
function handleGcodeFileUpload(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const gcodeContent = e.target.result;
        
        const renderRequest = {
            type: "renderGcode",
            gcode: gcodeContent,
            width: svgControl.getTargetWidth(),
            height: svgControl.getTargetHeight(),
            homeX: currentState.homeX,
            homeY: currentState.homeY,
        };

        if (currentWorker) {
            console.log("Terminating previous worker");
            currentWorker.terminate();
        }
        
        currentPreviewId++;
        const thisPreviewId = currentPreviewId;
        
        if (currentPreviewId == thisPreviewId) {
            currentWorker = new Worker(\./worker/worker.js?v=\\);
            currentWorker.onmessage = (e) => {
                if (e.data.type === 'status') {
                    #progressBar.text(e.data.payload);
                } else if (e.data.type === 'renderer') {
                    console.log("G-code rendering finished!");

                    uploadConvertedCommands = e.data.payload.commands.join('\n');
                    const resultSvgJson = e.data.payload.svgJson;
                    const resultDataUrl = svgControl.convertJsonToDataURL(resultSvgJson, svgControl.getTargetWidth(), svgControl.getTargetHeight());

                    const totalDistanceM = +(e.data.payload.distance / 1000).toFixed(1);
                    const drawDistanceM = +(e.data.payload.drawDistance / 1000).toFixed(1);
                    
                    deactivateProgressBar();
                    #previewSvg.attr("src", resultDataUrl);
                    #distances.text(\Total: \m / Draw: \m\);
                    .svg-preview.show();
                    #acceptSvg.removeAttr("disabled");
                }
            };
            
            currentWorker.postMessage(renderRequest);
        }
    };
    reader.readAsText(file);
}

function addGcodeUploadButton() {
    const gcodeInput = document.createElement('input');
    gcodeInput.type = 'file';
    gcodeInput.id = 'uploadGcode';
    gcodeInput.accept = '.gcode,.nc,.txt';
    gcodeInput.style.display = 'none';
    gcodeInput.addEventListener('change', function(e) {
        if (this.files.length > 0) {
            #svgUploadSlide.hide();
            #drawingPreviewSlide.show();
            activateProgressBar();
            #acceptSvg.attr("disabled", "disabled");
            handleGcodeFileUpload(this.files[0]);
        }
    });
    
    document.body.appendChild(gcodeInput);
    
    const gcodeButton = document.createElement('button');
    gcodeButton.type = 'button';
    gcodeButton.className = 'w-100 btn btn-lg btn-outline-primary mb-2';
    gcodeButton.innerHTML = '<i class="bi bi-code-slash"></i> Upload G-code';
    gcodeButton.addEventListener('click', function() {
        gcodeInput.click();
    });
    
    const uploadSvgInput = document.querySelector('#uploadSvg');
    if (uploadSvgInput) {
        uploadSvgInput.parentNode.insertBefore(gcodeButton, uploadSvgInput.nextSibling);
    }
}

window.onload = function () {
    init();
    addGcodeUploadButton();
};

// === ОСТАЛЬНОЙ СУЩЕСТВУЮЩИЙ КОД init() и другие функции ===
async function checkIfExtendedToHome(extendToHomeTime) {

