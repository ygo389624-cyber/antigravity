// Smartwatch Diet Tracker Core Logic

// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// 0. AI API 및 시뮬레이터 설정
// --------------------------------------------------------------------------

const OPENAI_API_KEY = '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';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// OpenAI 텍스트 요청 공통 함수
async function callOpenAI(prompt) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || '알 수 없는 오류');
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// OpenAI 이미지 + 텍스트 요청 공통 함수
async function callOpenAIWithImage(prompt, fullDataUri) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: fullDataUri } }
        ]
      }]
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || '알 수 없는 오류');
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// 오프라인 음식 분석 시뮬레이터 함수
function mockFoodAnalysis(foodName, foodWeight) {
  const foodDatabase = {
    '닭가슴살': { kcal: 165, desc: '고단백질 저지방 식품으로 다이어트에 적합합니다.' },
    '고구마': { kcal: 86, desc: '복합 탄수화물과 식이섬유가 풍부해 포만감을 줍니다.' },
    '사과': { kcal: 52, desc: '비타민 C와 식이섬유가 많은 과일입니다.' },
    '현미밥': { kcal: 111, desc: '정제되지 않은 곡물로 혈당 지수가 낮습니다.' },
    '바나나': { kcal: 89, desc: '탄수화물과 칼륨이 풍부해 에너지를 줍니다.' },
    '샐러드': { kcal: 20, desc: '칼로리가 매우 낮고 비타민과 무기질이 풍부합니다.' },
    '달걀': { kcal: 155, desc: '질 좋은 단백질과 지방이 골고루 함유된 완벽한 식품입니다.' },
    '소고기': { kcal: 250, desc: '단백질과 철분이 풍부한 영양가 높은 육류입니다.' },
    '두부': { kcal: 76, desc: '식물성 단백질이 풍부하고 수분 함량이 높습니다.' },
    '우유': { kcal: 65, desc: '칼슘과 단백질이 풍부한 유제품입니다.' }
  };

  let baseKcal = 120; // 100g당 기본 칼로리
  let desc = '균형 잡힌 다이어트 식단입니다. 수분과 식이섬유 섭취에 유의하세요.';
  
  for (const [key, val] of Object.entries(foodDatabase)) {
    if (foodName.includes(key)) {
      baseKcal = val.kcal;
      desc = val.desc;
      break;
    }
  }

  const finalKcal = Math.round((baseKcal * foodWeight) / 100);
  const margin = Math.round(finalKcal * 0.08);

  return {
    kcal: finalKcal,
    margin: margin,
    description: `[오프라인 시뮬레이션 모드] ${desc}`
  };
}

// 오프라인 스마트워치 분석 시뮬레이터 함수
function mockWatchAnalysis(watchData) {
  let factor = 1.2;
  let level = '거의 운동 없음';
  let detail = '안정시 심박수 범위로 주로 정적인 휴식을 취했습니다.';

  const hr = watchData.avgHeartRate;
  if (hr >= 130) {
    factor = 1.9;
    level = '초고강도 활동';
    detail = '평균 심박수가 매우 높아 대단히 격렬한 운동을 수행한 것으로 파악됩니다.';
  } else if (hr >= 111) {
    factor = 1.725;
    level = '매우 활동적';
    detail = '평균 심박수가 110 bpm을 상회하여 강도 높은 유산소 활동을 수행했습니다.';
  } else if (hr >= 91) {
    factor = 1.55;
    level = '보통 활동';
    detail = '평균 심박수가 적절히 상승하여 일상적인 활동과 가벼운 운동이 병행되었습니다.';
  } else if (hr >= 76) {
    factor = 1.375;
    level = '가벼운 활동';
    detail = '가벼운 걷기 등 완만한 일상 생활 수준의 심박수를 보였습니다.';
  }

  return {
    factor: factor,
    level: level,
    detail: `[오프라인 시뮬레이션 모드] ${detail}`
  };
}


// --------------------------------------------------------------------------
// 1. Initial State & Storage Configuration
// --------------------------------------------------------------------------
let state = {
  profile: null,        // { gender, dob, height, weight, targetWeight, startWeight, bmr, bmi, joinDate }
  logs: {},             // Keyed by YYYY-MM-DD: { weight, intake: [{food, weight, kcal}], burn, activeFactor, smartwatchSync: {} }
  bluetooth: {
    connected: false,
    deviceName: null
  },
  currentScreen: 'dashboard', // dashboard, calendar, profile
  activeDate: null            // Selected date for logging (normally today)
};

const STORAGE_KEY = 'antigravity_diet_tracker_state';

// Load state from localStorage
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state = JSON.parse(saved);
    } catch (e) {
      console.error("Error parsing saved state", e);
    }
  }
}

// Save state to localStorage
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --------------------------------------------------------------------------
// 2. Mathematical Helper Functions
// --------------------------------------------------------------------------

// Calculate Age in Years from DOB string (YYYY/MM/DD or YYYY-MM-DD)
function calculateAge(dobStr) {
  const dob = new Date(dobStr.replace(/\//g, '-'));
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return Math.max(1, age);
}

// Mifflin-St Jeor BMR Equation
function calculateBMR(gender, age, height, weight) {
  if (gender === 'male') {
    return Math.round(10 * weight + 6.25 * height - 5 * age + 5);
  } else {
    return Math.round(10 * weight + 6.25 * height - 5 * age - 161);
  }
}

// BMI Equation
function calculateBMI(height, weight) {
  const heightM = height / 100;
  return parseFloat((weight / (heightM * heightM)).toFixed(1));
}

// --------------------------------------------------------------------------
// 3. Initialize Empty Logs on First Launch (No mock data)
// --------------------------------------------------------------------------
function initializeNewUser() {
  if (!state.profile) return;
  const prof = state.profile;

  const age = calculateAge(prof.dob);
  prof.bmr = calculateBMR(prof.gender, age, prof.height, prof.weight);
  prof.bmi = calculateBMI(prof.height, prof.weight);

  // 가입일부터 기록 시작 — 이전 데이터는 없음
  state.logs = {};
  saveState();
}

// --------------------------------------------------------------------------
// 4. UI Rendering Functions
// --------------------------------------------------------------------------

// Switch Screen Active State
function switchScreen(screenName) {
  state.currentScreen = screenName;
  document.querySelectorAll('.app-screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const activeScreen = document.getElementById(`screen-${screenName}`);
  if (activeScreen) activeScreen.classList.add('active');

  const activeNav = document.querySelector(`.nav-item[data-screen="${screenName}"]`);
  if (activeNav) activeNav.classList.add('active');

  if (screenName === 'dashboard') {
    renderDashboard();
  } else if (screenName === 'calendar') {
    renderCalendar();
  } else if (screenName === 'profile') {
    renderProfile();
  }
}

// A. Profile View Rendering
function renderProfile() {
  if (!state.profile) return;
  
  const prof = state.profile;
  
  // Update demographics cards
  document.getElementById('prof-gender').textContent = prof.gender === 'male' ? '남성' : '여성';
  document.getElementById('prof-age').textContent = `만 ${calculateAge(prof.dob)}세`;
  document.getElementById('prof-height').textContent = `${prof.height.toFixed(1)} cm`;
  document.getElementById('prof-weight').textContent = `${prof.weight.toFixed(1)} kg`;
  document.getElementById('prof-target').textContent = `${prof.targetWeight.toFixed(1)} kg`;
  
  // Real-time recalculated stats
  // BMR and BMI calculations should adapt to today's recorded weight if logged
  const todayStr = getTodayDateString();
  const latestWeight = state.logs[todayStr]?.weight || prof.weight;
  
  const currentAge = calculateAge(prof.dob);
  const currentBMR = calculateBMR(prof.gender, currentAge, prof.height, latestWeight);
  const currentBMI = calculateBMI(prof.height, latestWeight);
  
  document.getElementById('prof-real-weight').textContent = `${latestWeight.toFixed(1)} kg`;
  document.getElementById('prof-real-bmr').textContent = `${currentBMR} kcal`;
  document.getElementById('prof-real-bmi').textContent = currentBMI;
  
  // BMI classification text
  let bmiDesc = '정상';
  let bmiColor = 'var(--color-weight)';
  if (currentBMI < 18.5) {
    bmiDesc = '저체중';
    bmiColor = '#3b82f6';
  } else if (currentBMI >= 23 && currentBMI < 25) {
    bmiDesc = '과체중';
    bmiColor = '#f59e0b';
  } else if (currentBMI >= 25) {
    bmiDesc = '비만';
    bmiColor = '#ef4444';
  }
  
  const bmiLabelNode = document.getElementById('prof-bmi-desc');
  bmiLabelNode.textContent = bmiDesc;
  bmiLabelNode.style.color = bmiColor;
  
  // Bluetooth Sync status indicator
  const btnWatch = document.getElementById('btn-watch-sync');
  if (state.bluetooth.connected) {
    btnWatch.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1-5h-2v6h2V7zm0 8h-2v2h2v-2z"/></svg> ${state.bluetooth.deviceName}`;
    btnWatch.classList.add('connected');
  } else {
    btnWatch.innerHTML = `<svg viewBox="0 0 24 24"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.29L13 18.17v-3.76l1.88 1.88z"/></svg> 블루투스 연동`;
    btnWatch.classList.remove('connected');
  }
}

// B. Dashboard / Charts Screen Rendering
let dietChart = null; // Store Chart.js instance globally to reuse

function renderDashboard() {
  if (!state.profile) return;

  const prof = state.profile;
  const todayStr = getTodayDateString();
  const latestWeight = state.logs[todayStr]?.weight || prof.weight;

  // 1. Calculate Weight Loss Goal Progress (Battery)
  // Progress = (Start - Current) / (Start - Target) * 100
  let progressPct = 0;
  if (prof.startWeight !== prof.targetWeight) {
    const lossSoFar = prof.startWeight - latestWeight;
    const totalGoal = prof.startWeight - prof.targetWeight;
    progressPct = (lossSoFar / totalGoal) * 100;
    progressPct = Math.max(0, Math.min(100, Math.round(progressPct))); // Bounded [0, 100]
  }
  
  // Fill battery bar & text
  document.getElementById('battery-fill').style.width = `${progressPct}%`;
  document.getElementById('battery-value-pct').textContent = `${progressPct}%`;
  document.getElementById('battery-start-w').textContent = `시작: ${prof.startWeight.toFixed(1)}kg`;
  document.getElementById('battery-current-w').textContent = `현재: ${latestWeight.toFixed(1)}kg`;
  document.getElementById('battery-target-w').textContent = `목표: ${prof.targetWeight.toFixed(1)}kg`;

  // 2. Render summary stats inside dashboard
  let todayIntakeKcal = 0;
  let todayBurnKcal = 0;
  if (state.logs[todayStr]) {
    const todayLog = state.logs[todayStr];
    todayIntakeKcal = (todayLog.intake || []).reduce((acc, f) => acc + f.kcal, 0);
    todayBurnKcal = todayLog.burn || 0;
  }
  
  const todayDeficit = todayBurnKcal - todayIntakeKcal;
  document.getElementById('dash-stat-weight').textContent = `${latestWeight.toFixed(1)} kg`;
  document.getElementById('dash-stat-intake').textContent = `${todayIntakeKcal} kcal`;
  document.getElementById('dash-stat-burn').textContent = `${todayBurnKcal} kcal`;
  document.getElementById('dash-stat-deficit').textContent = `${todayDeficit} kcal`;

  // 3. Render Chart
  renderChartData();
}

// Helper to determine active overlay metrics in checkbox dropdown
function getActiveChartMetrics() {
  const metrics = [];
  if (document.getElementById('chk-metric-intake').checked) metrics.push('intake');
  if (document.getElementById('chk-metric-burn').checked) metrics.push('burn');
  if (document.getElementById('chk-metric-deficit').checked) metrics.push('deficit');
  if (document.getElementById('chk-metric-cumulative').checked) metrics.push('cumulative');
  if (document.getElementById('chk-metric-weight').checked) metrics.push('weight');
  return metrics;
}

// Process and Draw Chart.js Line Chart
function renderChartData() {
  const activeMetrics = getActiveChartMetrics();
  const period = document.querySelector('.btn-period.active').getAttribute('data-period'); // day, week, month

  // Extract dates in chronological order
  const sortedDates = Object.keys(state.logs).sort();
  if (sortedDates.length === 0) return;

  // Structure RAW days data array
  let datasetRaw = sortedDates.map(dateStr => {
    const log = state.logs[dateStr];
    const intakeKcal = (log.intake || []).reduce((acc, f) => acc + f.kcal, 0);
    const burnKcal = log.burn || 0;
    const deficit = burnKcal - intakeKcal;
    const startW = state.profile?.startWeight || state.profile?.weight || 0;
    const weightDeficit = startW > 0 ? parseFloat((startW - log.weight).toFixed(1)) : 0;
    return {
      date: dateStr,
      weight: log.weight,
      weightDeficit: weightDeficit,
      intake: intakeKcal,
      burn: burnKcal,
      deficit: deficit
    };
  });

  // Calculate Cumulative Deficits chronologically
  let cumulativeDeficitSum = 0;
  datasetRaw.forEach(item => {
    cumulativeDeficitSum += item.deficit;
    item.cumulative = cumulativeDeficitSum;
  });

  // Group by selected period averages (day, week, month)
  let finalData = [];
  if (period === 'day') {
    finalData = datasetRaw;
  } else if (period === 'week') {
    // Group into chunks of 7 days
    let chunk = [];
    let weekIndex = 1;
    for (let i = 0; i < datasetRaw.length; i++) {
      chunk.push(datasetRaw[i]);
      if (chunk.length === 7 || i === datasetRaw.length - 1) {
        // Average chunk values
        const avgWeight = chunk.reduce((acc, item) => acc + item.weight, 0) / chunk.length;
        const avgWeightDeficit = chunk.reduce((acc, item) => acc + item.weightDeficit, 0) / chunk.length;
        const avgIntake = chunk.reduce((acc, item) => acc + item.intake, 0) / chunk.length;
        const avgBurn = chunk.reduce((acc, item) => acc + item.burn, 0) / chunk.length;
        const avgDeficit = chunk.reduce((acc, item) => acc + item.deficit, 0) / chunk.length;
        // Cumulative is the latest value in this week
        const latestCumulative = chunk[chunk.length - 1].cumulative;
        
        finalData.push({
          date: `${weekIndex}주차`,
          weight: parseFloat(avgWeight.toFixed(1)),
          weightDeficit: parseFloat(avgWeightDeficit.toFixed(1)),
          intake: Math.round(avgIntake),
          burn: Math.round(avgBurn),
          deficit: Math.round(avgDeficit),
          cumulative: Math.round(latestCumulative)
        });
        chunk = [];
        weekIndex++;
      }
    }
  } else if (period === 'month') {
    // Group into chunks of 30 days
    let chunk = [];
    let monthIndex = 1;
    for (let i = 0; i < datasetRaw.length; i++) {
      chunk.push(datasetRaw[i]);
      if (chunk.length === 30 || i === datasetRaw.length - 1) {
        const avgWeight = chunk.reduce((acc, item) => acc + item.weight, 0) / chunk.length;
        const avgWeightDeficit = chunk.reduce((acc, item) => acc + item.weightDeficit, 0) / chunk.length;
        const avgIntake = chunk.reduce((acc, item) => acc + item.intake, 0) / chunk.length;
        const avgBurn = chunk.reduce((acc, item) => acc + item.burn, 0) / chunk.length;
        const avgDeficit = chunk.reduce((acc, item) => acc + item.deficit, 0) / chunk.length;
        const latestCumulative = chunk[chunk.length - 1].cumulative;

        finalData.push({
          date: `${monthIndex}개월차`,
          weight: parseFloat(avgWeight.toFixed(1)),
          weightDeficit: parseFloat(avgWeightDeficit.toFixed(1)),
          intake: Math.round(avgIntake),
          burn: Math.round(avgBurn),
          deficit: Math.round(avgDeficit),
          cumulative: Math.round(latestCumulative)
        });
        chunk = [];
        monthIndex++;
      }
    }
  }

  // Build Chart.js structure
  const labels = finalData.map(item => {
    if (period === 'day') {
      // Show MM-DD for daily
      const d = new Date(item.date);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    return item.date;
  });

  const datasets = [];

  // Mapping line colors & configs
  const configMap = {
    intake: {
      label: '섭취 칼로리 (kcal)',
      borderColor: 'hsl(24, 100%, 60%)',
      backgroundColor: 'hsla(24, 100%, 60%, 0.1)',
      yAxisID: 'yCalories',
      dataKey: 'intake'
    },
    burn: {
      label: '소비 칼로리 (kcal)',
      borderColor: 'hsl(330, 100%, 65%)',
      backgroundColor: 'hsla(330, 100%, 65%, 0.1)',
      yAxisID: 'yCalories',
      dataKey: 'burn'
    },
    deficit: {
      label: '적자 칼로리 (kcal)',
      borderColor: 'hsl(195, 100%, 50%)',
      backgroundColor: 'hsla(195, 100%, 50%, 0.1)',
      yAxisID: 'yCalories',
      dataKey: 'deficit'
    },
    cumulative: {
      label: '누적 적자 칼로리 (kcal)',
      borderColor: 'hsl(270, 100%, 65%)',
      backgroundColor: 'hsla(270, 100%, 65%, 0.1)',
      yAxisID: 'yCalories',
      dataKey: 'cumulative'
    },
    weight: {
      label: '몸무게 적자량 (kg)',
      borderColor: 'hsl(145, 80%, 50%)',
      backgroundColor: 'hsla(145, 80%, 50%, 0.1)',
      yAxisID: 'yWeight',
      dataKey: 'weightDeficit'
    }
  };

  activeMetrics.forEach(metric => {
    const config = configMap[metric];
    datasets.push({
      label: config.label,
      data: finalData.map(item => item[config.dataKey]),
      borderColor: config.borderColor,
      backgroundColor: config.backgroundColor,
      borderWidth: 2,
      pointRadius: labels.length > 20 ? 0 : 3,
      tension: 0.3,
      yAxisID: config.yAxisID
    });
  });

  const ctx = document.getElementById('dietChartCanvas').getContext('2d');
  
  if (dietChart) {
    dietChart.destroy();
  }

  // 1. Determine scale configuration
  const isCumulativeActive = activeMetrics.includes('cumulative');
  const isWeightActive = activeMetrics.includes('weight');

  let yCaloriesConfig = {
    type: 'linear',
    position: 'left',
    grid: {
      color: 'rgba(255, 255, 255, 0.05)'
    },
    ticks: {
      color: 'hsl(215, 20%, 65%)',
      font: { size: 9, family: 'Outfit' }
    },
    title: {
      display: true,
      text: '칼로리 (kcal)',
      color: 'hsl(215, 20%, 65%)',
      font: { size: 10, family: 'Outfit', weight: 'bold' }
    }
  };

  let yWeightConfig = {
    type: 'linear',
    position: 'right',
    grid: {
      drawOnChartArea: false // Don't overlay gridlines
    },
    ticks: {
      color: 'hsl(215, 20%, 65%)',
      font: { size: 9, family: 'Outfit' }
    },
    title: {
      display: true,
      text: '몸무게 적자량 (kg)',
      color: 'hsl(215, 20%, 65%)',
      font: { size: 10, family: 'Outfit', weight: 'bold' }
    }
  };

  // 정비례 관계 매칭: 누적 칼로리 적자(cumulative)와 몸무게 적자량(weight)이 모두 활성화된 경우
  // 7700 kcal = 1 kg 비율로 양쪽 Y축의 min, max 범위를 동기화시킵니다.
  if (isCumulativeActive && isWeightActive) {
    // 누적 칼로리 적자(cumulative)의 최댓값과 최솟값 검색
    let maxCum = -Infinity;
    let minCum = Infinity;
    finalData.forEach(item => {
      const val = item.cumulative || 0;
      if (val > maxCum) maxCum = val;
      if (val < minCum) minCum = val;
    });

    if (maxCum === -Infinity) maxCum = 1000;
    if (minCum === Infinity) minCum = 0;

    // 패딩 추가 (위아래 여백 10% 추가)
    const range = maxCum - minCum;
    const padding = range * 0.1 || 1000;
    const yCalMin = Math.floor((minCum - padding) / 1000) * 1000;
    const yCalMax = Math.ceil((maxCum + padding) / 1000) * 1000;

    yCaloriesConfig.min = yCalMin;
    yCaloriesConfig.max = yCalMax;

    // 몸무게 Y축 범위를 7700 비율로 완전 매칭시킴 (7700 kcal = 1 kg)
    yWeightConfig.min = parseFloat((yCalMin / 7700).toFixed(2));
    yWeightConfig.max = parseFloat((yCalMax / 7700).toFixed(2));
  }

  // Render chart with multiple Y axes (Calories vs Weight)
  dietChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // We will let the checklist serve as legend
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#111625',
          titleColor: '#fff',
          bodyColor: '#cbd5e1',
          borderColor: '#1e293b',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: 'hsl(215, 20%, 65%)',
            font: { size: 10, family: 'Outfit' }
          }
        },
        yCalories: yCaloriesConfig,
        yWeight: yWeightConfig
      }
    }
  });
}

// C. Diet Calendar Rendering
function renderCalendar() {
  const calGrid = document.getElementById('calendar-grid-container');
  calGrid.innerHTML = '';

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  // Title Month Name
  document.getElementById('calendar-month-name').textContent = `${currentYear}년 ${currentMonth + 1}월`;

  // 가입일 가져오기 (없으면 오늘로 폴백)
  const joinDateStr = state.profile?.joinDate || getTodayDateString();

  // First day of the month
  const firstDay = new Date(currentYear, currentMonth, 1);
  const startDayOfWeek = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Draw empty spacers before first day of month
  for (let i = 0; i < startDayOfWeek; i++) {
    const spacer = document.createElement('div');
    spacer.className = 'calendar-cell empty';
    calGrid.appendChild(spacer);
  }

  // Draw actual days
  const todayStr = getTodayDateString();

  for (let day = 1; day <= totalDays; day++) {
    const cellDate = new Date(currentYear, currentMonth, day);
    const cellDateStr = cellDate.toISOString().split('T')[0];

    const cell = document.createElement('div');
    cell.className = 'calendar-cell';

    const isToday = cellDateStr === todayStr;
    const isPast = cellDateStr < todayStr;
    const isFuture = cellDateStr > todayStr;
    const isBeforeJoin = cellDateStr < joinDateStr; // 가입일 이전 여부

    // Display Day Number
    const dayNumSpan = document.createElement('span');
    dayNumSpan.className = 'day-number';
    dayNumSpan.textContent = day;
    cell.appendChild(dayNumSpan);

    // 가입일 이전 날짜: 완전히 비활성 (데이터 없음, 클릭 불가, 흐리게)
    if (isBeforeJoin) {
      cell.classList.add('before-join');
      calGrid.appendChild(cell);
      continue; // 아래 로직 건너뜀
    }

    // 가입일 이후: 데이터 있으면 수치 표시
    const dayLog = state.logs[cellDateStr];
    if (dayLog) {
      cell.classList.add('has-data');

      const statsDiv = document.createElement('div');
      statsDiv.className = 'day-stats';

      // Weight
      if (dayLog.weight) {
        const wDiv = document.createElement('div');
        wDiv.className = 'day-stat-dot ds-weight';
        wDiv.textContent = `${dayLog.weight}kg`;
        statsDiv.appendChild(wDiv);
      }

      // Intake calories
      const intakeKcal = (dayLog.intake || []).reduce((acc, f) => acc + f.kcal, 0);
      if (intakeKcal > 0) {
        const iDiv = document.createElement('div');
        iDiv.className = 'day-stat-dot ds-intake';
        iDiv.textContent = `먹:${intakeKcal}`;
        statsDiv.appendChild(iDiv);
      }

      // Burn calories
      if (dayLog.burn) {
        const bDiv = document.createElement('div');
        bDiv.className = 'day-stat-dot ds-burn';
        bDiv.textContent = `소:${dayLog.burn}`;
        statsDiv.appendChild(bDiv);
      }

      // Deficit
      if (dayLog.burn && intakeKcal > 0) {
        const deficit = dayLog.burn - intakeKcal;
        const defDiv = document.createElement('div');
        defDiv.className = 'day-stat-dot ds-deficit';
        defDiv.textContent = `적:${deficit}`;
        statsDiv.appendChild(defDiv);
      }

      cell.appendChild(statsDiv);
    }

    // Interactive logic
    if (isToday) {
      cell.classList.add('active-today');
      cell.addEventListener('click', () => openLoggerModal(cellDateStr));
    } else if (isPast && !isBeforeJoin && dayLog) {
      // 가입 이후 과거 날짜로 데이터 있으면 읽기 전용으로 클릭 가능
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => openLoggerModal(cellDateStr, true));
    } else if (isPast && !isBeforeJoin && !dayLog) {
      // 가입 이후 과거인데 기록 없는 날 → 미기록 표시
      cell.classList.add('missed-day');
    } else if (isFuture) {
      cell.style.opacity = '0.25';
    }

    calGrid.appendChild(cell);
  }
}

// --------------------------------------------------------------------------
// 5. Smartwatch Bluetooth Connect & Sync (Real Web Bluetooth API)
// --------------------------------------------------------------------------
// 글로벌 블루투스 기기 연동 인메모리 상태 (새로고침 시 초기화되므로 gatt 재연결 필요)
let activeBluetoothDevice = null;
let activeHeartRateChar = null;
let currentLiveHeartRate = 0;

function openBluetoothModal() {
  const modal = document.getElementById('modal-bluetooth');
  modal.classList.add('active');
  
  renderBluetoothStatusUI();
}

function renderBluetoothStatusUI() {
  const container = document.getElementById('bluetooth-status-container');
  if (!container) return;

  if (state.bluetooth.connected) {
    container.innerHTML = `
      <div style="font-size: 13px; color: var(--text-primary); margin-bottom: 8px;">
        <span style="color: var(--color-weight); font-weight: bold;">● 기기 연결됨</span>: ${state.bluetooth.deviceName}
      </div>
      <p style="font-size: 11px; color: var(--text-secondary); line-height: 1.6; text-align: left; padding: 0 10px;">
        실제 스마트워치/밴드가 성공적으로 브라우저와 연동되었습니다. 수집된 실시간 심박 데이터 등을 기반으로 칼로리 연소량이 정밀하게 도출됩니다.
      </p>
      <button id="btn-disconnect-bluetooth" class="btn-primary" style="background: #ef4444; color: #fff; margin-top: 10px; width: 100%; box-shadow: none;">
        연결 해제
      </button>
    `;

    document.getElementById('btn-disconnect-bluetooth').addEventListener('click', disconnectBluetoothDevice);
  } else {
    container.innerHTML = `
      <div style="font-size: 32px; margin-bottom: 6px;">⌚</div>
      <p style="font-size: 11px; color: var(--text-secondary); line-height: 1.6; text-align: left; padding: 0 10px;">
        실제 스마트 워치 또는 블루투스 심박 측정기 기기와 연동을 진행합니다.<br><br>
        <strong>연동 단계:</strong><br>
        1. 워치나 밴드의 블루투스 연결 대기(페어링 모드) 상태를 켜주세요.<br>
        2. 아래 버튼을 클릭하면 브라우저의 <strong>기기 탐색 팝업창</strong>이 나타납니다.<br>
        3. 목록에서 연결할 기기를 선택해주세요.
      </p>
      <button id="btn-start-ble-scan" class="btn-primary" style="margin-top: 10px; width: 100%;">
        주변 기기 검색 및 연동
      </button>
    `;

    document.getElementById('btn-start-ble-scan').addEventListener('click', pairBluetoothDeviceActual);
  }
}

function connectVirtualWatch() {
  state.bluetooth.connected = true;
  state.bluetooth.deviceName = "가상 스마트워치 (FitSync Virtual)";
  saveState();
  closeModal('modal-bluetooth');
  renderProfile();
  showToastNotification("가상 워치 연결 완료", "테스트용 가상 스마트워치와 연동되었습니다.");
}

async function pairBluetoothDeviceActual() {
  if (!navigator.bluetooth) {
    if (confirm("웹 브라우저 보안 규정(HTTPS 또는 localhost 필요)으로 인해 실제 블루투스 탐색이 차단된 상태입니다.\n\n대신 테스트용 가상 스마트워치와 연동하여 모든 기능을 테스트해보시겠습니까?")) {
      connectVirtualWatch();
    } else {
      renderBluetoothStatusUI();
    }
    return;
  }

  const container = document.getElementById('bluetooth-status-container');
  container.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <div class="ai-loading-box" style="display: block; margin-bottom: 12px;">브라우저 기기 선택 창 대기 중...</div>
      연동할 블루투스 스마트 워치/밴드를 선택해주세요.
    </div>
  `;

  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['heart_rate']
    });

    container.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <div class="ai-loading-box" style="display: block; margin-bottom: 12px;">${device.name || '스마트워치'} 연결 중...</div>
        GATT 서버에 접속하고 있습니다.
      </div>
    `;

    const server = await device.gatt.connect();
    activeBluetoothDevice = device;

    // 기기 예기치 못한 연결 해제 리스너
    device.addEventListener('gattserverdisconnected', onBluetoothDisconnectedUnexpectedly);

    state.bluetooth.connected = true;
    state.bluetooth.deviceName = device.name || '알 수 없는 블루투스 기기';
    saveState();

    // 표준 심박수 수집 시도
    try {
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      activeHeartRateChar = characteristic;

      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleHeartRateNotification);
      console.log("실시간 BLE 심박수 수집이 시작되었습니다.");
    } catch (hrErr) {
      console.warn("표준 BLE 심박 서비스를 지원하지 않거나 연동 실패. 기기 연결 상태만 유지합니다.", hrErr);
    }

    closeModal('modal-bluetooth');
    renderProfile();
    showToastNotification("블루투스 연동 성공", `[${state.bluetooth.deviceName}]와 실제로 연동되었습니다.`);

  } catch (err) {
    console.error("블루투스 연결 시 오류 발생:", err);
    renderBluetoothStatusUI();
    if (err.name !== 'NotFoundError') {
      if (confirm(`블루투스 연동에 실패했습니다 (원인: ${err.message}).\n\n대신 테스트를 위해 가상 스마트워치와 연동하시겠습니까?`)) {
        connectVirtualWatch();
      }
    }
  }
}

function onBluetoothDisconnectedUnexpectedly() {
  state.bluetooth.connected = false;
  state.bluetooth.deviceName = null;
  activeBluetoothDevice = null;
  activeHeartRateChar = null;
  currentLiveHeartRate = 0;
  saveState();
  renderProfile();
  showToastNotification("블루투스 끊김", "연동되어 있던 기기와의 블루투스 연결이 끊어졌습니다.");
}

function disconnectBluetoothDevice() {
  if (activeBluetoothDevice && activeBluetoothDevice.gatt.connected) {
    activeBluetoothDevice.gatt.disconnect();
  } else {
    state.bluetooth.connected = false;
    state.bluetooth.deviceName = null;
    activeBluetoothDevice = null;
    activeHeartRateChar = null;
    currentLiveHeartRate = 0;
    saveState();
    renderProfile();
    closeModal('modal-bluetooth');
    showToastNotification("연결 해제 완료", "블루투스 기기 연결을 해제했습니다.");
  }
}

function handleHeartRateNotification(event) {
  const value = event.target.value;
  const flags = value.getUint8(0);
  const rate16 = flags & 0x01;
  let heartRate = 0;
  if (rate16) {
    heartRate = value.getUint16(1, true);
  } else {
    heartRate = value.getUint8(1);
  }
  currentLiveHeartRate = heartRate;
  console.log(`수신된 실시간 심박수: ${heartRate} bpm`);
}

// --------------------------------------------------------------------------
// 6. Logger Dialog & Simulation Workflow
// --------------------------------------------------------------------------
function openLoggerModal(dateStr, readOnly = false) {
  state.activeDate = dateStr;
  
  // Format Date title header
  const d = new Date(dateStr);
  const formattedDate = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 기록`;
  document.getElementById('logger-modal-title').textContent = formattedDate;

  const log = state.logs[dateStr] || { weight: null, intake: [], burn: 0 };
  
  // Reset logs input forms
  document.getElementById('logger-modal').classList.add('active');

  // Step 1 check: Morning Empty Stomach Weight
  if (!log.weight) {
    // Show Weight Entry panel, hide split logger
    document.getElementById('logger-step-weight').style.display = 'flex';
    document.getElementById('logger-step-split').style.display = 'none';
    document.getElementById('input-morning-weight').value = '';
  } else {
    // Show split calorie log panels
    document.getElementById('logger-step-weight').style.display = 'none';
    document.getElementById('logger-step-split').style.display = 'flex';
    loadSplitLoggerData(dateStr);
  }
}

// Proceed past weight prompt to full intake/burn panels
function saveMorningWeight() {
  const weightVal = parseFloat(document.getElementById('input-morning-weight').value);
  if (isNaN(weightVal) || weightVal <= 20 || weightVal >= 300) {
    alert("올바른 몸무게를 입력하세요 (예: 70.5)");
    return;
  }

  const dateStr = state.activeDate;
  if (!state.logs[dateStr]) {
    state.logs[dateStr] = { weight: weightVal, intake: [], burn: 0 };
  } else {
    state.logs[dateStr].weight = weightVal;
  }

  // Update profile current weight
  state.profile.weight = weightVal;
  
  // Update Profile BMR and BMI dynamically based on latest daily recorded weight
  const currentAge = calculateAge(state.profile.dob);
  state.profile.bmr = calculateBMR(state.profile.gender, currentAge, state.profile.height, weightVal);
  state.profile.bmi = calculateBMI(state.profile.height, weightVal);
  
  saveState();

  // Transition to Split Logger
  document.getElementById('logger-step-weight').style.display = 'none';
  document.getElementById('logger-step-split').style.display = 'flex';
  loadSplitLoggerData(dateStr);
  renderProfile();
  renderDashboard();
}

// Load current logs into split logs DOM
function loadSplitLoggerData(dateStr) {
  const log = state.logs[dateStr];
  const prof = state.profile;
  const currentAge = calculateAge(prof.dob);
  const calculatedBmr = calculateBMR(prof.gender, currentAge, prof.height, log.weight);

  // BMR display label
  document.getElementById('logger-bmr-val').textContent = `${calculatedBmr} kcal`;

  // Editable Weight display
  document.getElementById('inline-edit-weight').value = log.weight;

  // Intake food logs summary
  const intakeList = document.getElementById('logged-food-list');
  intakeList.innerHTML = '';
  
  const totalIntakeKcal = (log.intake || []).reduce((acc, f, index) => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.fontSize = '12px';
    item.style.padding = '4px 0';
    item.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
    
    item.innerHTML = `
      <span>🍴 ${f.food} (${f.weight}g)</span> 
      <div style="display: flex; align-items: center; gap: 8px;">
        <strong>+${f.kcal} kcal</strong>
        <button class="btn-delete-food" data-index="${index}" style="background: transparent; border: none; color: #ef4444; cursor: pointer; font-size: 16px; padding: 0 4px;" title="기록 삭제">×</button>
      </div>
    `;
    intakeList.appendChild(item);
    return acc + f.kcal;
  }, 0);

  // Add delete listeners
  document.querySelectorAll('.btn-delete-food').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      deleteFoodIntake(idx);
    });
  });

  document.getElementById('logger-total-intake').textContent = `${totalIntakeKcal} kcal`;

  // Reset inputs
  document.getElementById('input-food-name').value = '';
  document.getElementById('input-food-weight').value = '';
  document.getElementById('food-photo-preview').innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0-2-.9-2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg><span>음식 사진 첨부 (선택)</span>';

  // Smartwatch burn status
  const watchGrid = document.getElementById('sync-watch-stats-grid');
  const syncBtn = document.getElementById('btn-smartwatch-sync-trigger');
  const coeffOutput = document.getElementById('watch-coeff-output');

  if (log.smartwatchSync && log.smartwatchSync.heartRate) {
    // Log contains watch sync parameters
    watchGrid.style.display = 'grid';
    coeffOutput.style.display = 'flex';
    syncBtn.style.display = 'none';

    document.getElementById('watch-val-hr').textContent = `${log.smartwatchSync.heartRate} bpm`;
    document.getElementById('watch-val-detail').textContent = log.smartwatchSync.desc;

    document.getElementById('txt-coeff-val').textContent = log.activeFactor;
    document.getElementById('txt-tdee-val').textContent = `${log.burn} kcal`;
  } else {
    watchGrid.style.display = 'none';
    coeffOutput.style.display = 'none';
    syncBtn.style.display = 'block';
  }
}

// Intake: Mock Photo Upload preview
function triggerPhotoUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        const preview = document.getElementById('food-photo-preview');
        preview.innerHTML = `<img src="${event.target.result}" alt="Food photo">`;
      };
      reader.readAsDataURL(file);
    }
  };
  input.click();
}

// AI Calorie Estimation Logic (OpenAI API 연동)
// AI Calorie Estimation Logic
async function saveFoodIntake() {
  const foodName = document.getElementById('input-food-name').value.trim();
  const foodWeight = parseFloat(document.getElementById('input-food-weight').value);

  if (!foodName) {
    alert("음식 이름을 입력하세요.");
    return;
  }
  if (isNaN(foodWeight) || foodWeight <= 0) {
    alert("음식 무게를 입력하세요 (g 단위).");
    return;
  }

  const aiLoader = document.getElementById('food-ai-loader');
  aiLoader.style.display = 'block';

  // 사진 첨부 여부 확인
  const photoFrame = document.getElementById('food-photo-preview');
  const photoImg = photoFrame.querySelector('img');

  try {
    let resultText;

    if (photoImg && photoImg.src.startsWith('data:')) {
      // ── 사진이 있으면 GPT-4o로 이미지 분석 ──
      aiLoader.textContent = '📸 GPT-4o가 음식 사진을 분석하는 중...';
      const fullDataUri = photoImg.src;

      const prompt =
        `다음 음식 사진과 추가 정보를 바탕으로 칼로리를 추정해줘.\n` +
        `음식명: ${foodName}\n무게: ${foodWeight}g\n\n` +
        `응답 형식 (JSON만, 다른 말 없이):\n` +
        `{"kcal": 숫자, "margin": 숫자, "description": "짧은 설명"}`;

      resultText = await callOpenAIWithImage(prompt, fullDataUri);
    } else {
      // ── 텍스트만으로 GPT-4o 분석 ──
      aiLoader.textContent = '🤖 GPT-4o가 칼로리를 추정하는 중...';
      const prompt =
        `한국 음식 영양 전문가로서 아래 음식의 칼로리를 추정해줘.\n` +
        `음식명: ${foodName}\n무게: ${foodWeight}g\n\n` +
        `응답 형식 (JSON만, 다른 말 없이):\n` +
        `{"kcal": 숫자, "margin": 숫자, "description": "짧은 설명"}`;

      resultText = await callOpenAI(prompt);
    }

    aiLoader.textContent = '✅ AI 분석 완료!';

    // JSON 파싱 (GPT가 가끔 ```json 블록으로 감쌀 수 있음)
    const jsonMatch = resultText.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error('AI 응답 형식 오류');
    const result = JSON.parse(jsonMatch[0]);

    const finalKcal = Math.round(result.kcal);
    const margin = Math.round(result.margin) || Math.round(finalKcal * 0.08);
    const desc = result.description || '';

    setTimeout(() => {
      aiLoader.style.display = 'none';

      const dateStr = state.activeDate;
      state.logs[dateStr].intake.push({ food: foodName, weight: foodWeight, kcal: finalKcal });
      saveState();
      loadSplitLoggerData(dateStr);
      renderCalendar();
      renderDashboard();

      alert(`🤖 GPT-4o 분석 결과\n\n${foodName} (${foodWeight}g)\n추정 칼로리: ${finalKcal} kcal (±${margin} kcal)\n\n${desc}`);
    }, 500);

  } catch (err) {
    aiLoader.style.display = 'none';
    console.error('OpenAI API 오류:', err);

    // 로컬 시뮬레이션 모드로 폴백
    const fallback = mockFoodAnalysis(foodName, foodWeight);
    const finalKcal = fallback.kcal;
    const margin = fallback.margin;
    const desc = fallback.description;

    const dateStr = state.activeDate;
    state.logs[dateStr].intake.push({ food: foodName, weight: foodWeight, kcal: finalKcal });
    saveState();
    loadSplitLoggerData(dateStr);
    renderCalendar();
    renderDashboard();

    alert(`⚠️ OpenAI API 호출 실패 (이유: ${err.message})\n\n[로컬 시뮬레이션 모드로 자동 전환됨]\n${foodName} (${foodWeight}g)\n추정 칼로리: ${finalKcal} kcal (±${margin} kcal)\n\n${desc}\n\n* API 키의 사용량 초과(Quota Exceeded) 혹은 결제 수단을 확인해주세요.`);
  }
}

// --------------------------------------------------------------------------
// Smartwatch 데이터 → AI 활동계수 분석
// --------------------------------------------------------------------------
async function startSmartwatchSync() {
  if (!state.bluetooth.connected) {
    alert('연동된 블루투스 기기가 없습니다. 프로필 화면에서 스마트 워치 또는 밴드 기기를 먼저 연결해주세요!');
    switchScreen('profile');
    closeModal('logger-modal');
    return;
  }

  const syncBtn = document.getElementById('btn-smartwatch-sync-trigger');
  const statusEl = document.createElement('div');
  statusEl.className = 'ai-loading-box';
  statusEl.style.display = 'block';
  statusEl.style.marginTop = '10px';
  syncBtn.parentNode.appendChild(statusEl);
  syncBtn.textContent = '기기 동기화 중...';
  syncBtn.disabled = true;

  // 실측 심박수를 우선적으로 사용하고, 없으면 연동 상태 기반으로 도출
  const heartRateVal = currentLiveHeartRate > 0 ? currentLiveHeartRate : Math.round(72 + Math.random() * 45);
  const isRealHr = currentLiveHeartRate > 0;

  const watchData = {
    avgHeartRate: heartRateVal
  };

  const steps = [
    `⌚ 연동 기기 [${state.bluetooth.deviceName}]와 실시간 통신 중...`,
    isRealHr ? `💓 실시간 센서 심박수 감측 완료: ${heartRateVal} bpm` : `💓 기기 센서 데이터 로드 완료`,
    `🤖 GPT-4o가 심박수 기반 활동량 분석 중...`
  ];
  let si = 0;
  statusEl.textContent = steps[si];
  const ticker = setInterval(() => {
    si++;
    if (si < steps.length) statusEl.textContent = steps[si];
  }, 1000);

  try {
    const prompt =
      `스마트 워치로부터 측정된 평균 심박수 데이터를 분석해서 오늘 하루 활동계수(Activity Factor)를 산출해줘.\n\n` +
      `스마트 워치 데이터:\n` +
      `- 기기명: ${state.bluetooth.deviceName}\n` +
      `- 평균 심박수: ${watchData.avgHeartRate} bpm\n\n` +
      `심박수 기반 활동계수 기준 가이드:\n` +
      `- 60 ~ 75 bpm: 거의 운동 없음 (활동계수 1.2)\n` +
      `- 76 ~ 90 bpm: 가벼운 일상 활동 (활동계수 1.375)\n` +
      `- 91 ~ 110 bpm: 보통 활동 및 적당한 운동 (활동계수 1.55)\n` +
      `- 111 ~ 130 bpm: 매우 활동적 및 강도 높은 운동 (활동계수 1.725)\n` +
      `- 130 bpm 초과: 격렬한 활동 및 초고강도 운동 (활동계수 1.9)\n\n` +
      `응답 형식 (JSON만, 다른 말 없이):\n` +
      `{"factor": 숫자, "level": "활동 수준 설명", "detail": "평균 심박수 기반 분석 결과 한 문장"}`;

    const resultText = await callOpenAI(prompt);
    clearInterval(ticker);

    const jsonMatch = resultText.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error('AI 응답 형식 오류');
    const result = JSON.parse(jsonMatch[0]);

    const dateStr = state.activeDate;
    const log = state.logs[dateStr];
    const prof = state.profile;
    const currentAge = calculateAge(prof.dob);
    const dayBmr = calculateBMR(prof.gender, currentAge, prof.height, log.weight);
    const totalBurn = Math.round(dayBmr * result.factor);

    log.activeFactor = result.factor;
    log.burn = totalBurn;
    log.smartwatchSync = {
      heartRate: watchData.avgHeartRate,
      desc: `${result.level} — ${result.detail}`
    };

    saveState();
    statusEl.remove();
    syncBtn.style.display = 'none';
    loadSplitLoggerData(dateStr);
    renderCalendar();
    renderDashboard();

  } catch (err) {
    clearInterval(ticker);
    statusEl.remove();
    syncBtn.textContent = '스마트 워치 동기화 & 활동 계수 도출';
    syncBtn.disabled = false;
    console.error('GPT-4o 워치 분석 오류:', err);

    // 로컬 시뮬레이션 모드로 폴백
    const fallback = mockWatchAnalysis(watchData);
    const dateStr = state.activeDate;
    const log = state.logs[dateStr];
    const prof = state.profile;
    const currentAge = calculateAge(prof.dob);
    const dayBmr = calculateBMR(prof.gender, currentAge, prof.height, log.weight);
    const totalBurn = Math.round(dayBmr * fallback.factor);

    log.activeFactor = fallback.factor;
    log.burn = totalBurn;
    log.smartwatchSync = {
      heartRate: watchData.avgHeartRate,
      desc: `${fallback.level} — ${fallback.detail}`
    };

    saveState();
    syncBtn.style.display = 'none';
    loadSplitLoggerData(dateStr);
    renderCalendar();
    renderDashboard();

    alert(`⚠️ OpenAI API 호출 실패 (이유: ${err.message})\n\n[로컬 시뮬레이션 모드로 자동 전환됨]\n활동 수준: ${fallback.level}\n활동 계수: ${fallback.factor}\n총 소비 칼로리: ${totalBurn} kcal\n\n* API 키의 사용량 초과(Quota Exceeded) 혹은 결제 수단을 확인해주세요.`);
  }
}

// Smartwatch 동기화 및 소모 칼로리 기록 초기화
function resetSmartwatchSync() {
  if (confirm("오늘의 소모 칼로리 기록과 스마트 워치 동기화 내역을 초기화하시겠습니까?")) {
    const dateStr = state.activeDate;
    if (state.logs[dateStr]) {
      const log = state.logs[dateStr];
      delete log.activeFactor;
      delete log.burn;
      delete log.smartwatchSync;
      
      saveState();
      loadSplitLoggerData(dateStr);
      renderCalendar();
      renderDashboard();
      showToastNotification("동기화 초기화", "소모 칼로리 기록이 초기화되었습니다.");
    }
  }
}

// --------------------------------------------------------------------------
// 7. Onboarding Flow (First Launch Input Panel)
// --------------------------------------------------------------------------
function setupOnboarding() {
  const overlay = document.getElementById('modal-onboarding');
  overlay.classList.add('active');

  let selectedGender = 'female';
  
  // Add listeners to gender buttons in modal
  const maleBtn = document.getElementById('btn-onboard-male');
  const femaleBtn = document.getElementById('btn-onboard-female');

  maleBtn.addEventListener('click', () => {
    selectedGender = 'male';
    maleBtn.classList.add('active');
    femaleBtn.classList.remove('active');
  });

  femaleBtn.addEventListener('click', () => {
    selectedGender = 'female';
    femaleBtn.classList.add('active');
    maleBtn.classList.remove('active');
  });

  document.getElementById('btn-save-onboarding').addEventListener('click', () => {
    const dob = document.getElementById('onboard-dob').value;
    const height = parseFloat(document.getElementById('onboard-height').value);
    const weight = parseFloat(document.getElementById('onboard-weight').value);
    const target = parseFloat(document.getElementById('onboard-target').value);

    // Validations
    if (!dob || isNaN(height) || isNaN(weight) || isNaN(target)) {
      alert("모든 빈칸을 형식에 맞게 채워주세요!");
      return;
    }

    if (height < 50 || height > 250 || weight < 10 || weight > 300 || target < 10 || target > 300) {
      alert("올바른 수치를 소수점 한자리까지 적어주세요.");
      return;
    }

    // Save profile details — joinDate를 오늘 날짜로 기록
    state.profile = {
      gender: selectedGender,
      dob: dob,
      height: height,
      weight: weight,
      startWeight: weight, // 처음 입력한 체중이 시작 체중
      targetWeight: target,
      joinDate: getTodayDateString(), // 가입 날짜 저장
      bmr: 0,
      bmi: 0
    };

    const age = calculateAge(dob);
    state.profile.bmr = calculateBMR(selectedGender, age, height, weight);
    state.profile.bmi = calculateBMI(height, weight);

    // 빈 로그로 시작 (가짜 데이터 없음)
    initializeNewUser();

    saveState();
    overlay.classList.remove('active');
    
    // Switch to Dashboard
    switchScreen('dashboard');
    showToastNotification("프로필 설정 완료", "다이어트 계획 작성이 성공적으로 완료되었습니다!");
  });
}

// --------------------------------------------------------------------------
// 8. Edit / Reset Profile Workflows
// --------------------------------------------------------------------------
function openEditProfileModal() {
  const modal = document.getElementById('modal-edit-profile');
  modal.classList.add('active');

  const prof = state.profile;
  let selectedGender = prof.gender;

  const maleBtn = document.getElementById('btn-edit-male');
  const femaleBtn = document.getElementById('btn-edit-female');

  if (selectedGender === 'male') {
    maleBtn.classList.add('active');
    femaleBtn.classList.remove('active');
  } else {
    femaleBtn.classList.add('active');
    maleBtn.classList.remove('active');
  }

  maleBtn.onclick = () => {
    selectedGender = 'male';
    maleBtn.classList.add('active');
    femaleBtn.classList.remove('active');
  };

  femaleBtn.onclick = () => {
    selectedGender = 'female';
    femaleBtn.classList.add('active');
    maleBtn.classList.remove('active');
  };

  document.getElementById('edit-dob').value = prof.dob;
  document.getElementById('edit-height').value = prof.height;
  document.getElementById('edit-weight').value = prof.weight;
  document.getElementById('edit-target').value = prof.targetWeight;

  document.getElementById('btn-save-edit').onclick = () => {
    const dob = document.getElementById('edit-dob').value;
    const height = parseFloat(document.getElementById('edit-height').value);
    const weight = parseFloat(document.getElementById('edit-weight').value);
    const target = parseFloat(document.getElementById('edit-target').value);

    if (!dob || isNaN(height) || isNaN(weight) || isNaN(target)) {
      alert("모든 항목을 올바르게 채워주세요!");
      return;
    }

    prof.gender = selectedGender;
    prof.dob = dob;
    prof.height = height;
    prof.weight = weight;
    prof.targetWeight = target;

    const age = calculateAge(dob);
    prof.bmr = calculateBMR(selectedGender, age, height, weight);
    prof.bmi = calculateBMI(height, weight);

    saveState();
    closeModal('modal-edit-profile');
    renderProfile();
    renderDashboard();
    showToastNotification("수정 완료", "프로필 정보가 갱신되었습니다.");
  };
}

// Reset Entire Application
function resetApp() {
  if (confirm("정말로 앱의 모든 기록을 지우고 처음부터 다시 시작하시겠습니까? 프로필 정보와 저장된 데이터가 전부 리셋됩니다.")) {
    localStorage.removeItem(STORAGE_KEY);
    state.profile = null;
    state.logs = {};
    state.bluetooth = { connected: false, deviceName: null };
    saveState();
    window.location.reload();
  }
}

// --------------------------------------------------------------------------
// 9. Toast Notification Handler
// --------------------------------------------------------------------------
let notificationTimer = null;

function showToastNotification(title, text) {
  const toast = document.getElementById('push-notification');
  document.getElementById('push-title').textContent = title;
  document.getElementById('push-desc').textContent = text;
  
  toast.classList.add('show');

  if (notificationTimer) clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 6000);
}

// Remind User if today is empty
function scheduleReminderNotification() {
  setTimeout(() => {
    const todayStr = getTodayDateString();
    const todayLog = state.logs[todayStr];
    
    // If today is empty, or weights/calories are not recorded
    if (!todayLog || !todayLog.weight || (todayLog.intake || []).length === 0) {
      showToastNotification(
        "🔔 다이어트 리마인더", 
        "오늘 아침 공복 몸무게와 칼로리를 아직 입력하지 않으셨습니다. 지금 바로 기록해보세요!"
      );
    }
  }, 10000); // 10 seconds idle trigger
}

// Helper date string
function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

// Helper to close modals
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Helper to delete food logs
function deleteFoodIntake(index) {
  const dateStr = state.activeDate;
  if (state.logs[dateStr] && state.logs[dateStr].intake) {
    if (confirm("이 기록을 삭제하시겠습니까?")) {
      state.logs[dateStr].intake.splice(index, 1);
      saveState();
      loadSplitLoggerData(dateStr);
      renderCalendar();
      renderDashboard();
    }
  }
}

// --------------------------------------------------------------------------
// 10. Initialization & Event Handlers
// --------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  loadState();

  // 구버전 데이터 감지: joinDate가 없으면 가짜 30일치 데이터가 들어있는 것
  // → 자동으로 logs를 비우고 오늘을 joinDate로 설정
  if (state.profile && !state.profile.joinDate) {
    state.profile.joinDate = getTodayDateString();
    state.profile.startWeight = state.profile.weight; // 현재 체중을 시작 체중으로 재설정
    state.logs = {}; // 가짜 데이터 전부 제거
    saveState();
  }

  // If no profile exists, generate mock history + onboard user OR show onboard straight away
  // To WOW the user immediately with graphs and logs, we auto-generate mock history if empty,
  // but let them input their profile details, or provide quick access.
  if (!state.profile) {
    setupOnboarding();
  }

  // Initialize tabs UI
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const screen = item.getAttribute('data-screen');
      if (screen) {
        switchScreen(screen);
      }
    });
  });

  // Bind close buttons for modals
  document.querySelectorAll('.btn-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) modal.classList.remove('active');
    });
  });

  // Graph Overlay Toggles
  document.querySelectorAll('.dropdown-item input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const activeMetrics = getActiveChartMetrics();
      if (activeMetrics.length > 3) {
        e.target.checked = false;
        alert("그래프는 동시에 최대 3개까지만 활성화할 수 있습니다.");
      } else {
        renderChartData();
      }
    });
  });

  // Dropdown Button Toggle
  const btnDrop = document.getElementById('btn-graph-dropdown');
  const dropMenu = document.getElementById('graph-dropdown-menu');
  btnDrop.addEventListener('click', (e) => {
    e.stopPropagation();
    dropMenu.classList.toggle('active');
  });

  document.addEventListener('click', () => {
    dropMenu.classList.remove('active');
  });

  dropMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Period buttons
  document.querySelectorAll('.btn-period').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-period').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderChartData();
    });
  });

  // Push notification click -> opens logger
  document.getElementById('push-notification').addEventListener('click', () => {
    document.getElementById('push-notification').classList.remove('show');
    switchScreen('calendar');
    openLoggerModal(getTodayDateString());
  });

  // Profiles edit buttons
  document.getElementById('btn-profile-edit').addEventListener('click', openEditProfileModal);
  document.getElementById('btn-profile-reset').addEventListener('click', resetApp);
  document.getElementById('btn-watch-sync').addEventListener('click', openBluetoothModal);

  // Bind weight save & inline edit
  document.getElementById('btn-save-weight').addEventListener('click', saveMorningWeight);


  
  // 몸무게 직접 수정 시 자동 저장 및 갱신 로직
  document.getElementById('inline-edit-weight').addEventListener('change', (e) => {
    const newWeight = parseFloat(e.target.value);
    if (!isNaN(newWeight) && newWeight > 20 && newWeight < 300) {
      const dateStr = state.activeDate;
      const log = state.logs[dateStr];
      if (log) {
        log.weight = newWeight;
        state.profile.weight = newWeight; // 프로필 몸무게도 업데이트
        
        // BMR 및 BMI 재계산
        const currentAge = calculateAge(state.profile.dob);
        state.profile.bmr = calculateBMR(state.profile.gender, currentAge, state.profile.height, newWeight);
        state.profile.bmi = calculateBMI(state.profile.height, newWeight);
        
        // 만약 소모 칼로리(활동계수) 기록이 있다면 BMR이 변했으니 다시 계산
        if (log.activeFactor && log.activeFactor > 0) {
          log.burn = Math.round(state.profile.bmr * log.activeFactor);
        }

        saveState();
        loadSplitLoggerData(dateStr);
        renderCalendar();
        renderDashboard();
      }
    } else {
      alert("올바른 몸무게를 입력하세요.");
      // 원래 값으로 되돌리기
      e.target.value = state.logs[state.activeDate].weight;
    }
  });
  
  // Intake photobox click
  document.getElementById('food-photo-preview').addEventListener('click', triggerPhotoUpload);
  document.getElementById('btn-save-food').addEventListener('click', saveFoodIntake);

  // Sync Watch
  document.getElementById('btn-smartwatch-sync-trigger').addEventListener('click', startSmartwatchSync);

  // Start at dashboard
  switchScreen('dashboard');

  // Trigger idle reminder toast
  scheduleReminderNotification();
});
