"use strict";

/*
  ============================================================
  VEYLIGN BEADS
  export.js

  Excel:
  ・作品全体を1シート
  ・1セル = 1ビーズ
  ・色番号入り
  ・使用ビーズ一覧

  PDF:
  ・A4縦
  ・実寸固定
  ・1マス = beadSize mm
  ・大型作品は自動分割
  ・隣接ページと1マス重複
  ・ページID
  ・担当範囲
  ・位置合わせマーク
  ・50mm実寸確認スケール
  ・印刷設定の注意書き
  ============================================================
*/


// ============================================================
// 外部ライブラリ
// ============================================================

const SHEETJS_URL =
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

const JSPDF_URL =
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";

const libraryPromises =
  new Map();


// ============================================================
// PDF設定
// ============================================================

const PDF_CONFIG = {
  pageWidthMm: 210,
  pageHeightMm: 297,

  /*
    一般的なプリンターでも扱いやすいよう
    紙端には寄せない。
  */
  marginLeftMm: 10,
  marginRightMm: 10,

  /*
    上下にはページ情報・注意書き用の
    スペースも確保。
  */
  contentTopMm: 24,
  contentBottomMm: 264,

  /*
    大型作品では隣のページと
    1マス重複させる。
  */
  overlapCells: 1
};


// ============================================================
// 外部スクリプトを一度だけ読み込む
// ============================================================

function loadScriptOnce(
  url,
  checkLoaded
) {
  if (checkLoaded()) {
    return Promise.resolve();
  }

  if (
    libraryPromises.has(url)
  ) {
    return libraryPromises.get(
      url
    );
  }

  const promise =
    new Promise(
      (resolve, reject) => {
        const script =
          document.createElement(
            "script"
          );

        script.src = url;
        script.async = true;

        script.onload =
          () => {
            if (checkLoaded()) {
              resolve();
            } else {
              reject(
                new Error(
                  "ライブラリを読み込めませんでした。"
                )
              );
            }
          };

        script.onerror =
          () => {
            reject(
              new Error(
                `ライブラリの読み込みに失敗しました: ${url}`
              )
            );
          };

        document.head.appendChild(
          script
        );
      }
    );

  libraryPromises.set(
    url,
    promise
  );

  return promise;
}


// ============================================================
// SheetJS
// ============================================================

async function ensureSheetJS() {
  await loadScriptOnce(
    SHEETJS_URL,
    () =>
      typeof window.XLSX !==
      "undefined"
  );

  return window.XLSX;
}


// ============================================================
// jsPDF
// ============================================================

async function ensureJsPDF() {
  await loadScriptOnce(
    JSPDF_URL,
    () =>
      Boolean(
        window.jspdf &&
        window.jspdf.jsPDF
      )
  );

  return window.jspdf.jsPDF;
}


// ============================================================
// ファイル名
// ============================================================

function createFileName(
  extension
) {
  const now =
    new Date();

  const parts = [
    now.getFullYear(),

    String(
      now.getMonth() + 1
    ).padStart(2, "0"),

    String(
      now.getDate()
    ).padStart(2, "0")
  ];

  const time =
    [
      String(
        now.getHours()
      ).padStart(2, "0"),

      String(
        now.getMinutes()
      ).padStart(2, "0")
    ].join("");

return (
  `VEYLIGN-BEADS_` +
  `${parts.join("")}_` +
  `${time}.` +
  extension
);
}


// ============================================================
// 明るさ
// ============================================================

function brightness(rgb) {
  return (
    rgb[0] * 0.299 +
    rgb[1] * 0.587 +
    rgb[2] * 0.114
  );
}


// ============================================================
// RGB → ARGB
// ============================================================

function rgbToExcelHex(rgb) {
  const hex =
    rgb
      .map(
        (value) =>
          Math.round(value)
            .toString(16)
            .padStart(2, "0")
      )
      .join("")
      .toUpperCase();

  return `FF${hex}`;
}


// ============================================================
// 使用ビーズ数
// ============================================================

function getTotalCount(counts) {
  return counts.reduce(
    (sum, count) =>
      sum + count,
    0
  );
}


// ============================================================
// Excel
// ============================================================

export async function exportExcel({
  cells,
  columns,
  rows,
  beadSize,
  palette,
  counts
}) {
  if (
    !cells ||
    !cells.length
  ) {
    throw new Error(
      "出力する台紙がありません。"
    );
  }

  const XLSX =
    await ensureSheetJS();


  // ==========================================================
  // 台紙
  // ==========================================================

  const patternRows = [];

  for (
    let row = 0;
    row < rows;
    row++
  ) {
    const rowData = [];

    for (
      let column = 0;
      column < columns;
      column++
    ) {
      const colorIndex =
        cells[
          row * columns +
          column
        ];

      if (
        colorIndex < 0
      ) {
        rowData.push("");
      } else {
        rowData.push(
          palette[
            colorIndex
          ].number
        );
      }
    }

    patternRows.push(
      rowData
    );
  }

  const patternSheet =
    XLSX.utils.aoa_to_sheet(
      patternRows
    );


  /*
    Excelではセルサイズを後から
    ユーザー自身で変更可能。

    ここでは正方形に近い見た目を
    初期値として設定する。
  */

  patternSheet["!cols"] =
    Array.from(
      {
        length: columns
      },
      () => ({
        wch: 3.2
      })
    );

  patternSheet["!rows"] =
    Array.from(
      {
        length: rows
      },
      () => ({
        hpt: 19
      })
    );


  // ==========================================================
  // セル色
  // ==========================================================

  for (
    let row = 0;
    row < rows;
    row++
  ) {
    for (
      let column = 0;
      column < columns;
      column++
    ) {
      const colorIndex =
        cells[
          row * columns +
          column
        ];

      if (
        colorIndex < 0
      ) {
        continue;
      }

      const address =
        XLSX.utils.encode_cell({
          r: row,
          c: column
        });

      const cell =
        patternSheet[address];

      if (!cell) {
        continue;
      }

      const color =
        palette[colorIndex];

      const textHex =
        brightness(
          color.rgb
        ) < 135
          ? "FFFFFFFF"
          : "FF000000";

      cell.s = {
        fill: {
          patternType: "solid",
          fgColor: {
            rgb:
              rgbToExcelHex(
                color.rgb
              )
          }
        },

        font: {
          bold: true,
          color: {
            rgb: textHex
          }
        },

        alignment: {
          horizontal:
            "center",
          vertical:
            "center"
        },

        border: {
          top: {
            style: "thin",
            color: {
              rgb:
                "FFD8DED8"
            }
          },

          bottom: {
            style: "thin",
            color: {
              rgb:
                "FFD8DED8"
            }
          },

          left: {
            style: "thin",
            color: {
              rgb:
                "FFD8DED8"
            }
          },

          right: {
            style: "thin",
            color: {
              rgb:
                "FFD8DED8"
            }
          }
        }
      };
    }
  }


  // ==========================================================
  // 使用ビーズ一覧
  // ==========================================================

  const summaryRows = [
    [
      "VEYLIGN BEADS"
    ],

    [],

    [
      "マス数",
      `${columns} × ${rows}`
    ],

    [
      "ビーズサイズ",
      beadSize,
      "mm"
    ],

    [
      "完成サイズ",
      columns * beadSize,
      "×",
      rows * beadSize,
      "mm"
    ],

    [
      "使用ビーズ",
      getTotalCount(
        counts
      ),
      "個"
    ],

    [],

    [
      "色番号",
      "色名",
      "使用個数"
    ]
  ];


  palette.forEach(
    (color, index) => {
      summaryRows.push(
        [
          color.number,
          color.name,
          counts[index] || 0
        ]
      );
    }
  );


  const summarySheet =
    XLSX.utils.aoa_to_sheet(
      summaryRows
    );

  summarySheet["!cols"] = [
    {
      wch: 14
    },
    {
      wch: 20
    },
    {
      wch: 14
    },
    {
      wch: 14
    },
    {
      wch: 10
    }
  ];


  // ==========================================================
  // Workbook
  // ==========================================================

  const workbook =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    patternSheet,
    "台紙"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    summarySheet,
    "使用ビーズ"
  );

  XLSX.writeFile(
    workbook,
    createFileName(
      "xlsx"
    )
  );
}


// ============================================================
// PDFページID
// ============================================================

function columnLabel(index) {
  /*
    0=A
    1=B
    ...
    25=Z
    26=AA
  */

  let value =
    index + 1;

  let result = "";

  while (
    value > 0
  ) {
    const remainder =
      (value - 1) % 26;

    result =
      String.fromCharCode(
        65 + remainder
      ) +
      result;

    value =
      Math.floor(
        (value - 1) / 26
      );
  }

  return result;
}


function pageId(
  pageColumn,
  pageRow
) {
  return (
    `${columnLabel(pageColumn)}` +
    `${pageRow + 1}`
  );
}


// ============================================================
// ページ分割情報
// ============================================================

function createPageSegments(
  totalCells,
  cellsPerPage,
  overlapCells
) {
  const segments = [];

  let start = 0;

  while (
    start < totalCells
  ) {
    const end =
      Math.min(
        totalCells,
        start +
        cellsPerPage
      );

    segments.push({
      start,
      end
    });

    if (
      end >= totalCells
    ) {
      break;
    }

    /*
      次ページは1マス重ねる。
    */

    const nextStart =
      end -
      overlapCells;

    /*
      無限ループ防止。
    */

    if (
      nextStart <= start
    ) {
      start = end;
    } else {
      start =
        nextStart;
    }
  }

  return segments;
}


// ============================================================
// PDF出力
// ============================================================

export async function exportPdf({
  cells,
  columns,
  rows,
  beadSize,
  palette,
  counts
}) {
  if (
    !cells ||
    !cells.length
  ) {
    throw new Error(
      "出力する台紙がありません。"
    );
  }

  if (
    !Number.isFinite(
      beadSize
    ) ||
    beadSize <= 0
  ) {
    throw new Error(
      "ビーズサイズが正しくありません。"
    );
  }

  const jsPDF =
    await ensureJsPDF();


  // ==========================================================
  // A4実寸領域
  // ==========================================================

  const printableWidth =
    PDF_CONFIG.pageWidthMm -
    PDF_CONFIG.marginLeftMm -
    PDF_CONFIG.marginRightMm;

  const printableHeight =
    PDF_CONFIG.contentBottomMm -
    PDF_CONFIG.contentTopMm;


  /*
    絶対に縮小しない。

    5mm指定なら
    1マスはPDF上でも必ず5mm。
  */

  const columnsPerPage =
    Math.floor(
      printableWidth /
      beadSize
    );

  const rowsPerPage =
    Math.floor(
      printableHeight /
      beadSize
    );


  if (
    columnsPerPage < 1 ||
    rowsPerPage < 1
  ) {
    throw new Error(
      "ビーズサイズがA4印刷領域より大きいためPDFを作成できません。"
    );
  }


  const horizontalSegments =
    createPageSegments(
      columns,
      columnsPerPage,
      PDF_CONFIG.overlapCells
    );

  const verticalSegments =
    createPageSegments(
      rows,
      rowsPerPage,
      PDF_CONFIG.overlapCells
    );


  const totalPages =
    horizontalSegments.length *
    verticalSegments.length;


  const document =
    new jsPDF({
      orientation:
        "portrait",

      unit:
        "mm",

      format:
        "a4",

      compress:
        true
    });


  let currentPage = 0;


  // ==========================================================
  // 全ページ
  // ==========================================================

  for (
    let pageRow = 0;
    pageRow <
      verticalSegments.length;
    pageRow++
  ) {
    for (
      let pageColumn = 0;
      pageColumn <
        horizontalSegments.length;
      pageColumn++
    ) {
      if (
        currentPage > 0
      ) {
        document.addPage(
          "a4",
          "portrait"
        );
      }

      currentPage++;

      const horizontal =
        horizontalSegments[
          pageColumn
        ];

      const vertical =
        verticalSegments[
          pageRow
        ];

      drawPatternPage({
        document,

        cells,
        columns,

        startColumn:
          horizontal.start,

        endColumn:
          horizontal.end,

        startRow:
          vertical.start,

        endRow:
          vertical.end,

        beadSize,
        palette,

        pageColumn,
        pageRow,

        horizontalSegments,
        verticalSegments,

        currentPage,
        totalPages,

        totalColumns:
          columns,

        totalRows:
          rows
      });
    }
  }


  document.save(
    createFileName(
      "pdf"
    )
  );
}
// ============================================================
// PDF：台紙1ページを描画
// ============================================================

function drawPatternPage({
  document,

  cells,
  columns,

  startColumn,
  endColumn,

  startRow,
  endRow,

  beadSize,
  palette,

  pageColumn,
  pageRow,

  horizontalSegments,
  verticalSegments,

  currentPage,
  totalPages,

  totalColumns,
  totalRows
}) {

  const localColumns =
    endColumn -
    startColumn;


  const localRows =
    endRow -
    startRow;


  const patternWidth =
    localColumns *
    beadSize;


  const patternHeight =
    localRows *
    beadSize;


  /*
    印刷可能領域の中央へ配置。

    ここでも拡大・縮小はしない。
    5mmなら必ず5mm。
  */

  const printableWidth =
    PDF_CONFIG.pageWidthMm -
    PDF_CONFIG.marginLeftMm -
    PDF_CONFIG.marginRightMm;


  const printableHeight =
    PDF_CONFIG.contentBottomMm -
    PDF_CONFIG.contentTopMm;


  const originX =
    PDF_CONFIG.marginLeftMm +
    Math.max(
      0,
      (
        printableWidth -
        patternWidth
      ) /
      2
    );


  const originY =
    PDF_CONFIG.contentTopMm +
    Math.max(
      0,
      (
        printableHeight -
        patternHeight
      ) /
      2
    );


  // ==========================================================
  // ヘッダー
  // ==========================================================

  drawPdfHeader({
    document,

    pageColumn,
    pageRow,

    currentPage,
    totalPages,

    startColumn,
    endColumn,

    startRow,
    endRow,

    totalColumns,
    totalRows,

    beadSize
  });


  // ==========================================================
  // ビーズマス
  // ==========================================================

  for (
    let row = startRow;
    row < endRow;
    row++
  ) {

    for (
      let column = startColumn;
      column < endColumn;
      column++
    ) {

      const colorIndex =
        cells[
          row *
          columns +
          column
        ];


      const localColumn =
        column -
        startColumn;


      const localRow =
        row -
        startRow;


      const x =
        originX +
        localColumn *
        beadSize;


      const y =
        originY +
        localRow *
        beadSize;


      // ======================================================
      // ビーズ色
      // ======================================================

      if (
        colorIndex >= 0
      ) {

        const color =
          palette[
            colorIndex
          ];


        document.setFillColor(
          color.rgb[0],
          color.rgb[1],
          color.rgb[2]
        );


        document.rect(
          x,
          y,
          beadSize,
          beadSize,
          "F"
        );

      }


      // ======================================================
      // グリッド
      // ======================================================

      const globalMajor =
        column % 5 === 0 ||
        row % 5 === 0;


      if (
        globalMajor
      ) {

        document.setDrawColor(
          90,
          108,
          97
        );


        document.setLineWidth(
          0.22
        );

      }

      else {

        document.setDrawColor(
          190,
          198,
          191
        );


        document.setLineWidth(
          0.10
        );

      }


      document.rect(
        x,
        y,
        beadSize,
        beadSize
      );


      // ======================================================
      // 色番号
      // ======================================================

      if (
        colorIndex >= 0 &&
        beadSize >= 3
      ) {

        const color =
          palette[
            colorIndex
          ];


        const lightText =
          brightness(
            color.rgb
          ) < 135;


        if (
          lightText
        ) {

          document.setTextColor(
            255,
            255,
            255
          );

        }

        else {

          document.setTextColor(
            0,
            0,
            0
          );

        }


        /*
          jsPDFのフォントサイズはpt。

          beadSizeに合わせて
          見やすい範囲に制限する。
        */

        const fontSize =
          Math.max(
            5,
            Math.min(
              10,
              beadSize *
              1.3
            )
          );


        document.setFontSize(
          fontSize
        );


        document.text(
          String(
            color.number
          ),

          x +
          beadSize /
          2,

          y +
          beadSize *
          0.68,

          {
            align:
              "center"
          }
        );

      }

    }

  }


  // ==========================================================
  // 台紙外枠
  // ==========================================================

  document.setDrawColor(
    55,
    70,
    60
  );


  document.setLineWidth(
    0.35
  );


  document.rect(
    originX,
    originY,
    patternWidth,
    patternHeight
  );


  // ==========================================================
  // 位置合わせマーク
  // ==========================================================

  drawAlignmentMarks({

    document,

    originX,
    originY,

    patternWidth,
    patternHeight,

    beadSize,

    pageColumn,
    pageRow,

    horizontalSegments,
    verticalSegments

  });


  // ==========================================================
  // マス番号
  // ==========================================================

  drawCoordinateLabels({

    document,

    originX,
    originY,

    startColumn,
    endColumn,

    startRow,
    endRow,

    beadSize

  });


  // ==========================================================
  // フッター
  // ==========================================================

  drawPdfFooter({

    document,

    beadSize,

    pageColumn,
    pageRow,

    horizontalSegments,
    verticalSegments

  });

}


// ============================================================
// PDFヘッダー
// ============================================================

function drawPdfHeader({
  document,

  pageColumn,
  pageRow,

  currentPage,
  totalPages,

  startColumn,
  endColumn,

  startRow,
  endRow,

  totalColumns,
  totalRows,

  beadSize
}) {

  document.setTextColor(
    40,
    60,
    50
  );


  document.setFontSize(
    11
  );


  document.text(
    "VEYLIGN BEADS",
    10,
    10
  );


  document.setFontSize(
    8
  );


  const id =
    pageId(
      pageColumn,
      pageRow
    );


  document.text(
    `Page ${id}  (${currentPage}/${totalPages})`,
    10,
    15
  );


  /*
    人間向けに1始まりで表示
  */

  const rangeText =
    `Columns ${startColumn + 1}-${endColumn} / ${totalColumns}` +
    `   Rows ${startRow + 1}-${endRow} / ${totalRows}`;


  document.text(
    rangeText,
    10,
    19
  );


  document.text(
    `Bead size: ${beadSize} mm`,
    150,
    10
  );

}


// ============================================================
// 位置合わせマーク
// ============================================================

function drawAlignmentMarks({
  document,

  originX,
  originY,

  patternWidth,
  patternHeight,

  beadSize,

  pageColumn,
  pageRow,

  horizontalSegments,
  verticalSegments
}) {

  const markLength =
    Math.min(
      4,
      Math.max(
        2,
        beadSize *
        0.7
      )
    );


  document.setDrawColor(
    25,
    25,
    25
  );


  document.setLineWidth(
    0.25
  );


  // ==========================================================
  // 左ページと重なる場合
  // ==========================================================

  if (
    pageColumn > 0
  ) {

    const x =
      originX +
      beadSize /
      2;


    const top =
      originY -
      2;


    document.line(
      x -
      markLength,
      top,
      x +
      markLength,
      top
    );


    document.line(
      x,
      top -
      markLength,
      x,
      top +
      markLength
    );

  }


  // ==========================================================
  // 右ページあり
  // ==========================================================

  if (
    pageColumn <
    horizontalSegments.length -
    1
  ) {

    const x =
      originX +
      patternWidth -
      beadSize /
      2;


    const top =
      originY -
      2;


    document.line(
      x -
      markLength,
      top,
      x +
      markLength,
      top
    );


    document.line(
      x,
      top -
      markLength,
      x,
      top +
      markLength
    );

  }


  // ==========================================================
  // 上ページと重なる場合
  // ==========================================================

  if (
    pageRow > 0
  ) {

    const y =
      originY +
      beadSize /
      2;


    const left =
      originX -
      2;


    document.line(
      left -
      markLength,
      y,
      left +
      markLength,
      y
    );


    document.line(
      left,
      y -
      markLength,
      left,
      y +
      markLength
    );

  }


  // ==========================================================
  // 下ページあり
  // ==========================================================

  if (
    pageRow <
    verticalSegments.length -
    1
  ) {

    const y =
      originY +
      patternHeight -
      beadSize /
      2;


    const left =
      originX -
      2;


    document.line(
      left -
      markLength,
      y,
      left +
      markLength,
      y
    );


    document.line(
      left,
      y -
      markLength,
      left,
      y +
      markLength
    );

  }

}


// ============================================================
// マス座標
// ============================================================

function drawCoordinateLabels({
  document,

  originX,
  originY,

  startColumn,
  endColumn,

  startRow,
  endRow,

  beadSize
}) {

  document.setTextColor(
    80,
    90,
    84
  );


  document.setFontSize(
    5.5
  );


  // ==========================================================
  // 横方向
  // 5マスごと
  // ==========================================================

  for (
    let column = startColumn;
    column < endColumn;
    column++
  ) {

    if (
      column % 5 !== 0
    ) {

      continue;

    }


    const x =
      originX +
      (
        column -
        startColumn
      ) *
      beadSize +
      beadSize /
      2;


    document.text(
      String(
        column + 1
      ),

      x,

      originY -
      1.5,

      {
        align:
          "center"
      }
    );

  }


  // ==========================================================
  // 縦方向
  // ==========================================================

  for (
    let row = startRow;
    row < endRow;
    row++
  ) {

    if (
      row % 5 !== 0
    ) {

      continue;

    }


    const y =
      originY +
      (
        row -
        startRow
      ) *
      beadSize +
      beadSize *
      0.65;


    document.text(
      String(
        row + 1
      ),

      originX -
      1.5,

      y,

      {
        align:
          "right"
      }
    );

  }

}


// ============================================================
// PDFフッター
// ============================================================

function drawPdfFooter({
  document,

  beadSize,

  pageColumn,
  pageRow,

  horizontalSegments,
  verticalSegments
}) {

  const footerY =
    271;


  document.setTextColor(
    70,
    80,
    74
  );


  document.setFontSize(
    6.5
  );


  document.text(
    "Print: A4 / 100% / Actual size / Disable Fit-to-page",
    10,
    footerY
  );


  document.text(
    `1 cell = ${beadSize} mm`,
    10,
    footerY + 4
  );


  // ==========================================================
  // 隣接ページ
  // ==========================================================

  const neighbours =
    [];


  if (
    pageRow > 0
  ) {

    neighbours.push(
      `UP ${pageId(
        pageColumn,
        pageRow - 1
      )}`
    );

  }


  if (
    pageRow <
    verticalSegments.length -
    1
  ) {

    neighbours.push(
      `DOWN ${pageId(
        pageColumn,
        pageRow + 1
      )}`
    );

  }


  if (
    pageColumn > 0
  ) {

    neighbours.push(
      `LEFT ${pageId(
        pageColumn - 1,
        pageRow
      )}`
    );

  }


  if (
    pageColumn <
    horizontalSegments.length -
    1
  ) {

    neighbours.push(
      `RIGHT ${pageId(
        pageColumn + 1,
        pageRow
      )}`
    );

  }


  if (
    neighbours.length
  ) {

    document.text(
      neighbours.join("   "),
      10,
      footerY + 8
    );

  }


  // ==========================================================
  // 50mm実寸確認
  // ==========================================================

  drawScaleCheck(
    document
  );

}


// ============================================================
// 50mm実寸確認スケール
// ============================================================

function drawScaleCheck(
  document
) {

  /*
    50 × 10mmの確認枠。

    印刷後、横幅を定規で測って
    50mmなら実寸印刷できている。
  */

  const x =
    145;


  const y =
    270;


  const width =
    50;


  const height =
    10;


  document.setDrawColor(
    40,
    50,
    44
  );


  document.setLineWidth(
    0.25
  );


  document.rect(
    x,
    y,
    width,
    height
  );


  // ==========================================================
  // 10mmごとの目盛り
  // ==========================================================

  for (
    let position = 0;
    position <= 50;
    position += 10
  ) {

    document.line(
      x +
      position,
      y,
      x +
      position,
      y + 3
    );

  }


  document.setTextColor(
    55,
    65,
    60
  );


  document.setFontSize(
    5.5
  );


  document.text(
    "50 mm SCALE CHECK",
    x +
    width /
    2,
    y + 6,

    {
      align:
        "center"
    }
  );


  document.text(
    "Print at 100%",
    x +
    width /
    2,
    y + 9,

    {
      align:
        "center"
    }
  );

}