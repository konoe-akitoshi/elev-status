/**
 * Elevator Monitoring Script
 * ver.1.0 / 2025-05-22 / Maintainer: A.Saeki
 */

// --- 定数 ---
/**
 * APIエンドポイントURLをここに入力してください
 * 例: 'https://example.com/api/endpoint'
 */
const URL      = 'ここにAPIエンドポイントURLを入力してください';
const INTERVAL = 1000;
const TIMEOUT  = 3000;
const FLOORS   = [1,2,3,4,5,6,7,8];
const FLOOR_H  = 40;
const FLOOR_Y0 = 20;

// --- モックデータ（テスト用） ---
const MOCK_DATA = {
  floor: 1,
  door_state: 'closed',
  direction: 'stop',
  ev_cage_state: 'safe',
  ev_ope_state: 'operating',
  cage_sw_state: {
    '1': 'OFF',
    '2': 'OFF',
    '3': 'OFF',
    '4': 'OFF',
    '5': 'OFF',
    '6': 'OFF',
    '7': 'OFF',
    '8': 'OFF'
  },
  READ: {
    'GPIO1': 'OFF',
    'GPIO2': 'ON',
    'GPIO3': 'OFF'
  },
  WRITE: {
    'GPIO4': 'ON',
    'GPIO5': 'OFF',
    'GPIO6': 'ON'
  },
  api_gw_mode_state: 'false',
  vip_mode_state: 'false',
  emergency_mode_state: 'false',
  TEMPERATURE: {
    'モーター': 25.5,
    '制御盤': 28.2,
    '機械室': 24.8
  }
};

// --- 状態管理 ---
let prevState = {
  floor: 1,
  doorState: 'closed',
  direction: 'stop'
};

// --- テスト用アニメーション ---
// テストモード切り替え: URLに?testを付けるとテストモードになります
// 例: status/index.html?test
// 通常のURLではテストモードは実行されません
let testMode = new URLSearchParams(window.location.search).has('test'); // URLに?testがある場合のみテストモード
let testState = 0;

// テストモードの状態をコンソールに表示
console.log('🔧 テストモード: ' + (testMode ? 'ON' : 'OFF') + ' (URLパラメータ?testで切り替え可能)');
const testStates = [
  { floor: 1, door_state: 'closed', direction: 'stop' },
  { floor: 1, door_state: 'opening', direction: 'stop' },
  { floor: 1, door_state: 'opened', direction: 'stop' },
  { floor: 1, door_state: 'closing', direction: 'stop' },
  { floor: 1, door_state: 'closed', direction: 'up' },
  { floor: 2, door_state: 'closed', direction: 'up' },
  { floor: 3, door_state: 'closed', direction: 'up' },
  { floor: 4, door_state: 'closed', direction: 'stop' },
  { floor: 4, door_state: 'opening', direction: 'stop' },
  { floor: 4, door_state: 'opened', direction: 'stop' },
  { floor: 4, door_state: 'closing', direction: 'stop' },
  { floor: 4, door_state: 'closed', direction: 'down' },
  { floor: 3, door_state: 'closed', direction: 'down' },
  { floor: 2, door_state: 'closed', direction: 'down' },
  { floor: 1, door_state: 'closed', direction: 'stop' }
];

// --- ユーティリティ ---
function formatTime(d = new Date()) {
  return d.getHours().toString().padStart(2,'0') + ':' +
         d.getMinutes().toString().padStart(2,'0') + ':' +
         d.getSeconds().toString().padStart(2,'0');
}

async function fetchJSON(url) {
  const ctl = new AbortController();
  const id  = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(id);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

function setApiStatus(ok) {
  const lamp = document.getElementById('api-status-lamp');
  const txt  = document.getElementById('api-status-text');
  lamp.style.background = ok ? 'var(--success)' : 'var(--critical)';
  txt.textContent = ok ? 'API状態: オンライン' : 'API状態: オフライン';
}

// --- エレベーター更新 ---
function updateElevatorSVG(d) {
  // 安全状態の更新
  const diagramCard = document.querySelector('.diagram-card');
  diagramCard.classList.remove('safe', 'unsafe');
  diagramCard.classList.add(d.ev_cage_state === 'safe' ? 'safe' : 'unsafe');
  
  // カゴの位置更新
  const elevatorCar = document.getElementById('elevator-car');
  const idx = FLOORS.indexOf(Number(d.floor));
  // 8行グリッドの下端基準で配置
  if (idx !== -1) {
    // 1F: 0%, 2F: 12.5%, ..., 8F: 87.5%
    const rowHeight = 100 / 8;
    // 各区画の中央にカゴの中央が来るように補正
    const carHeightPercent = (32 / 360) * 100; // カゴの高さを360px基準で%
    const bottomPercent = idx * rowHeight + rowHeight / 2 - carHeightPercent / 2;
    elevatorCar.style.bottom = `${bottomPercent}%`;
  }
  
  // ドア状態の更新
  const leftDoor = document.getElementById('left-door');
  const rightDoor = document.getElementById('right-door');
  
  // 前の状態と現在の状態が異なる場合のみクラスを更新
  if (prevState.doorState !== d.door_state || prevState.floor !== d.floor) {
    // 一旦すべてのクラスを削除
    leftDoor.classList.remove('opening', 'opened', 'closing', 'closed');
    rightDoor.classList.remove('opening', 'opened', 'closing', 'closed');
    
    // 新しい状態のクラスを追加
    leftDoor.classList.add(d.door_state);
    rightDoor.classList.add(d.door_state);
    
    // 運転状態に応じてドアの色を変更
    const baseColor = d.ev_ope_state === 'operating' ? 'var(--accent)' : '#888';
    leftDoor.style.backgroundColor = baseColor;
    rightDoor.style.backgroundColor = baseColor;
    
    // 状態を記録
    prevState.doorState = d.door_state;
    prevState.floor = d.floor;
  }
  
  // シャフト両側ウィンカーの更新（両側同時に流す）
  const shaftWinkerLeft = document.querySelector('.shaft-winker-left');
  const shaftWinkerRight = document.querySelector('.shaft-winker-right');
  shaftWinkerLeft.classList.remove('winker-up', 'winker-down', 'winker-stop');
  shaftWinkerRight.classList.remove('winker-up', 'winker-down', 'winker-stop');
  shaftWinkerLeft.style.opacity = "0";
  shaftWinkerRight.style.opacity = "0";
  if (d.direction === 'up') {
    shaftWinkerLeft.classList.add('winker-up');
    shaftWinkerRight.classList.add('winker-up');
    shaftWinkerLeft.style.opacity = "1";
    shaftWinkerRight.style.opacity = "1";
  } else if (d.direction === 'down') {
    shaftWinkerLeft.classList.add('winker-down');
    shaftWinkerRight.classList.add('winker-down');
    shaftWinkerLeft.style.opacity = "1";
    shaftWinkerRight.style.opacity = "1";
  } else {
    shaftWinkerLeft.classList.add('winker-stop');
    shaftWinkerRight.classList.add('winker-stop');
  }

  // 既存の矢印表示は非表示に
  const dirUp = document.getElementById('direction-up');
  const dirDown = document.getElementById('direction-down');
  const dirStop = document.getElementById('direction-stop');
  dirUp.style.display = 'none';
  dirDown.style.display = 'none';
  dirStop.style.display = 'none';

  // d.directionに応じて矢印表示
  // ※必要に応じて"up"と"down"を反転
  if (d.direction === 'up') {
    dirUp.style.display = '';
  } else if (d.direction === 'down') {
    dirDown.style.display = '';
  } else {
    dirStop.style.display = '';
  }

  // 状態を記録
  prevState.direction = d.direction;
  
  // 呼び出しランプの更新
  document.querySelectorAll('.call-lamp').forEach(lamp => {
    const floor = lamp.getAttribute('data-floor');
    lamp.classList.toggle('active', d.cage_sw_state && d.cage_sw_state[floor] === 'ON');
  });
}

// --- 既存UI更新 ---
function updateStatus(d) {
  // GPIO
  ['read','write'].forEach(type => {
    const grid = document.getElementById(`${type}-gpio-grid`);
    grid.innerHTML = '';
    Object.entries(d[type.toUpperCase()]).forEach(([pin, val]) => {
      const item = document.createElement('div');
      item.className = 'gpio-item';
      const lamp = document.createElement('div');
      lamp.className = 'gpio-lamp ' + (val === 'ON' ? 'off' : 'on');
      const label = document.createElement('span');
      label.className = 'gpio-pin';
      label.textContent = pin;
      item.append(lamp, label);
      grid.append(item);
    });
  });

  // モード
  ['api-gw','vip','emergency'].forEach(id => {
    const el = document.getElementById(`${id}-mode-indicator`);
    el.classList.toggle('on', d[`${id}_mode_state`] === 'true');
  });

  // 温度
  const tg = document.getElementById('temperature-grid');
  tg.innerHTML = '';
  Object.entries(d.TEMPERATURE).forEach(([k,v]) => {
    const div = document.createElement('div');
    div.className = 'temperature-item';
    div.innerHTML = `<strong>${k}</strong><br>${v.toFixed(1)}°C`;
    tg.append(div);
  });
}

// --- メイン更新 ---
async function refresh() {
  try {
    let d;
    if (testMode) {
      // テストモードの場合はモックデータを使用
      d = {...MOCK_DATA};
      
      // テスト用アニメーション
      const currentTestState = testStates[testState];
      d.floor = currentTestState.floor;
      d.door_state = currentTestState.door_state;
      d.direction = currentTestState.direction;
      
      // 呼び出しボタンのテスト
      if (d.floor === 4) {
        d.cage_sw_state['4'] = 'ON';
      } else {
        d.cage_sw_state['4'] = 'OFF';
      }
      
      // 次の状態へ
      testState = (testState + 1) % testStates.length;
      
      setApiStatus(true);
      
      // テストモード表示
      document.title = '【テストモード】建物エレベーター モニタリング';
      
      // テストモードインジケータの表示
      const testIndicator = document.getElementById('test-mode-indicator');
      if (!testIndicator) {
        const container = document.querySelector('.container');
        const h1 = document.querySelector('h1');
        const indicator = document.createElement('div');
        indicator.id = 'test-mode-indicator';
        indicator.style.backgroundColor = 'rgba(255, 159, 10, 0.2)';
        indicator.style.color = '#FF9F0A';
        indicator.style.padding = '4px 8px';
        indicator.style.borderRadius = '4px';
        indicator.style.fontSize = '0.8rem';
        indicator.style.fontWeight = 'bold';
        indicator.style.textAlign = 'center';
        indicator.style.margin = '0 auto 8px';
        indicator.textContent = '🔧 テストモード実行中 (URLパラメータ?testで切り替え可能)';
        container.insertBefore(indicator, h1.nextSibling);
      }
    } else {
      // テストモードでない場合もモックデータを使用（ローカル環境でのAPIエラー回避）
      try {
        // 実際のAPIを使用
        d = await fetchJSON(URL);
        setApiStatus(true);
      } catch (error) {
        // APIエラーの場合はモックデータを使用
        console.warn('API接続エラー: モックデータを使用します');
        d = {...MOCK_DATA};
        setApiStatus(false);
      }
      
      document.title = '建物エレベーター モニタリング';
      
      // テストモードインジケータの削除
      const testIndicator = document.getElementById('test-mode-indicator');
      if (testIndicator) {
        testIndicator.remove();
      }
    }
    
    updateStatus(d);
    updateElevatorSVG(d);
    document.getElementById('last-updated').textContent = '最終更新: ' + formatTime();
  } catch (e) {
    console.error(e);
    setApiStatus(false);
  }
}

// --- 初期化 ---
window.addEventListener('DOMContentLoaded', () => {
  refresh();
  setInterval(refresh, testMode ? 2000 : INTERVAL); // テストモードでは遅めに
});