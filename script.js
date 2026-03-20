// 🌟 這裡填寫你未來後端伺服器的 API 網址
const BACKEND_API_URL = 'http://localhost:5000/api/evaluate';

let currentN = 0;
let maxObstacles = 0;

// 紀錄目前網格的狀態 (座標格式: [row, col])
let startCell = null;
let endCell = null;
let obstacles = [];


// ==============================================================
// 前端互動

function generateGrid() {
    const nInput = document.getElementById('gridSize').value;
    currentN = parseInt(nInput);

    if (isNaN(currentN) || currentN < 5 || currentN > 9) {
        alert("請輸入 5 到 9 之間的數字！");
        return;
    }

    // 初始化與重置設定
    maxObstacles = currentN - 2;
    startCell = null;
    endCell = null;
    obstacles = [];

    // 更新 UI 顯示
    document.getElementById('modeSelector').style.display = 'flex';
    document.getElementById('actionPanel').style.display = 'block';
    document.getElementById('obsMax').innerText = maxObstacles;
    document.getElementById('jsonPreview').style.display = 'none';
    setStatusMessage('', '');
    updateObstacleCount();

    // 繪製網格
    const container = document.getElementById('gridContainer');
    container.innerHTML = '';
    const table = document.createElement('table');

    let counter = 1;
    for (let r = 0; r < currentN; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < currentN; c++) {
            const td = document.createElement('td');
            td.innerText = counter++;
            td.dataset.r = r;
            td.dataset.c = c;
            td.onclick = function () {
                handleCellClick(this, r, c);
            };
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    container.appendChild(table);
}

function handleCellClick(cell, r, c) {
    const mode = document.querySelector('input[name="cellMode"]:checked').value;

    // 新增：紀錄點擊前，該格子是否已經是障礙物
    const isAlreadyObstacle = cell.classList.contains('obstacle');

    // 清除點擊格子的舊狀態 (避免同一格同時是起點又是障礙物)
    clearCellState(cell, r, c);

    if (mode === 'start') {
        if (startCell) {
            const oldCell = document.querySelector(`td[data-r="${startCell[0]}"][data-c="${startCell[1]}"]`);
            if (oldCell) oldCell.classList.remove('start');
        }
        cell.classList.add('start');
        startCell = [r, c];

    } else if (mode === 'end') {
        if (endCell) {
            const oldCell = document.querySelector(`td[data-r="${endCell[0]}"][data-c="${endCell[1]}"]`);
            if (oldCell) oldCell.classList.remove('end');
        }
        cell.classList.add('end');
        endCell = [r, c];

    } else if (mode === 'obstacle') {
        // 如果它原本「不是」障礙物，才把它加為障礙物
        if (!isAlreadyObstacle) {
            if (obstacles.length >= maxObstacles) {
                alert(`最多只能設置 ${maxObstacles} 個障礙物！`);
                return;
            }
            cell.classList.add('obstacle');
            obstacles.push([r, c]);
            updateObstacleCount();
        }
    }
}

function clearCellState(cell, r, c) {
    cell.classList.remove('start', 'end', 'obstacle');

    if (startCell && startCell[0] === r && startCell[1] === c) startCell = null;
    if (endCell && endCell[0] === r && endCell[1] === c) endCell = null;

    const obsIndex = obstacles.findIndex(obs => obs[0] === r && obs[1] === c);
    if (obsIndex !== -1) {
        obstacles.splice(obsIndex, 1);
        updateObstacleCount();
    }
}

function updateObstacleCount() {
    document.getElementById('obsCount').innerText = obstacles.length;
}

function setStatusMessage(msg, typeClass) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.innerText = msg;
    statusDiv.className = 'status-message ' + typeClass;
}

// ==============================================================
// 後端串接

async function submitConfiguration() {
    // 確保有起點 & 終點
    if (!startCell) {
        setStatusMessage("⚠️ 請設定「起點 (Start)」", "msg-error");
        return;
    }
    if (!endCell) {
        setStatusMessage("⚠️ 請設定「終點 (End)」", "msg-error");
        return;
    }

    // 打包成 JSON 物件格式
    const payload = {
        n: currentN,
        start: startCell,
        end: endCell,
        obstacles: obstacles
    };

    // 在前端畫面上顯示準備送出的 JSON
    const jsonPreview = document.getElementById('jsonPreview');
    console.log("即將 POST 到後端的 JSON 資料:", JSON.stringify(payload, null, 2));
    // jsonPreview.innerText = "// 即將 POST 到後端的 JSON 資料：\n" + JSON.stringify(payload, null, 2);
    // jsonPreview.style.display = 'block';

    setStatusMessage("⏳ 正在傳送資料至後端 API...", "msg-warning");

    try {

        const response = await fetch(BACKEND_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP 錯誤狀態: ${response.status}`);
        }

        const resultData = await response.json();
        console.log("從後端接收到的回傳資料:", resultData);

        setStatusMessage("✅ 資料傳送成功！(請查看 Console 獲取回傳值)", "msg-success");

        renderResultMatrices(resultData.values, resultData.policy, resultData.path);

    } catch (error) {
        console.error("Fetch 錯誤:", error);
        setStatusMessage(`❌ 發生錯誤  檢查console`, "msg-error");
    }
}

// ==============================================================

// 生成自定義 SVG 多向箭頭
function createArrowSVG(directions, styleMode) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "arrow-svg");
    svg.setAttribute("viewBox", "0 0 100 100");

    // 根據 styleMode 設定顏色與粗細
    let arrowColor = "#334155"; // 預設深灰
    let arrowWidth = "4";

    if (styleMode === 'path') {
        arrowColor = "#000000"; // 在路徑上：黑色粗箭頭
        arrowWidth = "3";
    } else if (styleMode === 'non-path') {
        arrowColor = "#94a3b8"; // 不在路徑上：淺灰細箭頭
        arrowWidth = "4";
    } else if (styleMode === 'start') {
        arrowColor = "#10b981"; // 綠色 (Policy Matrix 用的)
    }

    const defs = document.createElementNS(svgNS, "defs");
    const markerId = `arrowhead-${Math.random().toString(36).substr(2, 9)}`;
    const marker = document.createElementNS(svgNS, "marker");
    marker.setAttribute("id", markerId);
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "7");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "4");
    marker.setAttribute("markerHeight", "4");
    marker.setAttribute("orient", "auto-start-reverse");

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M 0 1 L 10 5 L 0 9 z");
    path.setAttribute("fill", arrowColor);
    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);

    directions.forEach(dir => {
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", "50");
        line.setAttribute("y1", "50");
        line.setAttribute("stroke", arrowColor);
        line.setAttribute("stroke-width", arrowWidth);
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("marker-end", `url(#${markerId})`);

        if (dir === 'U') {
            line.setAttribute("x2", "50");
            line.setAttribute("y2", "20");
        }
        if (dir === 'D') {
            line.setAttribute("x2", "50");
            line.setAttribute("y2", "80");
        }
        if (dir === 'L') {
            line.setAttribute("x2", "20");
            line.setAttribute("y2", "50");
        }
        if (dir === 'R') {
            line.setAttribute("x2", "80");
            line.setAttribute("y2", "50");
        }
        svg.appendChild(line);
    });

    if (directions.length > 1) {
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", "50");
        circle.setAttribute("cy", "50");
        circle.setAttribute("r", arrowWidth);
        circle.setAttribute("fill", arrowColor);
        svg.appendChild(circle);
    }
    return svg;
}

// 成果渲染
function renderResultMatrices(values, policy, optimalPath) {
    document.getElementById('resultsContainer').style.display = 'flex';

    // 1. 繪製 Value Matrix
    renderValueMatrix(values, policy);

    // 2. 繪製 Policy Matrix
    renderPolicyMatrix(policy);

    // 3. 繪製 Optimal Path Matrix
    renderPathMatrix(policy, optimalPath);

    document.getElementById('resultsContainer').scrollIntoView({behavior: 'smooth'});
}

// 繪製 Value Matrix
function renderValueMatrix(values, policy) {
    const valueGrid = document.getElementById('valueGrid');
    valueGrid.innerHTML = '';
    const table = document.createElement('table');

    for (let r = 0; r < currentN; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < currentN; c++) {
            const td = document.createElement('td');
            const cellPolicy = policy[r][c];
            const isStart = (startCell && startCell[0] === r && startCell[1] === c);
            const isEnd = (endCell && endCell[0] === r && endCell[1] === c);

            if (cellPolicy[0] === 'O') {
                td.classList.add('obstacle');
            } else if (isEnd) {
                td.classList.add('end');
                td.innerText = '0.00';
            } else {
                td.innerText = values[r][c].toFixed(2);
                if (isStart) td.classList.add('start-text');
            }
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    valueGrid.appendChild(table);
}

// ==========================================
// 繪製 Policy Matrix

function renderPolicyMatrix(policy) {
    const policyGrid = document.getElementById('policyGrid');
    policyGrid.innerHTML = '';
    const table = document.createElement('table');

    for (let r = 0; r < currentN; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < currentN; c++) {
            const td = document.createElement('td');
            const cellPolicy = policy[r][c];
            const isStart = (startCell && startCell[0] === r && startCell[1] === c);
            const isEnd = (endCell && endCell[0] === r && endCell[1] === c);

            if (cellPolicy[0] === 'O') {
                td.classList.add('obstacle');
            } else if (isEnd) {
                td.classList.add('end');
                td.innerText = 'G';
            } else {
                td.appendChild(createArrowSVG(cellPolicy, isStart ? 'start' : 'normal'));
            }
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    policyGrid.appendChild(table);
}

// ==========================================
// 繪製 Optimal Path Matrix
function renderPathMatrix(policy, optimalPath) {
    const pathGrid = document.getElementById('pathGrid');
    pathGrid.innerHTML = '';
    const table = document.createElement('table');

    // 檢查座標是否在路徑陣列中
    const isInPath = (r, c) => optimalPath.some(p => p[0] === r && p[1] === c);

    for (let r = 0; r < currentN; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < currentN; c++) {
            const td = document.createElement('td');
            const cellPolicy = policy[r][c];
            const isStart = (startCell && startCell[0] === r && startCell[1] === c);
            const isEnd = (endCell && endCell[0] === r && endCell[1] === c);
            const isPathCell = isInPath(r, c);

            if (cellPolicy[0] === 'O') {
                td.classList.add('obstacle');
            } else if (isEnd) {
                td.classList.add('path-cell');
                td.innerHTML = `<span class="path-text">END</span>`;
            } else if (isStart) {
                td.classList.add('path-cell');
                td.innerHTML = `<span class="path-text">START</span>`;
                td.appendChild(createArrowSVG(cellPolicy, 'path'));
            } else {
                if (isPathCell) {
                    td.classList.add('path-cell');
                    td.appendChild(createArrowSVG([cellPolicy[0]], 'path'));
                } else {
                    td.appendChild(createArrowSVG(cellPolicy, 'non-path'));
                }
            }
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    pathGrid.appendChild(table);
}

// function renderResultMatrices(values, policy) {
//     // 顯示結果區塊 (設為 flex 以並排顯示)
//     document.getElementById('resultsContainer').style.display = 'flex';
//
//     const valueGrid = document.getElementById('valueGrid');
//     const policyGrid = document.getElementById('policyGrid');
//     valueGrid.innerHTML = '';
//     policyGrid.innerHTML = '';
//
//     // 1. 產生 Value Matrix 表格
//     const vTable = document.createElement('table');
//     for (let r = 0; r < currentN; r++) {
//         const tr = document.createElement('tr');
//         for (let c = 0; c < currentN; c++) {
//             const td = document.createElement('td');
//             // 根據 Policy 的特殊標記來決定格子樣式
//             if (policy[r][c] === 'O') {
//                 td.classList.add('obstacle');
//             } else if (policy[r][c] === 'G') {
//                 td.classList.add('end');
//                 td.innerText = '0.00'; // 終點的 Value 預設為 0
//             } else {
//                 // 顯示到小數點第二位
//                 td.innerText = values[r][c].toFixed(2);
//                 // 特別標出起點的數字顏色，方便觀察
//                 if (startCell && startCell[0] === r && startCell[1] === c) {
//                     td.classList.add('start-text');
//                 }
//             }
//             tr.appendChild(td);
//         }
//         vTable.appendChild(tr);
//     }
//     valueGrid.appendChild(vTable);
//
//     // 2. 產生 Policy Matrix 表格
//     const pTable = document.createElement('table');
//     for (let r = 0; r < currentN; r++) {
//         const tr = document.createElement('tr');
//         for (let c = 0; c < currentN; c++) {
//             const td = document.createElement('td');
//             // 注意這裡改成 policy[r][c][0] 判斷，因為它變成陣列了
//             if (policy[r][c][0] === 'O') {
//                 td.classList.add('obstacle');
//             } else if (policy[r][c][0] === 'G') {
//                 td.classList.add('end');
//                 td.innerText = 'G';
//             } else {
//                 // 把陣列裡的每個方向都轉成箭頭，然後合併成字串 (例如 "↑→")
//                 td.innerText = policy[r][c].map(a => ARROW_MAP[a]).join('');
//
//                 if (startCell && startCell[0] === r && startCell[1] === c) {
//                     td.classList.add('start-text');
//                 }
//             }
//             tr.appendChild(td);
//         }
//         pTable.appendChild(tr);
//     }
//     policyGrid.appendChild(pTable);
//
//     // 畫面平滑滾動到結果區塊
//     document.getElementById('resultsContainer').scrollIntoView({behavior: 'smooth'});
// }

