"use strict";

/*
  ============================================================
  VEYLIGN BEADS
  converter.js

  役割：
  ・16色パレット管理
  ・背景除去
  ・画像 → ビーズデータ変換
  ・所有している色だけを使用
  ・細線の保持
  ・近似色の主色統合
  ・使用ビーズ集計

  UI操作はこのファイルでは行わない。
  ============================================================
*/


// ============================================================
// 固定16色パレット
// ============================================================

export const PALETTE = [
  {
    number: 1,
    name: "黒",
    rgb: [25, 25, 25]
  },
  {
    number: 2,
    name: "白",
    rgb: [245, 245, 240]
  },
  {
    number: 3,
    name: "グレー",
    rgb: [135, 135, 135]
  },
  {
    number: 4,
    name: "赤",
    rgb: [215, 40, 45]
  },
  {
    number: 5,
    name: "オレンジ",
    rgb: [235, 120, 35]
  },
  {
    number: 6,
    name: "黄",
    rgb: [240, 210, 45]
  },
  {
    number: 7,
    name: "黄緑",
    rgb: [145, 195, 60]
  },
  {
    number: 8,
    name: "緑",
    rgb: [45, 145, 75]
  },
  {
    number: 9,
    name: "水色",
    rgb: [80, 180, 205]
  },
  {
    number: 10,
    name: "青",
    rgb: [45, 95, 190]
  },
  {
    number: 11,
    name: "紺",
    rgb: [40, 55, 110]
  },
  {
    number: 12,
    name: "紫",
    rgb: [125, 70, 155]
  },
  {
    number: 13,
    name: "ピンク",
    rgb: [230, 120, 160]
  },
  {
    number: 14,
    name: "茶",
    rgb: [120, 75, 45]
  },
  {
    number: 15,
    name: "ベージュ",
    rgb: [220, 185, 140]
  },
  {
    number: 16,
    name: "肌色",
    rgb: [240, 195, 155]
  }
];


// ============================================================
// 基本関数
// ============================================================

export function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}


export function colorDistance(colorA, colorB) {
  const red =
    colorA[0] - colorB[0];

  const green =
    colorA[1] - colorB[1];

  const blue =
    colorA[2] - colorB[2];

  return Math.sqrt(
    red * red +
    green * green +
    blue * blue
  );
}


export function luminance(rgb) {
  return (
    rgb[0] * 0.2126 +
    rgb[1] * 0.7152 +
    rgb[2] * 0.0722
  );
}


// ============================================================
// 所有色配列を正規化
// ============================================================

function normalizeAvailableColors(availableColors) {
  /*
    指定がなければ16色全部使用可能。
  */

  if (!Array.isArray(availableColors)) {
    return new Array(
      PALETTE.length
    ).fill(true);
  }

  return PALETTE.map(
    (_, index) =>
      availableColors[index] !== false
  );
}


// ============================================================
// 使用可能色だけから最も近い色を探す
// ============================================================

export function nearestAvailableColor(
  rgb,
  availableColors
) {
  const available =
    normalizeAvailableColors(
      availableColors
    );

  let bestIndex = -1;
  let bestDistance = Infinity;

  PALETTE.forEach(
    (color, index) => {
      if (!available[index]) {
        return;
      }

      const distance =
        colorDistance(
          rgb,
          color.rgb
        );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
  );

  return bestIndex;
}


// ============================================================
// 背景マスク作成
// ============================================================

export function createBackgroundMask(
  sourceCanvas,
  strength = 25
) {
  const maskedCanvas =
    document.createElement(
      "canvas"
    );

  maskedCanvas.width =
    sourceCanvas.width;

  maskedCanvas.height =
    sourceCanvas.height;

  const context =
    maskedCanvas.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );

  context.clearRect(
    0,
    0,
    maskedCanvas.width,
    maskedCanvas.height
  );

  context.drawImage(
    sourceCanvas,
    0,
    0
  );

  /*
    0なら背景除去OFF。
  */

  if (strength <= 0) {
    return maskedCanvas;
  }

  const width =
    maskedCanvas.width;

  const height =
    maskedCanvas.height;

  if (
    width <= 0 ||
    height <= 0
  ) {
    return maskedCanvas;
  }

  const imageData =
    context.getImageData(
      0,
      0,
      width,
      height
    );

  const data =
    imageData.data;


  // ==========================================================
  // 外周ピクセル
  // ==========================================================

  const borderPixels = [];

  for (
    let x = 0;
    x < width;
    x++
  ) {
    borderPixels.push(x);

    if (height > 1) {
      borderPixels.push(
        (height - 1) *
        width +
        x
      );
    }
  }

  for (
    let y = 1;
    y < height - 1;
    y++
  ) {
    borderPixels.push(
      y * width
    );

    if (width > 1) {
      borderPixels.push(
        y *
        width +
        width -
        1
      );
    }
  }


  // ==========================================================
  // 外周の主要色を推定
  // ==========================================================

  const bins = new Map();

  let opaqueCount = 0;

  for (
    const pixel of borderPixels
  ) {
    const index =
      pixel * 4;

    const alpha =
      data[index + 3];

    if (alpha < 230) {
      continue;
    }

    opaqueCount++;

    const red =
      data[index];

    const green =
      data[index + 1];

    const blue =
      data[index + 2];

    /*
      RGBを粗く16段階に分類。
    */

    const key =
      `${red >> 4},${green >> 4},${blue >> 4}`;

    let bin =
      bins.get(key);

    if (!bin) {
      bin = {
        count: 0,
        red: 0,
        green: 0,
        blue: 0
      };
    }

    bin.count++;

    bin.red += red;
    bin.green += green;
    bin.blue += blue;

    bins.set(
      key,
      bin
    );
  }


  /*
    外周の大部分が透明なら、
    元画像がすでに透過済みと判断。
  */

  if (
    opaqueCount <
      borderPixels.length * 0.25 ||
    bins.size === 0
  ) {
    return maskedCanvas;
  }


  const dominant =
    [...bins.values()]
      .sort(
        (a, b) =>
          b.count - a.count
      )[0];


  const background = [
    dominant.red /
      dominant.count,

    dominant.green /
      dominant.count,

    dominant.blue /
      dominant.count
  ];


  /*
    スライダー0〜100。
  */

  const safeStrength =
    clamp(
      Number(strength) || 0,
      0,
      100
    );

  const tolerance =
    8 +
    safeStrength * 1.65;


  // ==========================================================
  // 外周につながっている背景だけ透明化
  // ==========================================================

  const seen =
    new Uint8Array(
      width * height
    );

  const queue =
    new Int32Array(
      width * height
    );

  let queueStart = 0;
  let queueEnd = 0;


  function visit(pixel) {
    if (
      pixel < 0 ||
      pixel >=
        width * height ||
      seen[pixel]
    ) {
      return;
    }

    seen[pixel] = 1;

    const index =
      pixel * 4;

    const alpha =
      data[index + 3];

    const rgb = [
      data[index],
      data[index + 1],
      data[index + 2]
    ];

    /*
      背景色から大きく離れている場合は
      作品部分なので消さない。
    */

    if (
      alpha > 12 &&
      colorDistance(
        rgb,
        background
      ) > tolerance
    ) {
      return;
    }

    data[index + 3] = 0;

    queue[queueEnd++] =
      pixel;
  }


  borderPixels.forEach(
    visit
  );


  while (
    queueStart < queueEnd
  ) {
    const pixel =
      queue[
        queueStart++
      ];

    const x =
      pixel % width;


    if (x > 0) {
      visit(
        pixel - 1
      );
    }


    if (
      x < width - 1
    ) {
      visit(
        pixel + 1
      );
    }


    if (
      pixel >= width
    ) {
      visit(
        pixel - width
      );
    }


    if (
      pixel <
      width *
        (height - 1)
    ) {
      visit(
        pixel + width
      );
    }
  }


  context.putImageData(
    imageData,
    0,
    0
  );

  return maskedCanvas;
}


// ============================================================
// 画像 → ビーズ変換
// ============================================================

export function convertToBeads({
  sourceCanvas,

  cropWidth,
  cropHeight,

  imageX,
  imageY,
  imageScale,

  columns,
  rows,

  backgroundStrength = 25,
  lineStrength = 45,
  colorBoost = 20,

  availableColors
}) {
  const available =
    normalizeAvailableColors(
      availableColors
    );


  const safeColumns =
    Math.max(
      1,
      Math.round(columns)
    );

  const safeRows =
    Math.max(
      1,
      Math.round(rows)
    );


  /*
    所有色が0色なら全部空白。
  */

  if (
    !available.some(Boolean)
  ) {
    return {
      cells:
        new Int16Array(
          safeColumns *
          safeRows
        ).fill(-1),

      counts:
        new Array(
          PALETTE.length
        ).fill(0),

      totalBeads: 0,

      usedColorCount: 0,

      mergedCount: 0
    };
  }


  // ==========================================================
  // 背景除去
  // ==========================================================

  const maskedCanvas =
    createBackgroundMask(
      sourceCanvas,
      backgroundStrength
    );


  // ==========================================================
  // 1マス = 5 × 5サンプル
  // ==========================================================

  const samples = 5;

  const workWidth =
    safeColumns *
    samples;

  const workHeight =
    safeRows *
    samples;


  const workCanvas =
    document.createElement(
      "canvas"
    );

  workCanvas.width =
    workWidth;

  workCanvas.height =
    workHeight;


  const context =
    workCanvas.getContext(
      "2d",
      {
        willReadFrequently: true
      }
    );


  context.clearRect(
    0,
    0,
    workWidth,
    workHeight
  );


  /*
    重要：
    cropCanvas上の位置とサイズを、
    workCanvasの座標へ同じ倍率で変換する。

    以前発生した
    「プレビューが左下へズレる」
    問題を防ぐ。
  */

  const scaleX =
    workWidth /
    cropWidth;

  const scaleY =
    workHeight /
    cropHeight;


  context.drawImage(
    maskedCanvas,

    imageX * scaleX,
    imageY * scaleY,

    sourceCanvas.width *
      imageScale *
      scaleX,

    sourceCanvas.height *
      imageScale *
      scaleY
  );


  const imageData =
    context.getImageData(
      0,
      0,
      workWidth,
      workHeight
    );

  const data =
    imageData.data;


  const cells =
    new Int16Array(
      safeColumns *
      safeRows
    ).fill(-1);


  const line =
    clamp(
      Number(lineStrength) || 0,
      0,
      100
    ) / 100;


  const boost =
    1 +
    clamp(
      Number(colorBoost) || 0,
      0,
      100
    ) /
      100 *
      0.9;


  // ==========================================================
  // 各ビーズマスを解析
  // ==========================================================

  for (
    let row = 0;
    row < safeRows;
    row++
  ) {
    for (
      let column = 0;
      column < safeColumns;
      column++
    ) {
      let totalWeight = 0;
      let occupiedWeight = 0;
      let darkWeight = 0;

      const sum =
        [0, 0, 0];

      const darkSum =
        [0, 0, 0];


      for (
        let dy = 0;
        dy < samples;
        dy++
      ) {
        for (
          let dx = 0;
          dx < samples;
          dx++
        ) {
          const pixelIndex =
            (
              (
                row *
                  samples +
                dy
              ) *
                workWidth +
              column *
                samples +
              dx
            ) * 4;


          /*
            マス中央に近いほど強く評価。
          */

          const vote =
            Math.exp(
              -(
                (dx - 2) ** 2 +
                (dy - 2) ** 2
              ) / 3
            );


          const alpha =
            data[
              pixelIndex + 3
            ] / 255;


          const active =
            vote * alpha;


          totalWeight +=
            vote;

          occupiedWeight +=
            active;


          const rgb = [
            data[pixelIndex],
            data[
              pixelIndex + 1
            ],
            data[
              pixelIndex + 2
            ]
          ];


          for (
            let channel = 0;
            channel < 3;
            channel++
          ) {
            sum[channel] +=
              rgb[channel] *
              active;
          }


          /*
            暗い輪郭線を別集計。
          */

          const brightness =
            luminance(rgb);

          const colorRange =
            Math.max(...rgb) -
            Math.min(...rgb);


          if (
            brightness < 60 ||
            (
              brightness < 100 &&
              colorRange < 35
            )
          ) {
            darkWeight +=
              active;

            for (
              let channel = 0;
              channel < 3;
              channel++
            ) {
              darkSum[channel] +=
                rgb[channel] *
                active;
            }
          }
        }
      }


      if (
        totalWeight <= 0 ||
        occupiedWeight <= 0
      ) {
        continue;
      }


      // ======================================================
      // ビーズを置くか
      // ======================================================

      const occupancy =
        occupiedWeight /
        totalWeight;


      /*
        線を残す強さを上げると
        少ない占有率でも採用。
      */

      const occupancyThreshold =
        0.46 -
        line * 0.17;


      if (
        occupancy <
        occupancyThreshold
      ) {
        continue;
      }


      // ======================================================
      // 代表色
      // ======================================================

      let rgb =
        sum.map(
          (value) =>
            value /
            occupiedWeight
        );


      /*
        暗い輪郭線が一定割合以上なら
        輪郭線を優先。
      */

      if (
        darkWeight > 0
      ) {
        const darkRatio =
          darkWeight /
          occupiedWeight;

        const darkThreshold =
          0.16 -
          line * 0.14;

        if (
          line > 0 &&
          darkRatio >
            darkThreshold
        ) {
          rgb =
            darkSum.map(
              (value) =>
                value /
                darkWeight
            );
        }
      }


      // ======================================================
      // 色強調
      // ======================================================

      const gray =
        luminance(rgb);


      rgb =
        rgb.map(
          (value) =>
            clamp(
              gray +
                (
                  value -
                  gray
                ) *
                boost,
              0,
              255
            )
        );


      // ======================================================
      // 所有色の中から選択
      // ======================================================

      const colorIndex =
        nearestAvailableColor(
          rgb,
          available
        );


      if (
        colorIndex >= 0
      ) {
        cells[
          row *
            safeColumns +
          column
        ] =
          colorIndex;
      }
    }
  }


  // ==========================================================
  // 近似色統合
  // ==========================================================

  const mergedCount =
    mergeMinorColors(
      cells,
      available
    );


  // ==========================================================
  // 集計
  // ==========================================================

  const counts =
    countBeads(
              cells
    );


  const totalBeads =
    counts.reduce(
      (sum, count) =>
        sum + count,
      0
    );


  const usedColorCount =
    counts.filter(
      (count) =>
        count > 0
    ).length;


  return {
    cells,
    counts,
    totalBeads,
    usedColorCount,
    mergedCount
  };
}


// ============================================================
// ビーズ数集計
// ============================================================

export function countBeads(cells) {

  const counts =
    new Array(
      PALETTE.length
    ).fill(0);


  for (
    const cell of cells
  ) {

    if (
      cell >= 0 &&
      cell < PALETTE.length
    ) {

      counts[cell]++;

    }

  }


  return counts;
}


// ============================================================
// ほぼ単色画像の近似色統合
// ============================================================

export function mergeMinorColors(
  cells,
  availableColors
) {

  const available =
    normalizeAvailableColors(
      availableColors
    );


  const counts =
    countBeads(
      cells
    );


  const total =
    counts.reduce(
      (sum, count) =>
        sum + count,
      0
    );


  if (
    total === 0
  ) {

    return 0;

  }


  // ==========================================================
  // 主色を探す
  // ==========================================================

  let mainColorIndex =
    -1;


  for (
    let index = 0;
    index < PALETTE.length;
    index++
  ) {

    if (
      !available[index]
    ) {

      continue;

    }


    if (
      counts[index] === 0
    ) {

      continue;

    }


    if (
      mainColorIndex < 0 ||
      counts[index] >
        counts[
          mainColorIndex
        ]
    ) {

      mainColorIndex =
        index;

    }

  }


  if (
    mainColorIndex < 0
  ) {

    return 0;

  }


  /*
    作品の78%以上が同じ色の場合だけ
    「ほぼ単色作品」と判断。

    写真やカラフルなイラストを
    勝手に単色化しないため。
  */

  const mainRatio =
    counts[
      mainColorIndex
    ] /
    total;


  if (
    mainRatio < 0.78
  ) {

    return 0;

  }


  let mergedCount =
    0;


  // ==========================================================
  // 少数色を主色へ統合
  // ==========================================================

  for (
    let index = 0;
    index < cells.length;
    index++
  ) {

    const colorIndex =
      cells[index];


    if (
      colorIndex < 0 ||
      colorIndex ===
        mainColorIndex
    ) {

      continue;

    }


    /*
      使用不可色は本来ここには
      入らないが念のため除外。
    */

    if (
      !available[
        colorIndex
      ]
    ) {

      continue;

    }


    /*
      黒・白は輪郭やハイライトとして
      意図的に残している可能性が高い。

      そのため自動統合しない。
    */

    if (
      colorIndex === 0 ||
      colorIndex === 1
    ) {

      continue;

    }


    /*
      作品全体の10%以上を占める色は
      意図的な別色の可能性があるので残す。
    */

    const colorRatio =
      counts[
        colorIndex
      ] /
      total;


    if (
      colorRatio >= 0.10
    ) {

      continue;

    }


    /*
      主色とのRGB距離が近い場合のみ統合。

      例：
      赤 → ピンク
      赤 → オレンジ

      のようなアンチエイリアス由来の
      色ノイズを減らす。
    */

    const distance =
      colorDistance(
        PALETTE[
          colorIndex
        ].rgb,

        PALETTE[
          mainColorIndex
        ].rgb
      );


    if (
      distance <= 85
    ) {

      cells[index] =
        mainColorIndex;


      mergedCount++;

    }

  }


  return mergedCount;
}


// ============================================================
// 使用可能色数
// ============================================================

export function countAvailableColors(
  availableColors
) {

  const available =
    normalizeAvailableColors(
      availableColors
    );


  return available.filter(
    Boolean
  ).length;
}


// ============================================================
// 使用色数
// ============================================================

export function countUsedColors(
  cells
) {

  return countBeads(
    cells
  ).filter(
    (count) =>
      count > 0
  ).length;
}


// ============================================================
// ビーズ総数
// ============================================================

export function countTotalBeads(
  cells
) {

  return countBeads(
    cells
  ).reduce(
    (sum, count) =>
      sum + count,
    0
  );
}


// ============================================================
// 1マス取得
// ============================================================

export function getCell(
  cells,
  columns,
  row,
  column
) {

  if (
    row < 0 ||
    column < 0 ||
    column >= columns
  ) {

    return -1;

  }


  const index =
    row *
    columns +
    column;


  if (
    index < 0 ||
    index >= cells.length
  ) {

    return -1;

  }


  return cells[index];
}


// ============================================================
// パターン情報を作成
// ============================================================

export function createPatternSummary({
  cells,
  columns,
  rows,
  beadSize
}) {

  const counts =
    countBeads(
      cells
    );


  const totalBeads =
    counts.reduce(
      (sum, count) =>
        sum + count,
      0
    );


  const usedColorCount =
    counts.filter(
      (count) =>
        count > 0
    ).length;


  return {

    columns,

    rows,

    beadSize,

    widthMm:
      columns *
      beadSize,

    heightMm:
      rows *
      beadSize,

    totalCells:
      columns *
      rows,

    totalBeads,

    emptyCells:
      columns *
      rows -
      totalBeads,

    usedColorCount,

    counts

  };
}