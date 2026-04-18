# 座標系仕様書（2026-04-19）

## 3つの座標系

### 1. A4座標系（評価点定義用）
- **サイズ**：1080 × 1527 px
- **原点**：左上（0, 0）
- **軸方向**：x軸右、y軸下
- **単位**：px
- **役割**：
  - ビデオ座標系内のA4領域に対応する正規化座標系（固定）
  - 固定評価点（青・緑・紫）の座標定義
  - A4アスペクト比 1.414 を保証
  - ビデオ解像度の変化に影響されない評価基準を提供
- **補足**：ビデオ座標系の解像度が動的に変わっても、この座標系は変わらない

### 2. ビデオ座標系（計算・マーカー検出用）
- **サイズ**：動的（1080×1920 または 2160×3840）
- **原点**：左上（0, 0）
- **軸方向**：x軸右、y軸下
- **単位**：px
- **役割**：
  - スマートフォンカメラが撮影する映像の座標系
  - マーカー検出を実施
  - グレースケール処理・積分画像などのコントラスト計算を実施
- **サイズの取得**：実行時に `video.videoWidth` と `video.videoHeight` から取得
- **A4領域の配置**：ビデオ座標の中央（両解像度で同じ相対位置）

### 3. 画面座標系（ユーザー表示用）
- **サイズ**：動的（スマートフォン画面）
- **原点**：左上（0, 0）
- **軸方向**：x軸右、y軸下
- **単位**：px
- **役割**：
  - スマートフォン画面上でユーザーに表示
  - A4領域と評価点を視覚的にフィードバック
- **補足**：ビデオ表示がレターボックスになる場合、オフセット計算で対応

---

## 座標変換

### A4座標 → ビデオ座標

A4座標系は、ビデオ座標系の中央に配置される。

```javascript
const a4W = 1080;
const a4H = 1527;

function a4ToVideo(a4X, a4Y, videoW, videoH) {
  return {
    x: a4X + (videoW - a4W) / 2,
    y: a4Y + (videoH - a4H) / 2
  };
}
```

**説明**：
- A4座標系の左上（0, 0）は、ビデオ座標の中央上端から水平中央の位置に来る
- ビデオ解像度が 1920×1080 でも 3840×2160 でも、相対位置は同じ

### ビデオ座標 → 画面座標

ビデオをスマートフォン画面に表示する際の変換。

**重要：** アスペクト比を保持するために、x方向とy方向で同じスケール係数を使う。

```javascript
// processFrame() 内で一度だけ計算
const baseScale = Math.min(window.innerWidth / videoW, window.innerHeight / videoH);
const displayScale = baseScale * VIDEO_SCALE;

function videoToScreen(videoX, videoY, displayScale) {
  const rect = video.getBoundingClientRect();
  
  return {
    x: rect.left + videoX * displayScale,
    y: rect.top + videoY * displayScale + VIDEO_OFFSET_Y
  };
}
```

**説明**：
- `displayScale = baseScale × VIDEO_SCALE` として計算
- 単一の scale 係数を使用してアスペクト比を保持
- `VIDEO_SCALE` で画面表示の拡大倍率を調整（見た目のみ）
- `VIDEO_OFFSET_Y` で垂直方向のオフセットを追加（見た目のみ）
- rect.left/top は video要素の画面上での左上位置

---

## 毎フレームの処理フロー

### 1. データ取得・計算フェーズ（ビデオ座標系）

```
ビデオフレーム（カメラからの映像データ）をデータ取得用キャンバスに描画
    ↓
データ取得用キャンバスからピクセルデータを取得（ビデオ座標系の解像度）
    ↓
グレースケール変換＋積分画像構築
    ↓
各評価点（A4座標で定義）に対応するビデオ座標の位置で、
コントラスト値を計算（CS, OS, sP, cA, sA, C）
```

**データ取得用キャンバス：**
- **解像度**：ビデオ解像度（実行時に `video.videoWidth/Height` から取得）
- **用途**：グレースケール・積分画像計算用のピクセルデータ取得
- **表示**：画面に表示しない（内部計算用）

### 2. 表示フェーズ（画面座標系）

```
各評価点（A4座標）
    ↓
A4→ビデオ座標に変換
    ↓
ビデオ座標→画面座標に変換
    ↓
画面座標の位置に描画
（色付き枠＋計算済みのコントラスト値をテキスト表示）
    ↓
画面に表示
```

**表示用キャンバス：**
- **解像度**：スマートフォン画面サイズ（`window.innerWidth/Height`）
- **用途**：評価点の位置（枠）とコントラスト計算結果（テキスト）を描画
- **表示**：ビデオフレーム（カメラからの映像データ）上に重ねて、画面に表示

---

## パラメータ

### MARKER_SIZE_RATIO

- **説明**：A4座標系の幅に対するウィンドウサイズの比率
- **値**：デバッグ画面で調整可能（デフォルト：0.038）
- **ウィンドウサイズの計算**：
  ```javascript
  const windowSize = Math.round(a4W * MARKER_SIZE_RATIO);
  // a4W = 1080, MARKER_SIZE_RATIO = 0.038 の場合
  // windowSize = 29px
  ```

### MARGIN_RATIO

- **説明**：コントラスト計算時、ウィンドウ周辺の余白比率
- **値**：デバッグ画面で調整可能（デフォルト：0.5）
- **用途**：周辺ピクセルの範囲を定義（OS, sA の計算に使用）

### VIDEO_SCALE

- **説明**：画面表示のスケール倍率（見た目のみ）
- **値**：デバッグ画面で調整可能（デフォルト：1.0）
- **用途**：ビデオ座標から画面座標への変換時に拡大倍率を調整
- **計算**：`displayScale = baseScale × VIDEO_SCALE`
- **影響範囲**：画面表示のみ。評価点の計算位置は変わらない

### VIDEO_OFFSET_Y

- **説明**：画面表示の垂直オフセット（見た目のみ）
- **値**：デバッグ画面で調整可能（デフォルト：0）
- **単位**：ピクセル（正の値で下へ、負の値で上へ移動）
- **用途**：画面座標の y 値に追加オフセットを加える
- **影響範囲**：画面表示のみ。評価点の計算位置は変わらない

---

## A4枠の表示

A4座標系（1080×1527）の領域を、画面座標系に変換して白い枠で画面に表示する。

### 定義

A4座標系の四隅：
- **左上**：A4座標 (0, 0)
- **右上**：A4座標 (1080, 0)
- **右下**：A4座標 (1080, 1527)
- **左下**：A4座標 (0, 1527)

### 表示方法

1. 各四隅を A4→ビデオ座標に変換
2. さらにビデオ→画面座標に変換
3. 画面座標の四隅を線で結んで、白い矩形枠を描画

```javascript
// 四隅の座標変換例
const corners = [
  {a4X: 0, a4Y: 0},      // 左上
  {a4X: 1080, a4Y: 0},   // 右上
  {a4X: 1080, a4Y: 1527}, // 右下
  {a4X: 0, a4Y: 1527}    // 左下
];

const screenCorners = [];
for (const corner of corners) {
  const videoPoint = a4ToVideo(corner.a4X, corner.a4Y, videoW, videoH);
  const screenPoint = videoToScreen(videoPoint.x, videoPoint.y, video);
  screenCorners.push(screenPoint);
}

// screenCorners の4つの点を線で結んで白い枠を描画
```

---

## 固定評価点（青・緑・紫）

### 定義

A4座標系（1527×1080）内に、3つの固定点を定義する。

| 点 | A4座標（x, y） | ウィンドウサイズ | 役割 |
|---|---|---|---|
| 青 | (540, 763.5) | a4W × MARKER_SIZE_RATIO | A4座標系中央 |
| 緑 | (1033, 1480) | a4W × MARKER_SIZE_RATIO | A4右下から上5mm左5mm |
| 紫 | (1033, 763.5) | a4W × MARKER_SIZE_RATIO | 緑のx、青のy |

### コントラスト計算

各固定点で毎フレーム以下の値を計算：

#### 1. グレースケール変換と積分画像
- ビデオフレームから RGB ピクセルデータを取得
- RGB → グレースケール変換：`gray[i] = 0.299 * R + 0.587 * G + 0.114 * B`
- 積分画像を構築（矩形領域の合計値を高速に計算するため）

#### 2. 中央ウィンドウの計算
- **windowSize** = `Math.round(a4W * MARKER_SIZE_RATIO)`
- **中央矩形** = (vX, vY) から (vX + windowSize, vY + windowSize)
- **CS**（中央の積分値）= 中央矩形内のグレースケール値の合計
- **cA**（中央の平均輝度）= `CS / (windowSize * windowSize)`

#### 3. 周辺ウィンドウの計算
- **margin** = `Math.round(windowSize * MARGIN_RATIO)`
- **外側矩形** = (vX - margin, vY - margin) から (vX + windowSize + margin, vY + windowSize + margin)
- **OS**（外側矩形の積分値）= 外側矩形内のグレースケール値の合計
- **sP**（周辺ピクセル数）= (外側矩形面積) - (中央ウィンドウ面積)
- **sA**（周辺の平均輝度）= `(OS - CS) / sP`

#### 4. コントラスト値
- **C**（コントラスト）= `sA - cA`

#### 計算結果の出力
表示時に以下の値をテキストで表示：
- CS, OS, sP, cA, sA, C

### 画面表示

processFrame() 内で、毎フレーム以下の処理を実行：

```javascript
// processFrame() の最初で displayScale を計算（1回だけ）
const baseScale = Math.min(window.innerWidth / videoW, window.innerHeight / videoH);
const displayScale = baseScale * MARKER_DETECT_PARAMS.VIDEO_SCALE;

// 各固定点について、座標変換と描画を実行：
for (const [key, point] of Object.entries(EVALUATION_POINTS)) {
  // 1. A4座標をビデオ座標に変換
  const videoPt = a4ToVideo(point.a4X, point.a4Y, videoW, videoH);

  // 2. ビデオ座標でコントラスト計算
  const contrast = calculateContrast(imgData, videoPt.x, videoPt.y, windowSize, videoW, videoH);
  // → CS, OS, sP, cA, sA, C が得られる

  // 3. ビデオ座標を画面座標に変換
  const screenPt = videoToScreen(videoPt.x, videoPt.y, displayScale);

  // 4. 画面座標での描画サイズを計算
  const screenWindowSize = windowSize * displayScale;

  // 5. 表示用キャンバスに描画
  //    - screenPt を左上として、screenWindowSize サイズの色付き枠を描画
  //    - screenPt の上部にテキストで計算結果を表示
}
```

**描画内容：**
- 色付き枠（色：青/緑/紫、サイズ：screenWindowSize × screenWindowSize）
- 6行のテキスト：
  1. 点の名前（青/緑/紫）
  2. CS=xxx
  3. OS=xxx | sP=xxx
  4. cA=xxx
  5. sA=xxx
  6. C=x.x

**重要：**
- `displayScale` は processFrame() の最初で1回だけ計算
- 全ての座標変換と描画サイズ計算で同じ `displayScale` を使用
- `VIDEO_SCALE` と `VIDEO_OFFSET_Y` は見た目の表示のみに影響
- 評価点の計算位置（ビデオ座標）は変わらない

---

## 重要なポイント

1. **A4座標系は固定**：1080×1527 は変わらない。評価点の定義用のみ
2. **ビデオ解像度は動的**：実行時に取得される。マーカー検出とコントラスト計算はここで実行
3. **A4は常にビデオ中央**：相対位置で配置されるため、ビデオ解像度が変わっても評価点の相対位置は変わらない
4. **座標変換パスは一方向**：A4（定義）→ ビデオ（計算）→ 画面（表示）
5. **計算と表示を分離**：データ取得用キャンバスはコントラスト計算、表示用キャンバスは結果描画
6. **VIDEO_SCALE と VIDEO_OFFSET_Y は見た目のみ**：画面表示をズーム・パンするが、実際の評価点の計算位置は変わらない
