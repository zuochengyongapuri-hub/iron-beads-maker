"use strict";
console.log("VEYLIGN BEADS app.js 起動成功");

/*
  ============================================================
  VEYLIGN BEADS
  app.js

  役割：
  ・画面操作
  ・画像読み込み
  ・ドラッグ＆ドロップ
  ・画像移動 / ズーム
  ・完成サイズ管理
  ・所有色ON/OFF
  ・converter.js呼び出し
  ・ビーズプレビュー描画
  ・export.jsへ出力データを渡す
  ============================================================
*/

import {
  PALETTE,
  clamp,
  convertToBeads,
  createPatternSummary
} from "./converter.js";

import {
  exportExcel,
  exportPdf
} from "./export.js";


// ============================================================
// DOM
// ============================================================

const $ = (id) =>
  document.getElementById(id);

const cropCanvas =
  $("cropCanvas");

const patternCanvas =
  $("patternCanvas");

const cropContext =
  cropCanvas.getContext("2d");

const patternContext =
  patternCanvas.getContext("2d");


// ============================================================
// 元画像保存用Canvas
// ============================================================

const sourceCanvas =
  document.createElement(
    "canvas"
  );

const sourceContext =
  sourceCanvas.getContext(
    "2d",
    {
      willReadFrequently: true
    }
  );


// ============================================================
// アプリ状態
// ============================================================

const state = {

  loaded: false,

  validSize: true,

  columns: 30,
  rows: 30,

  beadSize: 5,

  fitScale: 1,
  imageScale: 1,

  imageX: 0,
  imageY: 0,

  pointer: null,

  conversionTimer: null,

  loadId: 0,

  /*
    16色すべて所有状態で開始
  */

  availableColors:
    new Array(
      PALETTE.length
    ).fill(true),

  /*
    最新の変換結果
  */

  patternData:
    new Int16Array(
      30 * 30
    ).fill(-1),

  counts:
    new Array(
      PALETTE.length
    ).fill(0),

  totalBeads: 0,

  usedColorCount: 0,

  mergedCount: 0
};


// ============================================================
// 数字表示
// ============================================================

function formatNumber(value) {

  return Number(value)
    .toLocaleString(
      "ja-JP",
      {
        maximumFractionDigits: 2
      }
    );

}


// ============================================================
// エラー表示
// ============================================================

function showMessage(text = "") {

  $("message").textContent =
    text;

}


// ============================================================
// サイズ取得
// ============================================================

function readSizeSettings() {

  const beadSize =
    Number(
      $("beadSize").value
    );

  const width =
    Number(
      $("paperWidth").value
    );

  const height =
    Number(
      $("paperHeight").value
    );


  const columns =
    Math.round(
      width /
      beadSize
    );


  const rows =
    Math.round(
      height /
      beadSize
    );


  const valid =
    Number.isFinite(beadSize) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&

    beadSize >= 1 &&
    beadSize <= 20 &&

    width > 0 &&
    height > 0 &&

    columns >= 1 &&
    rows >= 1 &&

    columns <= 200 &&
    rows <= 200;


  return {
    beadSize,
    width,
    height,
    columns,
    rows,
    valid
  };

}


// ============================================================
// サイズ更新
// ============================================================

function updateSize() {

  const settings =
    readSizeSettings();


  state.validSize =
    settings.valid;


  $("placementControls").disabled =
    !state.loaded ||
    !settings.valid;


  if (
    !settings.valid
  ) {

    $("sizeResult").textContent =
      "サイズを確認してください";


    $("sizeError").textContent =
      "ビーズサイズは1〜20mm、縦横それぞれ1〜200マスになるよう入力してください。";


    $("previewStatus").textContent =
      "サイズ入力待ち";


    $("previewInfo").textContent =
      "サイズが無効なため変換を停止しています。";


    clearPattern();

    updateExportState();

    return;

  }


  $("sizeError").textContent =
    "";


  state.beadSize =
    settings.beadSize;


  state.columns =
    settings.columns;


  state.rows =
    settings.rows;


  $("sizeResult").innerHTML =
    `
      <strong>
        ${state.columns}
        ×
        ${state.rows}
      </strong>

      マス

      <br>

      実寸
      ${formatNumber(
        state.columns *
        state.beadSize
      )}
      ×
      ${formatNumber(
        state.rows *
        state.beadSize
      )}
      mm
    `;


  // ==========================================================
  // 配置Canvasサイズ
  // ==========================================================

  const unit =
    Math.min(
      24,
      840 /
      Math.max(
        state.columns,
        state.rows
      )
    );


  cropCanvas.width =
    Math.max(
      1,
      Math.round(
        state.columns *
        unit
      )
    );


  cropCanvas.height =
    Math.max(
      1,
      Math.round(
        state.rows *
        unit
      )
    );


  /*
    プレビューは1マス20px
  */

  patternCanvas.width =
    state.columns *
    20;


  patternCanvas.height =
    state.rows *
    20;


  if (
    state.loaded
  ) {

    fitImage(false);

  }

  else {

    clearPattern();

  }


  updateExportState();

}


// ============================================================
// 画像読み込み
// ============================================================

async function loadFile(file) {

  if (!file) {
    return;
  }


  showMessage("");


  /*
    画像形式
  */

  if (
    !/^image\/(png|jpeg|webp)$/i.test(
      file.type
    )
  ) {

    showMessage(
      "PNG・JPEG・WebPの画像を選択してください。"
    );

    return;

  }


  /*
    20MB制限
  */

  if (
    file.size >
    20 *
    1024 *
    1024
  ) {

    showMessage(
      "20MB以下の画像を選択してください。"
    );

    return;

  }


  const requestId =
    ++state.loadId;


  const url =
    URL.createObjectURL(
      file
    );


  try {

    const image =
      new Image();


    image.src =
      url;


    await image.decode();


    if (
      requestId !==
      state.loadId
    ) {

      return;

    }


    if (
      !image.naturalWidth ||
      !image.naturalHeight
    ) {

      throw new Error(
        "画像サイズが取得できません。"
      );

    }


    /*
      巨大画像は最大1600pxへ縮小
    */

    const factor =
      Math.min(
        1,

        1600 /
        Math.max(
          image.naturalWidth,
          image.naturalHeight
        )
      );


    sourceCanvas.width =
      Math.max(
        1,
        Math.round(
          image.naturalWidth *
          factor
        )
      );


    sourceCanvas.height =
      Math.max(
        1,
        Math.round(
          image.naturalHeight *
          factor
        )
      );


    sourceContext.clearRect(
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height
    );


    sourceContext.drawImage(
      image,
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height
    );


    state.loaded =
      true;


    $("imageInfo").textContent =
      `${file.name} · ${image.naturalWidth} × ${image.naturalHeight} px`;


    $("editorEmpty").hidden =
      true;


    $("previewEmpty").hidden =
      true;


    $("placementControls").disabled =
      !state.validSize;


    updateSize();

  }

  catch (error) {

    console.error(error);


    if (
      requestId ===
      state.loadId
    ) {

      showMessage(
        "画像を読み込めませんでした。別の画像を選択してください。"
      );

    }

  }

  finally {

    URL.revokeObjectURL(
      url
    );

  }

}


// ============================================================
// 画像全体を入れる / 枠いっぱい
// ============================================================

function fitImage(fill = false) {

  if (
    !state.loaded ||
    !state.validSize
  ) {

    return;

  }


  const fitX =
    cropCanvas.width /
    sourceCanvas.width;


  const fitY =
    cropCanvas.height /
    sourceCanvas.height;


  state.fitScale =
    Math.min(
      fitX,
      fitY
    );


  state.imageScale =
    fill
      ? Math.max(
          fitX,
          fitY
        )
      : state.fitScale;


  centerImage();

  syncZoom();

}


// ============================================================
// 中央配置
// ============================================================

function centerImage() {

  if (
    !state.loaded
  ) {

    return;

  }


  state.imageX =
    (
      cropCanvas.width -
      sourceCanvas.width *
      state.imageScale
    ) /
    2;


  state.imageY =
    (
      cropCanvas.height -
      sourceCanvas.height *
      state.imageScale
    ) /
    2;


  redraw();

}


// ============================================================
// ズーム表示
// ============================================================

function syncZoom() {

  if (
    !state.fitScale
  ) {

    return;

  }


  const percent =
    state.imageScale /
    state.fitScale *
    100;


  const slider =
    $("zoomSlider");


  slider.max =
    Math.max(
      800,
      Math.ceil(percent)
    );


  slider.value =
    percent;


  $("zoomValue").value =
    `${Math.round(percent)}%`;

}


// ============================================================
// 指定位置を中心にズーム
// ============================================================

function zoomTo(
  percent,
  anchorX = cropCanvas.width / 2,
  anchorY = cropCanvas.height / 2
) {

  if (
    !state.loaded ||
    !state.validSize
  ) {

    return;

  }


  const slider =
    $("zoomSlider");


  const nextScale =
    state.fitScale *
    clamp(
      percent,
      5,
      Number(
        slider.max
      )
    ) /
    100;


  const ratio =
    nextScale /
    state.imageScale;


  state.imageX =
    anchorX -
    (
      anchorX -
      state.imageX
    ) *
    ratio;


  state.imageY =
    anchorY -
    (
      anchorY -
      state.imageY
    ) *
    ratio;


  state.imageScale =
    nextScale;


  syncZoom();

  redraw();

}


// ============================================================
// 元画像描画
// ============================================================

function redraw() {

  cropContext.clearRect(
    0,
    0,
    cropCanvas.width,
    cropCanvas.height
  );


  if (
    !state.loaded
  ) {

    return;

  }


  cropContext.drawImage(
    sourceCanvas,

    state.imageX,
    state.imageY,

    sourceCanvas.width *
    state.imageScale,

    sourceCanvas.height *
    state.imageScale
  );


  scheduleConversion();

}


// ============================================================
// 変換予約
// ============================================================

function scheduleConversion() {

  clearTimeout(
    state.conversionTimer
  );


  if (
    !state.loaded ||
    !state.validSize
  ) {

    return;

  }


  $("previewStatus").textContent =
    "更新中…";


  state.conversionTimer =
    setTimeout(
      convertCurrentImage,
      70
    );

}


// ============================================================
// 現在画像をビーズ化
// ============================================================

function convertCurrentImage() {

  if (
    !state.loaded ||
    !state.validSize
  ) {

    return;

  }


  const result =
    convertToBeads({

      sourceCanvas,

      cropWidth:
        cropCanvas.width,

      cropHeight:
        cropCanvas.height,

      imageX:
        state.imageX,

      imageY:
        state.imageY,

      imageScale:
        state.imageScale,

      columns:
        state.columns,

      rows:
        state.rows,

      backgroundStrength:
        Number(
          $("backgroundThreshold").value
        ),

      lineStrength:
        Number(
          $("lineSensitivity").value
        ),

      colorBoost:
        Number(
          $("colorBoost").value
        ),

      availableColors:
        state.availableColors

    });


  state.patternData =
    result.cells;


  state.counts =
    result.counts;


  state.totalBeads =
    result.totalBeads;


  state.usedColorCount =
    result.usedColorCount;


  state.mergedCount =
    result.mergedCount;


  drawPattern();

  updateCounts();

  updatePreviewInfo();

  updateExportState();

}


// ============================================================
// プレビュー描画
// ============================================================

function drawPattern() {

  const unit =
    20;


  patternContext.clearRect(
    0,
    0,
    patternCanvas.width,
    patternCanvas.height
  );


  patternContext.fillStyle =
    "#ffffff";


  patternContext.fillRect(
    0,
    0,
    patternCanvas.width,
    patternCanvas.height
  );


  // ==========================================================
  // ビーズ
  // ==========================================================

  for (
    let index = 0;
    index < state.patternData.length;
    index++
  ) {

    const colorIndex =
      state.patternData[index];


    if (
      colorIndex < 0
    ) {

      continue;

    }


    const column =
      index %
      state.columns;


    const row =
      Math.floor(
        index /
        state.columns
      );


    const x =
      column *
      unit;


    const y =
      row *
      unit;


    const color =
      PALETTE[
        colorIndex
      ];


    patternContext.fillStyle =
      `rgb(${color.rgb.join(",")})`;


    patternContext.fillRect(
      x + 1,
      y + 1,
      unit - 2,
      unit - 2
    );


    /*
      ビーズの穴をイメージした中央表示
    */

    patternContext.beginPath();


    patternContext.arc(
      x + unit / 2,
      y + unit / 2,
      2.4,
      0,
      Math.PI * 2
    );


    patternContext.fillStyle =
      "rgba(255,255,255,0.48)";


    patternContext.fill();

  }


  // ==========================================================
  // グリッド
  // ==========================================================

  for (
    let column = 0;
    column <= state.columns;
    column++
  ) {

    const major =
      column % 5 === 0;


    patternContext.strokeStyle =
      major
        ? "rgba(52,75,53,0.37)"
        : "rgba(52,75,53,0.11)";


    patternContext.lineWidth =
      major
        ? 1.4
        : 0.7;


    patternContext.beginPath();


    patternContext.moveTo(
      column * unit,
      0
    );


    patternContext.lineTo(
      column * unit,
      patternCanvas.height
    );


    patternContext.stroke();

  }


  for (
    let row = 0;
    row <= state.rows;
    row++
  ) {

    const major =
      row % 5 === 0;


    patternContext.strokeStyle =
      major
        ? "rgba(52,75,53,0.37)"
        : "rgba(52,75,53,0.11)";


    patternContext.lineWidth =
      major
        ? 1.4
        : 0.7;


    patternContext.beginPath();


    patternContext.moveTo(
      0,
      row * unit
    );


    patternContext.lineTo(
      patternCanvas.width,
      row * unit
    );


    patternContext.stroke();

  }

}


// ============================================================
// プレビュー情報
// ============================================================

function updatePreviewInfo() {

  $("previewStatus").textContent =
    "プレビュー更新済み";


  let text =
    `${state.columns} × ${state.rows} マス`;


  text +=
    ` · 使用 ${formatNumber(state.totalBeads)} 個`;


  text +=
    ` · 空き ${formatNumber(
      state.columns *
      state.rows -
      state.totalBeads
    )} マス`;


  if (
    state.mergedCount > 0
  ) {

    text +=
      ` · 近似色 ${formatNumber(state.mergedCount)} 個を統合`;

  }


  if (
    state.totalBeads === 0
  ) {

    text +=
      " · ビーズがありません。配置・背景除去・所有色を確認してください。";

  }


  $("previewInfo").textContent =
    text;

}


// ============================================================
// 空パターン
// ============================================================

function clearPattern() {

  state.patternData =
    new Int16Array(
      Math.max(
        1,
        state.columns *
        state.rows
      )
    ).fill(-1);


  state.counts =
    new Array(
      PALETTE.length
    ).fill(0);


  state.totalBeads =
    0;


  state.usedColorCount =
    0;


  patternContext.clearRect(
    0,
    0,
    patternCanvas.width,
    patternCanvas.height
  );


  updateCounts();

}
// ============================================================
// 使用ビーズ数表示
// ============================================================

function updateCounts() {

  const items =
    PALETTE.map(
      (color, index) => {

        const item =
          document.createElement(
            "div"
          );


        item.className =
          `palette-item${state.counts[index] ? "" : " unused"}`;


        const swatch =
          document.createElement(
            "span"
          );


        swatch.className =
          "swatch";


        swatch.style.backgroundColor =
          `rgb(${color.rgb.join(",")})`;


        const text =
          document.createElement(
            "div"
          );


        const name =
          document.createElement(
            "b"
          );


        name.textContent =
          `${String(color.number).padStart(2, "0")} ${color.name}`;


        const count =
          document.createElement(
            "small"
          );


        count.textContent =
          `${formatNumber(state.counts[index])} 個`;


        text.append(
          name,
          count
        );


        item.append(
          swatch,
          text
        );


        return item;

      }
    );


  $("paletteGrid").replaceChildren(
    ...items
  );


  $("totalCount").textContent =
    `${formatNumber(state.totalBeads)} 個`;


  $("countSummary").textContent =
    `固定16色のうち ${state.usedColorCount} 色を使用`;

}


// ============================================================
// 所有色UI
// ============================================================

function createAvailableColorUI() {

  const grid =
    $("availableColorGrid");


  grid.replaceChildren();


  PALETTE.forEach(
    (color, index) => {

      const label =
        document.createElement(
          "label"
        );


      label.className =
        "available-color-item";


      const checkbox =
        document.createElement(
          "input"
        );


      checkbox.type =
        "checkbox";


      checkbox.checked =
        state.availableColors[index];


      checkbox.dataset.colorIndex =
        String(index);


      const swatch =
        document.createElement(
          "span"
        );


      swatch.className =
        "available-color-swatch";


      swatch.style.backgroundColor =
        `rgb(${color.rgb.join(",")})`;


      const name =
        document.createElement(
          "span"
        );


      name.className =
        "available-color-name";


      name.textContent =
        `${String(color.number).padStart(2, "0")} ${color.name}`;


      const check =
        document.createElement(
          "span"
        );


      check.className =
        "available-color-check";


      check.textContent =
        checkbox.checked
          ? "✓"
          : "—";


      // --------------------------------------------------------
      // ON / OFF
      // --------------------------------------------------------

      checkbox.addEventListener(
        "change",
        () => {

          state.availableColors[index] =
            checkbox.checked;


          updateAvailableColorItem(
            label,
            checkbox,
            check
          );


          updateAvailableColorInfo();


          scheduleConversion();

        }
      );


      label.append(
        checkbox,
        swatch,
        name,
        check
      );


      updateAvailableColorItem(
        label,
        checkbox,
        check
      );


      grid.appendChild(
        label
      );

    }
  );


  updateAvailableColorInfo();

}


// ============================================================
// 所有色1項目の表示更新
// ============================================================

function updateAvailableColorItem(
  label,
  checkbox,
  check
) {

  label.classList.toggle(
    "disabled-color",
    !checkbox.checked
  );


  check.textContent =
    checkbox.checked
      ? "✓"
      : "—";

}


// ============================================================
// 所有色情報
// ============================================================

function updateAvailableColorInfo() {

  const count =
    state.availableColors.filter(
      Boolean
    ).length;


  if (
    count === 16
  ) {

    $("availableColorInfo").textContent =
      "16色すべて使用できます";

  }

  else if (
    count === 0
  ) {

    $("availableColorInfo").textContent =
      "使用できる色がありません。1色以上選択してください。";

  }

  else {

    $("availableColorInfo").textContent =
      `${count}色を変換に使用します`;

  }

}


// ============================================================
// 全色選択
// ============================================================

function selectAllColors() {

  state.availableColors.fill(
    true
  );


  createAvailableColorUI();


  scheduleConversion();

}


// ============================================================
// 全色解除
// ============================================================

function clearAllColors() {

  state.availableColors.fill(
    false
  );


  createAvailableColorUI();


  /*
    全解除の場合も即座に
    プレビューを空にする。
  */

  scheduleConversion();

}


// ============================================================
// 出力欄更新
// ============================================================

function updateExportState() {

  const widthMm =
    state.columns *
    state.beadSize;


  const heightMm =
    state.rows *
    state.beadSize;


  $("exportGridSize").textContent =
    `${state.columns} × ${state.rows}`;


  $("exportRealSize").textContent =
    `${formatNumber(widthMm)} × ${formatNumber(heightMm)} mm`;


  $("exportBeadCount").textContent =
    `${formatNumber(state.totalBeads)} 個`;


  $("exportColorCount").textContent =
    `${state.usedColorCount} 色`;


  const canExport =
    state.loaded &&
    state.validSize &&
    state.totalBeads > 0;


  $("exportExcelButton").disabled =
    !canExport;


  $("exportPdfButton").disabled =
    !canExport;


  if (
    !state.loaded
  ) {

    $("exportMessage").textContent =
      "画像を読み込むと出力できます。";

  }

  else if (
    !state.validSize
  ) {

    $("exportMessage").textContent =
      "完成サイズを確認してください。";

  }

  else if (
    state.availableColors.every(
      (value) =>
        !value
    )
  ) {

    $("exportMessage").textContent =
      "使用できるビーズ色を1色以上選択してください。";

  }

  else if (
    state.totalBeads === 0
  ) {

    $("exportMessage").textContent =
      "ビーズがありません。配置や変換設定を調整してください。";

  }

  else {

    $("exportMessage").textContent =
      "現在のプレビューをExcelまたはPDFに出力できます。";

  }

}


// ============================================================
// Excel出力
// ============================================================

async function handleExcelExport() {

  if (
    state.totalBeads <= 0
  ) {

    return;

  }


  $("exportMessage").textContent =
    "Excelを作成しています…";


  try {

    await exportExcel({

      cells:
        state.patternData,

      columns:
        state.columns,

      rows:
        state.rows,

      beadSize:
        state.beadSize,

      palette:
        PALETTE,

      counts:
        state.counts

    });


    $("exportMessage").textContent =
      "Excelを出力しました。";

  }

  catch (error) {

    console.error(error);


    $("exportMessage").textContent =
      "Excelの出力に失敗しました。";

  }

}


// ============================================================
// PDF出力
// ============================================================

async function handlePdfExport() {

  if (
    state.totalBeads <= 0
  ) {

    return;

  }


  $("exportMessage").textContent =
    "PDFを作成しています…";


  try {

    await exportPdf({

      cells:
        state.patternData,

      columns:
        state.columns,

      rows:
        state.rows,

      beadSize:
        state.beadSize,

      palette:
        PALETTE,

      counts:
        state.counts

    });


    $("exportMessage").textContent =
      "PDFを出力しました。";

  }

  catch (error) {

    console.error(error);


    $("exportMessage").textContent =
      "PDFの出力に失敗しました。";

  }

}


// ============================================================
// 画像選択ボタン
// ============================================================

$("chooseButton").addEventListener(
  "click",
  () => {

    $("fileInput").click();

  }
);


$("fileInput").addEventListener(
  "change",
  (event) => {

    loadFile(
      event.target.files[0]
    );


    /*
      同じ画像をもう一度選択可能にする
    */

    event.target.value =
      "";

  }
);


// ============================================================
// ドラッグ＆ドロップ
// ============================================================

let dragDepth =
  0;


$("dropArea").addEventListener(
  "dragenter",
  (event) => {

    event.preventDefault();

    event.stopPropagation();


    dragDepth++;


    $("dropArea").classList.add(
      "dragover"
    );

  }
);


$("dropArea").addEventListener(
  "dragover",
  (event) => {

    event.preventDefault();

    event.stopPropagation();


    if (
      event.dataTransfer
    ) {

      event.dataTransfer.dropEffect =
        "copy";

    }

  }
);


$("dropArea").addEventListener(
  "dragleave",
  (event) => {

    event.preventDefault();

    event.stopPropagation();


    dragDepth--;


    if (
      dragDepth <= 0
    ) {

      dragDepth =
        0;


      $("dropArea").classList.remove(
        "dragover"
      );

    }

  }
);


$("dropArea").addEventListener(
  "drop",
  (event) => {

    event.preventDefault();

    event.stopPropagation();


    dragDepth =
      0;


    $("dropArea").classList.remove(
      "dragover"
    );


    const files =
      event.dataTransfer
        ?.files;


    if (
      !files ||
      !files.length
    ) {

      return;

    }


    loadFile(
      files[0]
    );

  }
);


// ============================================================
// ページ全体へのファイルドロップで
// ブラウザが画像へ遷移するのを防ぐ
// ============================================================

window.addEventListener(
  "dragover",
  (event) => {

    event.preventDefault();

  }
);


window.addEventListener(
  "drop",
  (event) => {

    event.preventDefault();

  }
);


// ============================================================
// サイズ変更
// ============================================================

for (
  const id of [
    "beadSize",
    "paperWidth",
    "paperHeight"
  ]
) {

  $(id).addEventListener(
    "input",
    updateSize
  );

}


// ============================================================
// 変換調整
// ============================================================

const conversionInputs = [

  [
    "backgroundThreshold",
    "backgroundValue"
  ],

  [
    "lineSensitivity",
    "lineValue"
  ],

  [
    "colorBoost",
    "colorValue"
  ]

];


for (
  const [
    inputId,
    outputId
  ] of conversionInputs
) {

  $(inputId).addEventListener(
    "input",
    () => {

      $(outputId).value =
        $(inputId).value;


      scheduleConversion();

    }
  );

}


// ============================================================
// 配置ボタン
// ============================================================

$("fitButton").addEventListener(
  "click",
  () => {

    fitImage(false);

  }
);


$("fillButton").addEventListener(
  "click",
  () => {

    fitImage(true);

  }
);


$("centerButton").addEventListener(
  "click",
  () => {

    centerImage();

    syncZoom();

  }
);


// ============================================================
// ズームスライダー
// ============================================================

$("zoomSlider").addEventListener(
  "input",
  () => {

    zoomTo(
      Number(
        $("zoomSlider").value
      )
    );

  }
);


// ============================================================
// ホイールズーム
// ============================================================

cropCanvas.addEventListener(
  "wheel",
  (event) => {

    if (
      !state.loaded ||
      !state.validSize
    ) {

      return;

    }


    event.preventDefault();


    const rect =
      cropCanvas.getBoundingClientRect();


    const currentPercent =
      state.imageScale /
      state.fitScale *
      100;


    const zoomFactor =
      Math.exp(
        -clamp(
          event.deltaY,
          -100,
          100
        ) *
        0.002
      );


    const anchorX =
      (
        event.clientX -
        rect.left
      ) /
      rect.width *
      cropCanvas.width;


    const anchorY =
      (
        event.clientY -
        rect.top
      ) /
      rect.height *
      cropCanvas.height;


    zoomTo(
      currentPercent *
      zoomFactor,

      anchorX,
      anchorY
    );

  },

  {
    passive: false
  }
);


// ============================================================
// 画像ドラッグ開始
// ============================================================

cropCanvas.addEventListener(
  "pointerdown",
  (event) => {

    if (
      !state.loaded ||
      !state.validSize ||
      event.button !== 0 ||
      state.pointer
    ) {

      return;

    }


    state.pointer = {

      id:
        event.pointerId,

      x:
        event.clientX,

      y:
        event.clientY

    };


    cropCanvas.setPointerCapture(
      event.pointerId
    );


    cropCanvas.classList.add(
      "dragging"
    );

  }
);


// ============================================================
// 画像ドラッグ移動
// ============================================================

cropCanvas.addEventListener(
  "pointermove",
  (event) => {

    const pointer =
      state.pointer;


    if (
      !pointer ||
      pointer.id !==
      event.pointerId
    ) {

      return;

    }


    const rect =
      cropCanvas.getBoundingClientRect();


    const scaleX =
      cropCanvas.width /
      rect.width;


    const scaleY =
      cropCanvas.height /
      rect.height;


    state.imageX +=
      (
        event.clientX -
        pointer.x
      ) *
      scaleX;


    state.imageY +=
      (
        event.clientY -
        pointer.y
      ) *
      scaleY;


    pointer.x =
      event.clientX;


    pointer.y =
      event.clientY;


    redraw();

  }
);


// ============================================================
// 画像ドラッグ終了
// ============================================================

function stopDragging(event) {

  if (
    !state.pointer ||
    state.pointer.id !==
    event.pointerId
  ) {

    return;

  }


  state.pointer =
    null;


  cropCanvas.classList.remove(
    "dragging"
  );


  if (
    cropCanvas.hasPointerCapture(
      event.pointerId
    )
  ) {

    cropCanvas.releasePointerCapture(
      event.pointerId
    );

  }

}


for (
  const eventType of [
    "pointerup",
    "pointercancel",
    "lostpointercapture"
  ]
) {

  cropCanvas.addEventListener(
    eventType,
    stopDragging
  );

}


// ============================================================
// キーボードで配置微調整
// ============================================================

cropCanvas.addEventListener(
  "keydown",
  (event) => {

    if (
      !state.loaded ||
      !state.validSize
    ) {

      return;

    }


    const movements = {

      ArrowLeft:
        [-1, 0],

      ArrowRight:
        [1, 0],

      ArrowUp:
        [0, -1],

      ArrowDown:
        [0, 1]

    };


    if (
      movements[
        event.key
      ]
    ) {

      event.preventDefault();


      const amount =
        event.shiftKey
          ? 10
          : 1;


      state.imageX +=
        movements[
          event.key
        ][0] *
        amount;


      state.imageY +=
        movements[
          event.key
        ][1] *
        amount;


      redraw();


      return;

    }


    if (
      [
        "+",
        "=",
        "-"
      ].includes(
        event.key
      )
    ) {

      event.preventDefault();


      const currentPercent =
        state.imageScale /
        state.fitScale *
        100;


      zoomTo(
        currentPercent *
        (
          event.key === "-"
            ? 0.9
            : 1.1
        )
      );

    }

  }
);


// ============================================================
// 色選択ボタン
// ============================================================

$("selectAllColors").addEventListener(
  "click",
  selectAllColors
);


$("clearAllColors").addEventListener(
  "click",
  clearAllColors
);


// ============================================================
// 出力ボタン
// ============================================================

$("exportExcelButton").addEventListener(
  "click",
  handleExcelExport
);


$("exportPdfButton").addEventListener(
  "click",
  handlePdfExport
);


// ============================================================
// 初期化
// ============================================================

function initialize() {

  /*
    スライダー値
  */

  $("backgroundValue").value =
    $("backgroundThreshold").value;


  $("lineValue").value =
    $("lineSensitivity").value;


  $("colorValue").value =
    $("colorBoost").value;


  /*
    所有色
  */

  createAvailableColorUI();


  /*
    サイズ
  */

  updateSize();


  /*
    使用数
  */

  updateCounts();


  /*
    出力
  */

  updateExportState();

}


// ============================================================
// 起動
// ============================================================

initialize();
