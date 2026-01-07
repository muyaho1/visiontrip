const pages = [
  { src: 'sheets/sheet1.jpg', detectionColor: 'red' },
  { src: 'sheets/sheet2.jpg', detectionColor: 'red' },
  { src: 'sheets/sheet3.jpg', detectionColor: 'blue' },
  { src: 'sheets/sheet4.png', detectionColor: 'black' },
  { src: 'sheets/sheet5.jpg', detectionColor: 'red' },
  { src: 'sheets/sheet6.jpg', detectionColor: 'red' }
];

const COLUMNS = 1;
const ROWS = 30;

let currentPage = 0;
let isDragging = false;
let dragDirection = 0;
let maskState = [];
let detectionCanvas = null;
let detectionCtx = null;

const sheetImage = document.getElementById('sheetImage');
const sheetWrapper = document.querySelector('.sheet-wrapper');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const resetBtn = document.getElementById('resetBtn');
const pageInfo = document.getElementById('pageInfo');

function init() {
  detectionCanvas = document.createElement('canvas');
  detectionCtx = detectionCanvas.getContext('2d', { willReadFrequently: true });
  
  loadPage(0);
  setupEventListeners();
}

function loadPage(pageIndex) {
  currentPage = pageIndex;
  const page = pages[pageIndex];
  
  sheetImage.src = page.src;
  sheetImage.onload = () => {
    console.log('이미지 로드 완료:', page.src);
    detectColoredText();
  };
  
  updatePageInfo();
  updateNavButtons();
}

function detectColoredText() {
  const page = pages[currentPage];
  const colorName = page.detectionColor === 'blue' ? '파란색' : page.detectionColor === 'black' ? '검정색' : '빨간색';
  console.log(`${colorName} 텍스트 감지 시작...`);
  
  const imgWidth = sheetImage.naturalWidth;
  const imgHeight = sheetImage.naturalHeight;
  
  console.log('이미지 크기:', imgWidth, 'x', imgHeight);
  
  detectionCanvas.width = imgWidth;
  detectionCanvas.height = imgHeight;
  detectionCtx.drawImage(sheetImage, 0, 0);
  
  const imageData = detectionCtx.getImageData(0, 0, imgWidth, imgHeight);
  const pixels = imageData.data;
  
  maskState = Array(ROWS).fill(null).map(() => Array(COLUMNS).fill(false));
  
  const cellWidth = imgWidth / COLUMNS;
  const cellHeight = imgHeight / ROWS;
  
  let totalColoredCells = 0;
  
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      let coloredPixelCount = 0;
      let totalPixels = 0;
      
      const startY = Math.floor(row * cellHeight);
      const endY = Math.floor((row + 1) * cellHeight);
      const startX = Math.floor(col * cellWidth);
      const endX = Math.floor((col + 1) * cellWidth);
      
      // 검정색인 경우 밀도 기반 텍스트 덩어리 감지
      if (page.detectionColor === 'black') {
        // 검정색 픽셀 좌표 수집
        const blackPixels = [];
        for (let y = startY; y < endY; y += 2) {
          for (let x = startX; x < endX; x += 2) {
            const idx = (y * imgWidth + x) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            
            if (r < 80 && g < 80 && b < 80) {
              blackPixels.push({ x, y });
            }
            totalPixels++;
          }
        }
        
        // 밀도 분석: 검정색 픽셀이 밀집된 영역인지 확인
        if (blackPixels.length > 0) {
          const ratio = blackPixels.length / totalPixels;
          
          // 밀도 계산: 인접한 검정색 픽셀이 많은지 확인
          let densityScore = 0;
          const neighborRadius = 4; // 4픽셀 반경 내 검사
          
          for (let i = 0; i < Math.min(blackPixels.length, 50); i += 2) {
            const pixel = blackPixels[i];
            let neighbors = 0;
            
            for (let j = 0; j < blackPixels.length; j++) {
              const other = blackPixels[j];
              const dist = Math.abs(pixel.x - other.x) + Math.abs(pixel.y - other.y);
              if (dist > 0 && dist <= neighborRadius) {
                neighbors++;
              }
            }
            
            densityScore += neighbors;
          }
          
          // 텍스트 덩어리: 충분한 검정색 픽셀 + 높은 밀도
          // ratio > 0.01 (1% 이상) && 밀도가 높음
          if (ratio > 0.01 && densityScore > 100) {
            coloredPixelCount = blackPixels.length;
          }
        }
      } else {
        // 빨간색/파란색: 기존 방식
        for (let y = startY; y < endY; y += 2) {
          for (let x = startX; x < endX; x += 2) {
            const idx = (y * imgWidth + x) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            
            let isTargetColor = false;
            if (page.detectionColor === 'blue') {
              // 파란색 감지: b가 높고 r, g는 낮음
              isTargetColor = b > 150 && r < 100 && g < 100 && b > r + 50 && b > g + 50;
            } else {
              // 빨간색 감지: r이 높고 g, b는 낮음
              isTargetColor = r > 150 && g < 100 && b < 100 && r > g + 50 && r > b + 50;
            }
            
            if (isTargetColor) {
              coloredPixelCount++;
            }
            totalPixels++;
          }
        }
      }
      
      const coloredRatio = coloredPixelCount / totalPixels;
      if (coloredRatio > 0.005) {
        maskState[row][col] = true;
        totalColoredCells++;
      }
    }
  }
  
  console.log(`${colorName} 감지 완료 - 감지된 셀 수:`, totalColoredCells);
  renderMask();
}

function renderMask() {
  document.querySelectorAll('.mask-cell').forEach(el => el.remove());
  
  const imgWidth = sheetImage.offsetWidth;
  const imgHeight = sheetImage.offsetHeight;
  
  const cellWidth = imgWidth / COLUMNS;
  const cellHeight = imgHeight / ROWS;
  
  let renderedCount = 0;
  
  // 4번째 곡(sheet4)인 경우 마스킹 위치를 2줄 아래로 이동
  const isSheet4 = currentPage === 3;
  const rowOffset = isSheet4 ? 2 : 0;
  
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      if (maskState[row][col]) {
        // 4번째 곡의 경우 실제 렌더링 위치를 2줄 아래로
        const renderRow = row + rowOffset;
        
        // 범위를 벗어나면 렌더링하지 않음
        if (renderRow >= ROWS) continue;
        
        const maskDiv = document.createElement('div');
        maskDiv.className = 'mask-cell';
        maskDiv.style.position = 'absolute';
        maskDiv.style.left = (col * cellWidth) + 'px';
        maskDiv.style.top = (renderRow * cellHeight) + 'px';
      maskDiv.style.width = cellWidth + 'px';
      maskDiv.style.height = cellHeight + 'px';
      maskDiv.style.backgroundColor = 'rgba(0, 0, 0, 1)';
      maskDiv.style.borderRadius = '4px';
      maskDiv.style.pointerEvents = 'none';
        maskDiv.dataset.row = renderRow;
        maskDiv.dataset.col = col;
        
        sheetWrapper.appendChild(maskDiv);
        renderedCount++;
      }
    }
  }
  
  console.log('마스크 렌더링 완료 - 렌더링된 셀 수:', renderedCount);
}

function setupEventListeners() {
  prevBtn.addEventListener('click', () => {
    if (currentPage > 0) {
      loadPage(currentPage - 1);
    }
  });
  
  nextBtn.addEventListener('click', () => {
    if (currentPage < pages.length - 1) {
      loadPage(currentPage + 1);
    }
  });
  
  resetBtn.addEventListener('click', () => {
    detectColoredText();
  });
  
  sheetWrapper.addEventListener('pointerdown', handlePointerDown);
  sheetWrapper.addEventListener('pointermove', handlePointerMove);
  sheetWrapper.addEventListener('pointerup', handlePointerUp);
  sheetWrapper.addEventListener('pointerleave', handlePointerUp);
  sheetWrapper.addEventListener('pointercancel', handlePointerUp);
  
  sheetWrapper.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  sheetWrapper.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  
  window.addEventListener('resize', () => {
    if (sheetImage.complete && maskState.length > 0) {
      renderMask();
    }
  });
}

function handlePointerDown(e) {
  isDragging = true;
  dragDirection = 0;
}

function handlePointerMove(e) {
  if (!isDragging) return;
  
  if (dragDirection === 0) {
    const movementX = e.movementX || 0;
    if (Math.abs(movementX) > 1) {
      dragDirection = movementX > 0 ? 1 : -1;
    }
  }
  
  if (dragDirection !== 0) {
    updateCurtainEffect(e);
  }
}

function handlePointerUp() {
  // 드래그 종료 시 clipPath만 제거 (임시 효과 제거)
  if (isDragging) {
    document.querySelectorAll('.mask-cell').forEach(el => {
      const clipPath = el.style.clipPath;
      if (clipPath && clipPath.includes('inset')) {
        // clipPath만 제거하고 마스크는 현재 상태 유지
        el.style.clipPath = '';
      }
    });
  }
  
  isDragging = false;
  dragDirection = 0;
}

function updateCurtainEffect(e) {
  const imgRect = sheetImage.getBoundingClientRect();
  const x = e.clientX - imgRect.left;
  const y = e.clientY - imgRect.top;
  const imgWidth = sheetImage.offsetWidth;
  const imgHeight = sheetImage.offsetHeight;
  
  const col = Math.floor((x / imgWidth) * COLUMNS);
  const row = Math.floor((y / imgHeight) * ROWS);
  
  if (row >= 0 && row < ROWS && col >= 0 && col < COLUMNS) {
    const cellWidth = imgWidth / COLUMNS;
    const cellLeft = col * cellWidth;
    const xInCell = x - cellLeft;
    const percentage = Math.max(0, Math.min(100, (xInCell / cellWidth) * 100));
    
    if (dragDirection > 0) {
      // 오른쪽 드래그: 왼쪽부터 벗기기 (왼쪽을 clipPath로 가림)
      const maskDiv = document.querySelector(`.mask-cell[data-row="${row}"][data-col="${col}"]`);
      if (maskDiv) {
        // percentage가 100에 가까워질수록 더 많이 벗겨짐
        // inset(0 0 0 X%) = 왼쪽에서 X%만큼 잘라냄
        maskDiv.style.clipPath = `inset(0 0 0 ${percentage}%)`;
      }
    } else {
      // 왼쪽 드래그: 오른쪽부터 가리기 (오른쪽을 clipPath로 가림)
      let maskDiv = document.querySelector(`.mask-cell[data-row="${row}"][data-col="${col}"]`);
      
      if (!maskDiv) {
        maskState[row][col] = true;
        const cellHeight = imgHeight / ROWS;
        
        maskDiv = document.createElement('div');
        maskDiv.className = 'mask-cell';
        maskDiv.style.position = 'absolute';
        maskDiv.style.left = (col * cellWidth) + 'px';
        maskDiv.style.top = (row * cellHeight) + 'px';
        maskDiv.style.width = cellWidth + 'px';
        maskDiv.style.height = cellHeight + 'px';
        maskDiv.style.backgroundColor = 'rgba(0, 0, 0, 1)';
        maskDiv.style.borderRadius = '4px';
        maskDiv.style.pointerEvents = 'none';
        maskDiv.dataset.row = row;
        maskDiv.dataset.col = col;
        
        sheetWrapper.appendChild(maskDiv);
      }
      
      // percentage가 작아질수록 더 많이 가려짐
      // inset(0 Y% 0 0) = 오른쪽에서 Y%만큼 잘라냄
      if (percentage <= 1) {
        // 왼쪽 끝까지 왔으면 완전히 표시
        maskDiv.style.clipPath = '';
      } else {
        // percentage: 커서의 X 위치 (0~100%)
        // 왼쪽 드래그이므로 커서 오른쪽을 잘라냄
        maskDiv.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
      }
    }
  }
}

function updatePageInfo() {
  pageInfo.textContent = `${currentPage + 1} / ${pages.length}`;
}

function updateNavButtons() {
  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage === pages.length - 1;
}

init();
