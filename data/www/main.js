import * as svgControl from "./svgControl.js";
import * as client from "./client.js";

// === Progress Bar Functions ===
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

let currentState = null;
let currentWorker = null;
let uploadConvertedCommands = null;

// === Cached DOM Elements ===
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
  chooseRendererSlide: null,
};

// === Logger ===
const logger = {
  info: (message, data = null) => {
    console.log(`[INFO] ${message}`, data ? data : "");
  },
  error: (message, error = null) => {
    console.error(`[ERROR] ${message}`, error ? error : "");
  },
  warn: (message, data = null) => {
    console.warn(`[WARN] ${message}`, data ? data : "");
  },
};

// === G-Code Support Functions ===
function handleGcodeFileUpload(file) {
  const reader = new FileReader();

  reader.onload = function (e) {
    const gcodeContent = e.target.result;

    const renderRequest = {
      type: "renderGcode",
      gcode: gcodeContent,
      width: svgControl.getTargetWidth(),
      height: svgControl.getTargetHeight(),
      homeX: currentState ? currentState.homeX : 100,
      homeY: currentState ? currentState.homeY : 100,
    };

    if (currentWorker) {
      logger.info("Terminating previous worker");
      currentWorker.terminate();
    }

    // Disable settings for G-code
    window.currentRendererFunction = null;

    window.currentPreviewId++;
    const thisPreviewId = window.currentPreviewId;

    if (window.currentPreviewId === thisPreviewId) {
      currentWorker = new Worker("./worker/worker.js?v=" + Date.now());

      currentWorker.onmessage = (e) => {
        if (e.data.type === "status") {
          domCache.progressBar.text(e.data.payload);
        } else if (e.data.type === "renderer") {
          logger.info("G-code rendering finished!");

          uploadConvertedCommands = e.data.payload.commands.join("\n");
          const resultSvgJson = e.data.payload.svgJson;
          const resultDataUrl = svgControl.convertJsonToDataURL(
            resultSvgJson,
            svgControl.getTargetWidth(),
            svgControl.getTargetHeight(),
          );

          const totalDistanceM = +(e.data.payload.distance / 1000).toFixed(1);
          const drawDistanceM = +(e.data.payload.drawDistance / 1000).toFixed(
            1,
          );

          deactivateProgressBar();
          domCache.previewSvg.attr("src", resultDataUrl);
          domCache.distances.text(
            `Total: ${totalDistanceM}m / Draw: ${drawDistanceM}m`,
          );
          $(".svg-preview").show();
          domCache.acceptSvg.removeAttr("disabled");
          if (e.data.payload.commands) {
            renderPath(
              e.data.payload.commands,
              svgControl.getTargetWidth(),
              svgControl.getTargetHeight(),
            );
          }
        } else if (e.data.type === "error") {
          logger.error("G-code worker error", e.data.payload);
          alert("G-code processing error: " + e.data.payload);
          deactivateProgressBar();
          domCache.acceptSvg.attr("disabled", "disabled");
        }
      };

      currentWorker.onerror = (error) => {
        logger.error("G-code worker error", error);
        alert("Worker error: " + error.message);
        deactivateProgressBar();
        domCache.acceptSvg.attr("disabled", "disabled");
      };

      currentWorker.postMessage(renderRequest);
    }
  };

  reader.readAsText(file);
}

function addGcodeUploadButton() {
  const gcodeInput = document.createElement("input");
  gcodeInput.type = "file";
  gcodeInput.id = "uploadGcode";
  gcodeInput.accept = ".gcode,.nc,.txt";
  gcodeInput.style.display = "none";

  gcodeInput.addEventListener("change", function (e) {
    if (this.files.length > 0) {
      domCache.svgUploadSlide.hide();
      domCache.drawingPreviewSlide.show();
      activateProgressBar();
      domCache.acceptSvg.attr("disabled", "disabled");
      handleGcodeFileUpload(this.files[0]);
    }
  });

  document.body.appendChild(gcodeInput);

  const gcodeButton = document.createElement("button");
  gcodeButton.type = "button";
  gcodeButton.className = "w-100 btn btn-lg btn-outline-primary mb-2";
  gcodeButton.innerHTML = '<i class="bi bi-code-slash"></i> Upload G-code';

  gcodeButton.addEventListener("click", function () {
    gcodeInput.click();
  });

  if (domCache.uploadSvg) {
    domCache.uploadSvg.parentNode.insertBefore(
      gcodeButton,
      domCache.uploadSvg.nextSibling,
    );
  }
}

// === DOM Cache Initialization ===
function initializeDomCache() {
  domCache.progressBar = $("#progressBar");
  domCache.previewSvg = $("#previewSvg");
  domCache.distances = $("#distances");
  domCache.acceptSvg = $("#acceptSvg");
  domCache.uploadSvg = document.querySelector("#uploadSvg");
  domCache.infillDensity = $("#infillDensity");
  domCache.turdSize = $("#turdSize");
  domCache.flattenPathsCheckbox = $("#flattenPathsCheckbox");
  domCache.svgUploadSlide = $("#svgUploadSlide");
  domCache.drawingPreviewSlide = $("#drawingPreviewSlide");
  domCache.chooseRendererSlide = $("#chooseRendererSlide");
}

// === Helper Functions ===
function verifyUpload(state) {
  $.ajax({
    url: "/downloadCommands",
    processData: false,
    contentType: false,
    type: "GET",
    success: function (data) {
      const receivedData = data.split("\n");
      const sentData = uploadConvertedCommands.split("\n");

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

      setTimeout(function () {
        adaptToState(state);
      }, 1000);
    },
    error: function (err) {
      logger.error("Failed to download commands from Mural!", err);
      alert("Failed to download commands from Mural! " + err);
      window.location.reload();
    },
    xhr: function () {
      const xhr = new window.XMLHttpRequest();

      xhr.addEventListener(
        "progress",
        function (evt) {
          if (evt.lengthComputable) {
            const percentComplete = evt.loaded / evt.total;
            const percentCompleteInt = parseInt(percentComplete * 100);
            $("#verificationProgress")
              .attr("aria-valuemax", evt.total.toString())
              .attr("aria-valuenow", evt.loaded.toString())
              .find(".progress-bar")
              .attr("style", `width: ${percentCompleteInt}%`);
          }
        },
        false,
      );

      return xhr;
    },
  });
}

function adaptToState(state) {
  $(".muralSlide").hide();
  currentState = state;

  // DEVELOPMENT MODE - REMOVE IN PRODUCTION
  domCache.svgUploadSlide.show();
  return;
  // END DEVELOPMENT MODE
}

async function checkIfExtendedToHome(extendToHomeTime) {
  await new Promise((r) => setTimeout(r, extendToHomeTime * 1000));

  const waitPeriod = 2000;
  let done = false;

  while (!done) {
    try {
      const state = await $.get("/getState");
      if (state.phase !== "ExtendToHome") {
        adaptToState(state);
        done = true;
      } else {
        await new Promise((r) => setTimeout(r, waitPeriod));
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

    $.post(custom.url, custom.data || {}, function (state) {
      adaptToState(state);
    }).fail(function () {
      alert(`${custom.commandName} command failed`);
      location.reload();
    });
  }

  // Helper functions
  const getInfillDensity = () => parseInt(domCache.infillDensity.val()) || 0;
  const getTurdSize = () => parseInt(domCache.turdSize.val()) || 2;
  const getFlattenPaths = () => domCache.flattenPathsCheckbox.prop("checked");

  async function getUploadedSvgString() {
    const [file] = $("#uploadSvg")[0].files;
    return file ? await file.text() : null;
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
      homeX: currentState ? currentState.homeX : 100,
      homeY: currentState ? currentState.homeY : 100,
      infillDensity: getInfillDensity(),
      flattenPaths: getFlattenPaths(),
    };

    worker.onmessage = (e) => {
      if (e.data.type === "status") {
        domCache.progressBar.text(e.data.payload);
      } else if (e.data.type === "renderer") {
        logger.info("Worker finished!");

        uploadConvertedCommands = e.data.payload.commands.join("\n");
        const resultSvgJson = e.data.payload.svgJson;
        const resultDataUrl = svgControl.convertJsonToDataURL(
          resultSvgJson,
          svgControl.getTargetWidth(),
          svgControl.getTargetHeight(),
        );

        const totalDistanceM = +(e.data.payload.distance / 1000).toFixed(1);
        const drawDistanceM = +(e.data.payload.drawDistance / 1000).toFixed(1);

        deactivateProgressBar();
        domCache.previewSvg.attr("src", resultDataUrl);
        domCache.distances.text(
          `Total: ${totalDistanceM}m / Draw: ${drawDistanceM}m`,
        );
        $(".svg-preview").show();
        domCache.acceptSvg.removeAttr("disabled");
        if (e.data.payload.commands) {
          renderPath(
            e.data.payload.commands,
            svgControl.getTargetWidth(),
            svgControl.getTargetHeight(),
          );
        }
      } else if (e.data.type === "error") {
        logger.error("Renderer error", e.data.payload);
        alert("Rendering error: " + e.data.payload);
        deactivateProgressBar();
        domCache.acceptSvg.attr("disabled", "disabled");
      } else if (e.data.type === "log") {
        logger.info(`Worker: ${e.data.payload}`);
      }
    };

    worker.onerror = (error) => {
      logger.error("Worker error in renderSvgInWorker", error);
      alert("Worker error: " + error.message);
      deactivateProgressBar();
      domCache.acceptSvg.attr("disabled", "disabled");
    };

    worker.postMessage(renderRequest);
  }

  function renderPath(commands, imgWidth = 800, imgHeight = 600) {
    const canvas = document.getElementById("previewCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const scale =
      Math.min(canvas.width / imgWidth, canvas.height / imgHeight) * 0.9;
    const s = scale > 0 ? scale : 1;
    canvas.width = imgWidth * s;
    canvas.height = imgHeight * s;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    let firstDown = true;
    commands.forEach((cmd) => {
      const x = cmd.x * s;
      const y = cmd.y * s;
      if (cmd.cmd === "G1" && (cmd.z === 1 || cmd.pen === 1)) {
        if (firstDown) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          firstDown = false;
        } else {
          ctx.lineTo(x, y);
        }
      } else if (cmd.cmd === "G0") {
        if (!firstDown) {
          ctx.stroke();
        }
        firstDown = true;
      }
    });
    if (!firstDown) ctx.stroke();
    logger.info(`Rendered ${commands.length} commands, scale: ${s.toFixed(2)}`);
  }

  async function render_VectorRasterVector() {
    if (currentWorker) {
      logger.info("Terminating previous worker");
      currentWorker.terminate();
    }

    window.currentPreviewId++;
    const thisPreviewId = window.currentPreviewId;

    const svgString = await getUploadedSvgString();
    if (!svgString) {
      throw new Error("No SVG string");
    }

    activateProgressBar();
    domCache.progressBar.text("Rasterizing");
    const raster = await svgControl.getCurrentSvgImageData();

    const vectorizeRequest = {
      type: "vectorize",
      raster,
      turdSize: getTurdSize(),
    };

    if (window.currentPreviewId === thisPreviewId) {
      currentWorker = new Worker(`./worker/worker.js?v=${Date.now()}`);

      currentWorker.onmessage = (e) => {
        if (e.data.type === "status") {
          domCache.progressBar.text(e.data.payload);
        } else if (e.data.type === "vectorizer") {
          const vectorizedSvg = e.data.payload.svg;
          const scale = svgControl.getRenderScale();
          renderSvgInWorker(
            currentWorker,
            vectorizedSvg,
            svgControl.getTargetWidth() * scale,
            svgControl.getTargetHeight() * scale,
          );
        } else if (e.data.type === "log") {
          logger.info(`Worker: ${e.data.payload}`);
        } else if (e.data.type === "error") {
          logger.error("Vectorizer error", e.data.payload);
          alert("Vectorization error: " + e.data.payload);
          deactivateProgressBar();
          domCache.acceptSvg.attr("disabled", "disabled");
        }
      };

      currentWorker.onerror = (error) => {
        logger.error("Worker error in VectorRasterVector", error);
        alert("Worker error: " + error.message);
        deactivateProgressBar();
        domCache.acceptSvg.attr("disabled", "disabled");
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
      throw new Error("No SVG string");
    }

    if (window.currentPreviewId === thisPreviewId) {
      currentWorker = new Worker(`./worker/worker.js?v=${Date.now()}`);

      const renderSvg = svgControl.getRenderSvg();
      const renderSvgString = new XMLSerializer().serializeToString(renderSvg);
      const scale = svgControl.getRenderScale();
      renderSvgInWorker(
        currentWorker,
        renderSvgString,
        svgControl.getTargetWidth() * scale,
        svgControl.getTargetHeight() * scale,
      );
    }
  }

  $("#beltsRetracted").click(async function () {
    await client.leftRetractUp();
    await client.rightRetractUp();
    doneWithPhase();
  });

  $("#infillDensity, #turdSize, #flattenPathsCheckbox").on(
    "input change",
    async function () {
      // Check if renderer is available and not G-code
      if (!window.currentRendererFunction) {
        return;
      }

      try {
        activateProgressBar();
        domCache.acceptSvg.attr("disabled", "disabled");
        await window.currentRendererFunction();
      } catch (error) {
        logger.error("Renderer error", error);
        deactivateProgressBar();
        alert("Rendering failed: " + error.message);
      }
    },
  );

  $("#setDistance").click(function () {
    const inputValue = parseInt($("#distanceInput").val());
    if (isNaN(inputValue)) {
      throw new Error("input value is not a number");
    }

    doneWithPhase({
      url: "/setTopDistance",
      data: { distance: inputValue },
      commandName: "Set Top Distance",
    });
  });

  $("#leftMotorToggle").change(function () {
    if (this.checked) {
      client.leftRetractDown();
    } else {
      client.leftRetractUp();
    }
  });

  $("#rightMotorToggle").change(function () {
    if (this.checked) {
      client.rightRetractDown();
    } else {
      client.rightRetractUp();
    }
  });

  $("#extendToHome").click(function () {
    $(this).prop("disabled", true);
    $("#extendingSpinner").css("visibility", "visible");

    $.post("/extendToHome", {}).always(async function (res) {
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

  $("#servoRange").on(
    "input",
    $.throttle(250, function (e) {
      const servoValue = getServoValueFromInputValue();
      $.post("/setServo", { angle: servoValue });
    }),
  );

  const stepValue = 5;
  $("#penMinus").click(function () {
    $("#servoRange")[0].stepDown(stepValue);
    $("#servoRange").trigger("input");
  });

  $("#penPlus").click(function () {
    $("#servoRange")[0].stepUp(stepValue);
    $("#servoRange").trigger("input");
  });

  $("#setPenDistance").click(function () {
    const inputValue = getServoValueFromInputValue();
    doneWithPhase({
      url: "/setPenDistance",
      data: { angle: inputValue },
      commandName: "Set Pen Distance",
    });
  });

  $("#uploadSvg").change(async function () {
    const svgString = await getUploadedSvgString();

    if (svgString) {
      svgControl.setSvgString(
        svgString,
        currentState || { homeX: 100, homeY: 100 },
      );
      $(".svg-control").show();
      $("#preview").removeAttr("disabled");
    } else {
      $("#preview").attr("disabled", "disabled");
      $(".svg-control").hide();
      domCache.infillDensity.val(0);
      domCache.turdSize.val(2);
    }
  });

  // Global rendering variables
  window.currentPreviewId = 0;
  window.currentRendererFunction = null;

  $("#preview").click(async function () {
    domCache.svgUploadSlide.hide();
    domCache.chooseRendererSlide.show();
  });

  $("#pathTracing").click(async function () {
    $("label[for='turdSize'], #turdSize").hide();
    $("label[for='flattenPathsCheckbox'], #flattenPathsCheckbox").show();

    domCache.chooseRendererSlide.hide();
    domCache.drawingPreviewSlide.show();
    window.currentRendererFunction = render_PathTracing;
    await window.currentRendererFunction();
  });

  $("#vectorRasterVector").click(async function () {
    domCache.flattenPathsCheckbox.prop("checked", false);
    $("label[for='turdSize'], #turdSize").show();
    $("label[for='flattenPathsCheckbox'], #flattenPathsCheckbox").hide();

    domCache.chooseRendererSlide.hide();
    domCache.drawingPreviewSlide.show();
    window.currentRendererFunction = render_VectorRasterVector;
    await window.currentRendererFunction();
  });

  $(".backToSvgSelect").click(function () {
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

  $("#acceptSvg").click(function () {
    if (!uploadConvertedCommands) {
      throw new Error("Commands are empty");
    }

    domCache.acceptSvg.attr("disabled", "disabled");

    const commandsBlob = new Blob([uploadConvertedCommands], {
      type: "text/plain",
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
      type: "POST",
      success: function (data) {
        verifyUpload(data);
      },
      error: function (err) {
        logger.error("Upload to Mural failed!", err);
        alert("Upload to Mural failed! " + err);
        window.location.reload();
      },
      xhr: function () {
        const xhr = new window.XMLHttpRequest();

        xhr.upload.addEventListener(
          "progress",
          function (evt) {
            if (evt.lengthComputable) {
              const percentComplete = evt.loaded / evt.total;
              const percentCompleteInt = parseInt(percentComplete * 100);
              $("#uploadProgress")
                .attr("aria-valuemax", evt.total.toString())
                .attr("aria-valuenow", evt.loaded.toString())
                .find(".progress-bar")
                .attr("style", `width: ${percentCompleteInt}%`);
            }
          },
          false,
        );

        return xhr;
      },
    });
  });

  $("#beginDrawing").click(function () {
    $(".muralSlide").hide();
    $("#drawingBegan").show();
    $.post("/run", {});
  });

  $("#reset").click(function () {
    doneWithPhase();
    location.reload();
  });

  $("#leftMotorTool").on("input", function () {
    const leftMotorDir = parseInt($("#leftMotorTool").val());
    if (leftMotorDir <= -1) {
      client.leftRetractDown();
    } else if (leftMotorDir >= 1) {
      client.leftExtendDown();
    } else {
      client.leftRetractUp();
    }
  });

  $("#rightMotorTool").on("input", function () {
    const rightMotorDir = parseInt($("#rightMotorTool").val());
    if (rightMotorDir <= -1) {
      client.rightRetractDown();
    } else if (rightMotorDir >= 1) {
      client.rightExtendDown();
    } else {
      client.rightRetractUp();
    }
  });

  $("#parkServoTool").click(function () {
    $.post("/setServo", { angle: 0 });
  });

  $("#estepsTool").click(function () {
    $.post("/estepsCalibration", {});
  });

  const toolsModal = $("#toolsModal")[0];
  toolsModal.addEventListener("hidden.bs.modal", function (event) {
    client.rightRetractUp();
    client.leftRetractUp();
  });

  svgControl.initSvgControl();
  $("#loadingSlide").show();

  // Get initial state
  $.get("/getState")
    .done(function (state) {
      adaptToState(state);
    })
    .fail(function () {
      alert("Failed to get initial state!");
      location.reload();
    });
}

// === Main Entry Point ===
window.onload = function () {
  initializeDomCache();
  init();
  addGcodeUploadButton();
};
