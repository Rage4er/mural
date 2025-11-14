import * as svgControl from './svgControl.js';
import * as client from './client.js';

let currentState = null;
let currentWorker = null;
let uploadConvertedCommands = null;

// === КЭШИРОВАННЫЕ DOM-ЭЛЕМЕНТЫ ===
const domCache = {
    progressBar: null,
    previewSvg: null,
    distances: null,
    acceptSvg: null,
    uploadSvg: null,
    infillDensity: null,
    turdSize: null,
    flattenPathsCheckbox: null,
    svgUploadSlide: null,
    drawingPreviewSlide: null,
    chooseRendererSlide: null
};

// === ЕДИНЫЙ ЛОГГЕР ===
const logger = {
    info: (message, data = null) => {
        console.log(`[INFO] ${message}`, data ? data : '');
    },
    error: (message, error = null) => {
        console.error(`[ERROR] ${message}`, error ? error : '');
    },
    warn: (message, data = null) => {
        console.warn(`[WARN] ${message}`, data ? data : '');
    }
};

// === G-CODE SUPPORT FUNCTIONS ===
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
            logger.info("Terminating previous worker");
            currentWorker.terminate();
        }
        
        window.currentPreviewId++;
        const thisPreviewId = window.currentPreviewId;
        
        if (window.currentPreviewId === thisPreviewId) {
            currentWorker = new Worker('./worker/worker.js?v=' + Date.now());
            
            currentWorker.onmessage = (e) => {
                if (e.data.type === 'status') {
                    domCache.progressBar.text(e.data.payload);
                } else if (e.data.type === 'renderer') {
                    logger.info("G-code rendering finished!");

                    uploadConvertedCommands = e.data.payload.commands.join('\n');
                    const resultSvgJson = e.data.payload.svgJson;
                    const resultDataUrl = svgControl.convertJsonToDataURL(
                        resultSvgJson, 
                        svgControl.getTargetWidth(), 
                        svgControl.getTargetHeight()
                    );

                    const totalDistanceM = +(e.data.payload.distance / 1000).toFixed(1);
                    const drawDistanceM = +(e.data.payload.drawDistance / 1000).toFixed(1);
                    
                    deactivateProgressBar();
                    domCache.previewSvg.attr("src", resultDataUrl);
                    domCache.distances.text(`Total: ${totalDistanceM}m / Draw: ${drawDistanceM}m`);
                    $(".svg-preview").show();
                    domCache.acceptSvg.removeAttr("disabled");
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
            domCache.svgUploadSlide.hide();
            domCache.drawingPreviewSlide.show();
            activateProgressBar();
            domCache.acceptSvg.attr("disabled", "disabled");
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
    
    if (domCache.uploadSvg) {
        domCache.uploadSvg.parentNode.insertBefore(gcodeButton, domCache.uploadSvg.nextSibling);
    }
}

// === ИНИЦИАЛИЗАЦИЯ КЭША DOM-ЭЛЕМЕНТОВ ===
function initializeDomCache() {
    domCache.progressBar = $("#progressBar");
    domCache.previewSvg = $("#previewSvg");
    domCache.distances = $("#distances");
    domCache.acceptSvg = $("#acceptSvg");
    domCache.uploadSvg = document.querySelector('#uploadSvg');
    domCache.infillDensity = $("#infillDensity");
    domCache.turdSize = $("#turdSize");
    domCache.flattenPathsCheckbox = $("#flattenPathsCheckbox");
    domCache.svgUploadSlide = $("#svgUploadSlide");
    domCache.drawingPreviewSlide = $("#drawingPreviewSlide");
    domCache.chooseRendererSlide = $("#chooseRendererSlide");
}

// === ORIGINAL MURAL CODE - OPTIMIZED ===
window.onload = function () {
    initializeDomCache();
    init();
    addGcodeUploadButton();
};

async function checkIfExtendedToHome(extendToHomeTime) {
    await new Promise(r => setTimeout(r, extendToHomeTime * 1000));

    const waitPeriod = 2000;
    let done = false;
    
    while (!done) {
        try {
            const state = await $.get("/getState");
            if (state.phase !== 'ExtendToHome') {
                adaptToState(state);
                done = true;
            } else {
                await new Promise(r => setTimeout(r, waitPeriod));
            }
        } catch (err) {
            logger.error("Failed to get current phase", err);
            alert("Failed to get current phase: " + err);
            location.reload();
        }
    }
}

function init() {
    function doneWithPhase(custom) {
        $(".muralSlide").hide();
        $("#loadingSlide").show();
        
        if (!custom) {
            custom = {
                url: "/doneWithPhase",
                data: {},
                commandName: "Done With Phase",
            };
        }

        $.post(custom.url, custom.data || {}, function(state) {
            adaptToState(state);
        }).fail(function() {
            alert(`${custom.commandName} command failed`);
            location.reload();
        });
    }

    $("#beltsRetracted").click(async function() { 
        await client.leftRetractUp();
        await client.rightRetractUp();
        doneWithPhase();
    });

    $("#setDistance").click(function() {
        const inputValue = parseInt($("#distanceInput").val());
        if (isNaN(inputValue)) {
            throw new Error("input value is not a number");
        }

        doneWithPhase({
            url: "/setTopDistance",
            data: {distance: inputValue},
            commandName: "Set Top Distance",
        });
    });

    $("#leftMotorToggle").change(function() {
        if (this.checked) {
            client.leftRetractDown(); 
        } else {
            client.leftRetractUp();
        }
    });

    $("#rightMotorToggle").change(function() {
        if (this.checked) {
            client.rightRetractDown(); 
        } else {
            client.rightRetractUp();
        }
    });

    $("#extendToHome").click(function() {
        $(this).prop("disabled", true);
        $("#extendingSpinner").css('visibility', 'visible');
        
        $.post("/extendToHome", {})
        .always(async function(res) {
            const extendToHomeTime = parseInt(res);
            await checkIfExtendedToHome(extendToHomeTime);
        });
    });
    
    function getServoValueFromInputValue() {
        const inputValue = parseInt($("#servoRange").val());
        const value = 90 - inputValue;
        
        if (value < 0) return 0;
        if (value > 90) return 90;
        return value;
    }

    $("#servoRange").on('input', $.throttle(250, function (e) {
        const servoValue = getServoValueFromInputValue();
        $.post("/setServo", {angle: servoValue});
    }));

    const stepValue = 5;
    $("#penMinus").click(function() {
        $("#servoRange")[0].stepDown(stepValue);
        $("#servoRange").trigger('input');
    });

    $("#penPlus").click(function() {
        $("#servoRange")[0].stepUp(stepValue);
        $("#servoRange").trigger('input');
    });

    $("#setPenDistance").click(function () {
        const inputValue = getServoValueFromInputValue();
        doneWithPhase({
            url: "/setPenDistance",
            data: {angle: inputValue},
            commandName: "Set Pen Distance",
        });
    });

    async function getUploadedSvgString() {
        const [file] = $("#uploadSvg")[0].files;
        return file ? await file.text() : null;
    }

    $("#uploadSvg").change(async function() {
        const svgString = await getUploadedSvgString();
        
        if (svgString) {
            svgControl.setSvgString(svgString, currentState);
            $(".svg-control").show();
            $("#preview").removeAttr("disabled");
        } else {
            $("#preview").attr("disabled", "disabled");
            $(".svg-control").hide();
            domCache.infillDensity.val(0);
            domCache.turdSize.val(2);
        }
    });

    // Глобальные переменные для рендеринга
    window.currentPreviewId = 0;
    window.currentRendererFunction = null;

    async function render_VectorRasterVector() {
        if (currentWorker) {
            logger.info("Terminating previous worker");
            currentWorker.terminate();
        }
        
        window.currentPreviewId++;
        const thisPreviewId = window.currentPreviewId;

        const svgString = await getUploadedSvgString();
        if (!svgString) {
            throw new Error('No SVG string');
        }

        domCache.progressBar.text("Rasterizing");
        const raster = await svgControl.getCurrentSvgImageData();

        const vectorizeRequest = {
            type: 'vectorize',
            raster,
            turdSize: getTurdSize(),
        };

        if (window.currentPreviewId === thisPreviewId) {
            currentWorker = new Worker(`./worker/worker.js?v=${Date.now()}`);

            currentWorker.onmessage = (e) => {
                if (e.data.type === 'status') {
                    domCache.progressBar.text(e.data.payload);
                } else if (e.data.type === 'vectorizer') {
                    const vectorizedSvg = e.data.payload.svg;
                    const scale = svgControl.getRenderScale();
                    renderSvgInWorker(
                        currentWorker,
                        vectorizedSvg,
                        svgControl.getTargetWidth() * scale,
                        svgControl.getTargetHeight() * scale,
                    );
                } else if (e.data.type === 'log') {
                    logger.info(`Worker: ${e.data.payload}`);
                }
            };

            currentWorker.postMessage(vectorizeRequest);
        }
    }

    async function render_PathTracing() {
        if (currentWorker) {
            logger.info("Terminating previous worker");
            currentWorker.terminate();
        }
        
        window.currentPreviewId++;
        const thisPreviewId = window.currentPreviewId;

        const svgString = await getUploadedSvgString();
        if (!svgString) {
            throw new Error('No SVG string');
        }

        if (window.currentPreviewId === thisPreviewId) {
            currentWorker = new Worker(`./worker/worker.js?v=${Date.now()}`);
            
            currentWorker.onmessage = (e) => {
                if (e.data.type === 'status') {
                    domCache.progressBar.text(e.data.payload);
                } else if (e.data.type === 'log') {
                    logger.info(`Worker: ${e.data.payload}`);
                }
            };

            const renderSvg = svgControl.getRenderSvg();
            const renderSvgString = new XMLSerializer().serializeToString(renderSvg);
            renderSvgInWorker(
                currentWorker, 
                renderSvgString, 
                svgControl.getTargetWidth(), 
                svgControl.getTargetHeight()
            );
        }
    }

    function renderSvgInWorker(worker, svg, svgWidth, svgHeight) {
        const svgJson = svgControl.getSvgJson(svg);
       
        const renderRequest = {
            type: "renderSvg",
            svgJson,
            width: svgControl.getTargetWidth(),
            height: svgControl.getTargetHeight(),
            svgWidth,
            svgHeight,
            homeX: currentState.homeX,
            homeY: currentState.homeY,
            infillDensity: getInfillDensity(),
            flattenPaths: getFlattenPaths(),
        };

        worker.onmessage = (e) => {
            if (e.data.type === 'status') {
                domCache.progressBar.text(e.data.payload);
            } else if (e.data.type === 'renderer') {
                logger.info("Worker finished!");

                uploadConvertedCommands = e.data.payload.commands.join('\n');
                const resultSvgJson = e.data.payload.svgJson;
                const resultDataUrl = svgControl.convertJsonToDataURL(
                    resultSvgJson, 
                    svgControl.getTargetWidth(), 
                    svgControl.getTargetHeight()
                );

                const totalDistanceM = +(e.data.payload.distance / 1000).toFixed(1);
                const drawDistanceM = +(e.data.payload.drawDistance / 1000).toFixed(1);
                
                deactivateProgressBar();
                domCache.previewSvg.attr("src", resultDataUrl);
                domCache.distances.text(`Total: ${totalDistanceM}m / Draw: ${drawDistanceM}m`);
                $(".svg-preview").show();
                domCache.acceptSvg.removeAttr("disabled");
            }
        };

        worker.postMessage(renderRequest);
    }

    function activateProgressBar() {
        domCache.progressBar
            .addClass("progress-bar-striped progress-bar-animated")
            .removeClass("bg-success")
            .text("");
    }

    function deactivateProgressBar() {
        domCache.progressBar
            .removeClass("progress-bar-striped progress-bar-animated")
            .addClass("bg-success")
            .text("Success");
    }

    $("#infillDensity, #turdSize, #flattenPathsCheckbox").on('input change', async function() {
        activateProgressBar();
        domCache.acceptSvg.attr("disabled", "disabled");
        await window.currentRendererFunction();
    });

    $("#preview").click(async function() {
        domCache.svgUploadSlide.hide();
        domCache.chooseRendererSlide.show();
    });

    $("#pathTracing").click(async function() {
        $("label[for='turdSize'], #turdSize").hide();
        $("label[for='flattenPathsCheckbox'], #flattenPathsCheckbox").show();

        domCache.chooseRendererSlide.hide();
        domCache.drawingPreviewSlide.show();
        window.currentRendererFunction = render_PathTracing;
        await window.currentRendererFunction();
    });

    $("#vectorRasterVector").click(async function() {
        domCache.flattenPathsCheckbox.prop("checked", false);
        $("label[for='turdSize'], #turdSize").show();
        $("label[for='flattenPathsCheckbox'], #flattenPathsCheckbox").hide();

        domCache.chooseRendererSlide.hide();
        domCache.drawingPreviewSlide.show();
        window.currentRendererFunction = render_VectorRasterVector;
        await window.currentRendererFunction();
    });

    $(".backToSvgSelect").click(function() {
        uploadConvertedCommands = null;

        $(".loading").show();
        activateProgressBar();
        domCache.previewSvg.removeAttr("src");
        $(".svg-preview").hide();
        domCache.acceptSvg.attr("disabled", "disabled");

        domCache.svgUploadSlide.show();
        domCache.drawingPreviewSlide.hide();
        domCache.chooseRendererSlide.hide();
    });
    
    $("#acceptSvg").click(function() {
        if (!uploadConvertedCommands) {
            throw new Error('Commands are empty');
        }
        
        domCache.acceptSvg.attr("disabled", "disabled");

        const commandsBlob = new Blob([uploadConvertedCommands], {
            type: "text/plain"
        });

        $(".muralSlide").hide();
        $("#uploadProgress").show();

        const formData = new FormData();
        formData.append("commands", commandsBlob);

        $.ajax({
            url: "/uploadCommands",
            data: formData,
            processData: false,
            contentType: false,
            type: 'POST',
            success: function(data) {
                verifyUpload(data);
            },
            error: function(err) {
                logger.error('Upload to Mural failed!', err);
                alert('Upload to Mural failed! ' + err);
                window.location.reload();
            },
            xhr: function () {
                const xhr = new window.XMLHttpRequest();

                xhr.upload.addEventListener("progress", function (evt) {
                    if (evt.lengthComputable) {
                        const percentComplete = evt.loaded / evt.total;
                        const percentCompleteInt = parseInt(percentComplete * 100);
                        $("#uploadProgress")
                            .attr("aria-valuemax", evt.total.toString())
                            .attr("aria-valuenow", evt.loaded.toString())
                            .find(".progress-bar")
                            .attr("style", `width: ${percentCompleteInt}%`);
                    }
                }, false);

                return xhr;
            },
        });
    });

    $("#beginDrawing").click(function() {
        $(".muralSlide").hide();
        $("#drawingBegan").show();
        $.post("/run", {});
    });

    $("#reset").click(function() {
        doneWithPhase();
        location.reload();
    });

    $("#leftMotorTool").on('input', function() {
        const leftMotorDir = parseInt($("#leftMotorTool").val());
        if (leftMotorDir <= -1) {
            client.leftRetractDown(); 
        } else if (leftMotorDir >= 1) {
            client.leftExtendDown();
        } else {
            client.leftRetractUp();
        }
    });

    $("#rightMotorTool").on('input', function() {
        const rightMotorDir = parseInt($("#rightMotorTool").val());
        if (rightMotorDir <= -1) {
            client.rightRetractDown(); 
        } else if (rightMotorDir >= 1) {
            client.rightExtendDown();
        } else {
            client.rightRetractUp();
        }
    });

    $("#parkServoTool").click(function() {
        $.post("/setServo", {angle: 0});
    });

    $("#estepsTool").click(function() {
        $.post("/estepsCalibration", {});
    });

    const toolsModal = $("#toolsModal")[0];
    toolsModal.addEventListener('hidden.bs.modal', function (event) {
        client.rightRetractUp();
        client.leftRetractUp();
    });

    svgControl.initSvgControl();
    $("#loadingSlide").show();


    // === ЗАКОММЕНТИРОВАТЬ ЭТО ===
// $.get("/getState", function(data) {
//     adaptToState(data);
// }).fail(function() {
//     logger.error("Failed to retrieve state");
//     alert("Failed to retrieve state");
// });

function verifyUpload(state) {
    $.ajax({
        url: "/downloadCommands",
        processData: false,
        contentType: false,
        type: 'GET',
        success: function(data) {
            const receivedData = data.split('\n');
            const sentData = uploadConvertedCommands.split('\n');
            
            if (receivedData.length !== sentData.length) {
                alert("Data verification failed");
                window.location.reload();
                return;
            }
            
            for (let i = 0; i < receivedData.length; i++) {
                if (receivedData[i] !== sentData[i]) {
                    alert("Data verification failed");
                    window.location.reload();
                    return;
                }
            }
            
            setTimeout(function() {
                adaptToState(state);
            }, 1000);
        },
        error: function(err) {
            logger.error('Failed to download commands from Mural!', err);
            alert('Failed to download commands from Mural! ' + err);
            window.location.reload();
        },
        xhr: function () {
            const xhr = new window.XMLHttpRequest();
            
            xhr.addEventListener("progress", function (evt) {
                if (evt.lengthComputable) {
                    const percentComplete = evt.loaded / evt.total;
                    const percentCompleteInt = parseInt(percentComplete * 100);
                    $("#verificationProgress")
                        .attr("aria-valuemax", evt.total.toString())
                        .attr("aria-valuenow", evt.loaded.toString())
                        .find(".progress-bar")
                        .attr("style", `width: ${percentCompleteInt}%`);
                }
            }, false);

            return xhr;
        },
    });
}

// === ВРЕМЕННЫЙ МОК ДЛЯ ТЕСТИРОВАНИЯ ФРОНТЕНДА ===
function getMockState() {
    return {
        phase: "SvgSelect",
        homeX: 100,
        homeY: 100,
        moving: false,
        startedHoming: false
    };
}

function adaptToState(state) {
    $(".muralSlide").hide();
    currentState = state;
    
    // Для тестирования всегда показываем SVG загрузку
    domCache.svgUploadSlide.show();
    
    // Раскомментируйте для полной эмуляции, когда понадобится:
    /*
    switch(state.phase) {
        case "RetractBelts":
            $("#retractBeltsSlide").show();
            break;
        case "SetTopDistance":
            $("#distanceBetweenAnchorsSlide").show();
            break;
        case "ExtendToHome":
            $("#extendToHomeSlide").show();
            if (state.moving || state.startedHoming) {
                $("#extendToHome").prop("disabled", true);
                $("#extendingSpinner").css('visibility', 'visible');
                checkIfExtendedToHome();
            }
            break;
        case "PenCalibration":
            $.post("/setServo", {angle: 90});
            $("#penCalibrationSlide").show();
            break;
        case "SvgSelect":
            domCache.svgUploadSlide.show();
            break;
        case "BeginDrawing":
            $("#beginDrawingSlide").show();
            break;
        default:
            logger.warn("Unrecognized phase", state.phase);
            alert("Unrecognized phase");
    }
    */
}

// Закомментируем реальный запрос к бэкенду и используем мок
// $.get("/getState", function(data) {
//     adaptToState(data);
// }).fail(function() {
//     logger.error("Failed to retrieve state");
//     alert("Failed to retrieve state");
// });

// Используем мок-данные для тестирования
setTimeout(() => {
    const mockState = getMockState();
    adaptToState(mockState);
    logger.info("Using mock state for frontend testing", mockState);
}, 100);

function getInfillDensity() {
    const density = parseInt(domCache.infillDensity.val());
    if ([0, 1, 2, 3, 4].includes(density)) {
        return density;
    } else {
        throw new Error('Invalid density');
    }
}

function getTurdSize() {
    return parseInt(domCache.turdSize.val());
}

function getFlattenPaths() {
    return domCache.flattenPathsCheckbox.is(":checked");
}
}