// グローバル変数
let busData = null;
let holidayData = null;
let busStopsConfig = null;
let currentBusStop = null;
let currentDayType = 'weekday'; // 'weekday', 'saturday', 'holiday'
const USE_SAMPLE_DATA = true; // 開発時はサンプルデータを使用
const USE_INLINE_DATA = true; // ファイル読み込みエラー時はインラインデータを使用

// インライン祝日データ
const INLINE_HOLIDAY_DATA = {
  "2025-04-29": "昭和の日",
  "2025-05-03": "憲法記念日",
  "2025-05-04": "みどりの日",
  "2025-05-05": "こどもの日",
  "2025-05-06": "振替休日",
  "2025-07-21": "海の日",
  "2025-08-11": "山の日",
  "2025-09-15": "敬老の日",
  "2025-09-23": "秋分の日",
  "2025-10-13": "スポーツの日"
};

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', () => {
    // バス停設定の初期化
    initializeBusStops();
});

// バス停設定の初期化
async function initializeBusStops() {
    try {
        // バス停設定を読み込み
        await loadBusStopsConfig();
        
        // URLパラメータまたはlocalStorageから選択されたバス停を取得
        const urlParams = new URLSearchParams(window.location.search);
        const urlBusStop = urlParams.get('stop');
        const savedBusStop = localStorage.getItem('selectedBusStop');
        
        // デフォルトバス停を決定
        let initialBusStop = urlBusStop || savedBusStop;
        
        // 指定されたバス停が存在しない場合は設定のデフォルトを使用
        if (!initialBusStop || !busStopsConfig.bus_stops[initialBusStop] || !busStopsConfig.bus_stops[initialBusStop].enabled) {
            initialBusStop = busStopsConfig.default_stop || Object.keys(busStopsConfig.bus_stops).find(id => busStopsConfig.bus_stops[id].enabled);
        }
        
        if (initialBusStop) {
            await selectBusStop(initialBusStop);
        }
        
        // 時計の開始
        updateClock();
        setInterval(updateClock, 1000);
        
        // バス時刻の定期更新（30秒ごと）
        setInterval(updateBusTimes, 30000);
        
    } catch (error) {
        console.error('バス停設定の初期化に失敗しました:', error);
        // フォールバック: 美住町のデータで初期化
        fallbackToMisumi();
    }
}

// バス停設定の読み込み
async function loadBusStopsConfig() {
    try {
        const response = await fetch('../config/bus_stops.json');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        busStopsConfig = await response.json();
        setupBusStopSelector();
    } catch (error) {
        console.error('バス停設定の読み込みに失敗しました:', error);
        // フォールバック設定
        busStopsConfig = {
            bus_stops: {
                misumi: {
                    id: 'misumi',
                    name: '美住町',
                    display_name: '美住町バス停',
                    enabled: true,
                    default: true
                }
            },
            default_stop: 'misumi',
            data_files: {
                misumi: 'sample_misumi_bus_timetable.json'
            }
        };
        setupBusStopSelector();
    }
}

// バス停選択UIのセットアップ
function setupBusStopSelector() {
    const select = document.getElementById('bus-stop-select');
    select.innerHTML = '';
    
    // 有効なバス停のみを表示
    Object.values(busStopsConfig.bus_stops)
        .filter(stop => stop.enabled)
        .forEach(stop => {
            const option = document.createElement('option');
            option.value = stop.id;
            option.textContent = stop.display_name || stop.name;
            select.appendChild(option);
        });
    
    // 選択変更時のイベントリスナー
    select.addEventListener('change', (e) => {
        const selectedStop = e.target.value;
        if (selectedStop) {
            selectBusStop(selectedStop);
            
            // localStorageに保存
            localStorage.setItem('selectedBusStop', selectedStop);
            
            // URLパラメータを更新（オプション）
            const url = new URL(window.location);
            url.searchParams.set('stop', selectedStop);
            window.history.replaceState({}, '', url);
        }
    });
}

// バス停の選択
async function selectBusStop(busStopId) {
    try {
        const busStop = busStopsConfig.bus_stops[busStopId];
        if (!busStop || !busStop.enabled) {
            throw new Error(`バス停 "${busStopId}" が見つからないか無効です`);
        }
        
        currentBusStop = busStop;
        
        // UI要素の更新
        updateUIForBusStop(busStop);
        
        // バス停選択UIの更新
        document.getElementById('bus-stop-select').value = busStopId;
        
        // データの読み込み
        await Promise.all([
            fetchBusData(busStopId),
            fetchHolidayData()
        ]);
        
        console.log(`バス停を "${busStop.display_name}" に切り替えました`);
        
    } catch (error) {
        console.error('バス停の選択に失敗しました:', error);
        if (busStopId !== 'misumi') {
            // フォールバック: 美住町に切り替え
            fallbackToMisumi();
        }
    }
}

// UI要素をバス停に合わせて更新
function updateUIForBusStop(busStop) {
    // タイトルとヘッダーの更新
    document.getElementById('page-title').textContent = `${busStop.display_name} - バス時刻表`;
    document.getElementById('page-heading').textContent = busStop.display_name;
    
    // バス停情報の表示
    const info = document.getElementById('current-bus-stop-info');
    if (info) {
        info.textContent = busStop.description || `${busStop.name}のバス時刻表を表示中`;
    }
}

// 美住町にフォールバック
function fallbackToMisumi() {
    console.log('美住町のデータにフォールバック中...');
    
    // 美住町の基本設定
    currentBusStop = {
        id: 'misumi',
        name: '美住町',
        display_name: '美住町バス停',
        description: '美住町バス停の茅ヶ崎駅・辻堂駅行きバス時刻表'
    };
    
    updateUIForBusStop(currentBusStop);
    
    // インラインデータを使用
    busData = getMisumiInlineData();
    holidayData = INLINE_HOLIDAY_DATA;
    
    document.getElementById('last-updated').textContent = new Date().toLocaleString('ja-JP') + ' (内蔵データ)';
    
    // 時計とバス時刻の更新開始
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(updateBusTimes, 30000);
    updateBusTimes();
}

// 美住町のインラインデータ
function getMisumiInlineData() {
    return {
        "chigasaki": {
            "weekday": [
                {"hour": "6", "minute": "21"},
                {"hour": "6", "minute": "36"},
                {"hour": "6", "minute": "55"},
                {"hour": "7", "minute": "19"},
                {"hour": "7", "minute": "48"},
                {"hour": "8", "minute": "18"},
                {"hour": "8", "minute": "58"},
                {"hour": "9", "minute": "26"},
                {"hour": "9", "minute": "56"},
                {"hour": "10", "minute": "26"},
                {"hour": "10", "minute": "56"},
                {"hour": "11", "minute": "26"},
                {"hour": "11", "minute": "56"},
                {"hour": "12", "minute": "26"},
                {"hour": "12", "minute": "56"},
                {"hour": "13", "minute": "26"},
                {"hour": "13", "minute": "56"},
                {"hour": "14", "minute": "26"},
                {"hour": "14", "minute": "56"},
                {"hour": "15", "minute": "26"},
                {"hour": "15", "minute": "56"},
                {"hour": "16", "minute": "28"},
                {"hour": "16", "minute": "56"},
                {"hour": "17", "minute": "28"},
                {"hour": "17", "minute": "56"},
                {"hour": "18", "minute": "16"},
                {"hour": "18", "minute": "36"},
                {"hour": "18", "minute": "56"},
                {"hour": "19", "minute": "16"},
                {"hour": "19", "minute": "36"},
                {"hour": "20", "minute": "26"},
                {"hour": "20", "minute": "56"},
                {"hour": "21", "minute": "26"},
                {"hour": "21", "minute": "56"},
                {"hour": "22", "minute": "31"}
            ],
            "saturday": [
                {"hour": "6", "minute": "55"},
                {"hour": "7", "minute": "25"},
                {"hour": "7", "minute": "55"},
                {"hour": "8", "minute": "25"},
                {"hour": "8", "minute": "55"},
                {"hour": "9", "minute": "25"},
                {"hour": "9", "minute": "55"},
                {"hour": "10", "minute": "25"},
                {"hour": "10", "minute": "55"},
                {"hour": "11", "minute": "25"},
                {"hour": "11", "minute": "55"},
                {"hour": "12", "minute": "25"},
                {"hour": "12", "minute": "55"},
                {"hour": "13", "minute": "25"},
                {"hour": "13", "minute": "55"},
                {"hour": "14", "minute": "25"},
                {"hour": "14", "minute": "55"},
                {"hour": "15", "minute": "25"},
                {"hour": "15", "minute": "55"},
                {"hour": "16", "minute": "25"},
                {"hour": "16", "minute": "55"},
                {"hour": "17", "minute": "25"},
                {"hour": "17", "minute": "55"},
                {"hour": "18", "minute": "25"},
                {"hour": "18", "minute": "55"},
                {"hour": "19", "minute": "25"},
                {"hour": "19", "minute": "55"},
                {"hour": "20", "minute": "25"},
                {"hour": "20", "minute": "55"},
                {"hour": "21", "minute": "25"},
                {"hour": "21", "minute": "55"}
            ],
            "holiday": [
                {"hour": "6", "minute": "55"},
                {"hour": "7", "minute": "25"},
                {"hour": "7", "minute": "55"},
                {"hour": "8", "minute": "25"},
                {"hour": "8", "minute": "55"},
                {"hour": "9", "minute": "25"},
                {"hour": "9", "minute": "55"},
                {"hour": "10", "minute": "25"},
                {"hour": "10", "minute": "55"},
                {"hour": "11", "minute": "25"},
                {"hour": "11", "minute": "55"},
                {"hour": "12", "minute": "25"},
                {"hour": "12", "minute": "55"},
                {"hour": "13", "minute": "25"},
                {"hour": "13", "minute": "55"},
                {"hour": "14", "minute": "25"},
                {"hour": "14", "minute": "55"},
                {"hour": "15", "minute": "25"},
                {"hour": "15", "minute": "55"},
                {"hour": "16", "minute": "25"},
                {"hour": "16", "minute": "55"},
                {"hour": "17", "minute": "25"},
                {"hour": "17", "minute": "55"},
                {"hour": "18", "minute": "25"},
                {"hour": "18", "minute": "55"},
                {"hour": "19", "minute": "25"},
                {"hour": "19", "minute": "55"},
                {"hour": "20", "minute": "25"},
                {"hour": "20", "minute": "55"},
                {"hour": "21", "minute": "25"},
                {"hour": "21", "minute": "55"}
            ]
        },
        "tsujido": {
            "weekday": [
                {"hour": "5", "minute": "57"},
                {"hour": "6", "minute": "16"},
                {"hour": "6", "minute": "34"},
                {"hour": "6", "minute": "46"},
                {"hour": "6", "minute": "58"},
                {"hour": "7", "minute": "10"},
                {"hour": "7", "minute": "25"},
                {"hour": "7", "minute": "40"},
                {"hour": "7", "minute": "55"},
                {"hour": "8", "minute": "17"},
                {"hour": "8", "minute": "37"},
                {"hour": "9", "minute": "05"},
                {"hour": "9", "minute": "35"},
                {"hour": "10", "minute": "05"},
                {"hour": "10", "minute": "35"},
                {"hour": "11", "minute": "05"},
                {"hour": "11", "minute": "35"},
                {"hour": "12", "minute": "05"},
                {"hour": "12", "minute": "35"},
                {"hour": "13", "minute": "05"},
                {"hour": "13", "minute": "35"},
                {"hour": "14", "minute": "05"},
                {"hour": "14", "minute": "35"},
                {"hour": "15", "minute": "05"},
                {"hour": "15", "minute": "35"},
                {"hour": "16", "minute": "07"},
                {"hour": "16", "minute": "35"},
                {"hour": "17", "minute": "07"},
                {"hour": "17", "minute": "35"},
                {"hour": "17", "minute": "55"},
                {"hour": "18", "minute": "15"},
                {"hour": "18", "minute": "35"},
                {"hour": "18", "minute": "55"},
                {"hour": "19", "minute": "15"},
                {"hour": "19", "minute": "35"},
                {"hour": "20", "minute": "05"},
                {"hour": "20", "minute": "35"},
                {"hour": "21", "minute": "05"},
                {"hour": "21", "minute": "35"},
                {"hour": "22", "minute": "10"}
            ],
            "saturday": [
                {"hour": "6", "minute": "25"},
                {"hour": "7", "minute": "05"},
                {"hour": "7", "minute": "35"},
                {"hour": "8", "minute": "05"},
                {"hour": "8", "minute": "35"},
                {"hour": "9", "minute": "05"},
                {"hour": "9", "minute": "35"},
                {"hour": "10", "minute": "05"},
                {"hour": "10", "minute": "35"},
                {"hour": "11", "minute": "05"},
                {"hour": "11", "minute": "35"},
                {"hour": "12", "minute": "05"},
                {"hour": "12", "minute": "35"},
                {"hour": "13", "minute": "05"},
                {"hour": "13", "minute": "35"},
                {"hour": "14", "minute": "05"},
                {"hour": "14", "minute": "35"},
                {"hour": "15", "minute": "05"},
                {"hour": "15", "minute": "35"},
                {"hour": "16", "minute": "05"},
                {"hour": "16", "minute": "35"},
                {"hour": "17", "minute": "05"},
                {"hour": "17", "minute": "35"},
                {"hour": "18", "minute": "05"},
                {"hour": "18", "minute": "35"},
                {"hour": "19", "minute": "05"},
                {"hour": "19", "minute": "35"},
                {"hour": "20", "minute": "05"},
                {"hour": "20", "minute": "50"},
                {"hour": "21", "minute": "50"}
            ],
            "holiday": [
                {"hour": "6", "minute": "25"},
                {"hour": "7", "minute": "05"},
                {"hour": "7", "minute": "35"},
                {"hour": "8", "minute": "05"},
                {"hour": "8", "minute": "35"},
                {"hour": "9", "minute": "05"},
                {"hour": "9", "minute": "35"},
                {"hour": "10", "minute": "05"},
                {"hour": "10", "minute": "35"},
                {"hour": "11", "minute": "05"},
                {"hour": "11", "minute": "35"},
                {"hour": "12", "minute": "05"},
                {"hour": "12", "minute": "35"},
                {"hour": "13", "minute": "05"},
                {"hour": "13", "minute": "35"},
                {"hour": "14", "minute": "05"},
                {"hour": "14", "minute": "35"},
                {"hour": "15", "minute": "05"},
                {"hour": "15", "minute": "35"},
                {"hour": "16", "minute": "05"},
                {"hour": "16", "minute": "35"},
                {"hour": "17", "minute": "05"},
                {"hour": "17", "minute": "35"},
                {"hour": "18", "minute": "05"},
                {"hour": "18", "minute": "35"},
                {"hour": "19", "minute": "05"},
                {"hour": "19", "minute": "35"},
                {"hour": "20", "minute": "05"},
                {"hour": "20", "minute": "50"},
                {"hour": "21", "minute": "50"}
            ]
        }
    };
}

// バスデータの取得
async function fetchBusData(busStopId) {
    try {
        // データファイル名を取得
        const filename = busStopsConfig.data_files[busStopId];
        if (!filename) {
            throw new Error(`バス停 "${busStopId}" のデータファイルが設定されていません`);
        }
        
        if (USE_INLINE_DATA && busStopId === 'misumi') {
            // 美住町のインラインデータを使用
            console.log('美住町のインラインデータを使用します');
            busData = getMisumiInlineData();
            
            document.getElementById('last-updated').textContent = new Date().toLocaleString('ja-JP') + ' (内蔵データ)';
            updateBusTimes();
            return;
        }
        
        // 開発時はサンプルデータを使用
        const dataUrl = USE_SAMPLE_DATA ? `data/${filename}` : `data/${filename.replace('sample_', '')}`;
        console.log(`ファイルからデータを読み込みます: ${dataUrl}`);
        const response = await fetch(dataUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        busData = await response.json();
        
        // 最終更新時間の表示
        document.getElementById('last-updated').textContent = new Date().toLocaleString('ja-JP');
        
        // バス時刻の表示更新
        updateBusTimes();
    } catch (error) {
        console.error('バスデータの取得に失敗しました:', error);
        
        if (USE_INLINE_DATA && busStopId === 'misumi') {
            // エラー時に美住町のインラインデータを使用
            console.log('ファイル読み込みエラーのため美住町のインラインデータを使用します');
            busData = getMisumiInlineData();
            document.getElementById('last-updated').textContent = new Date().toLocaleString('ja-JP') + ' (内蔵データ)';
            updateBusTimes();
            return;
        }
        
        document.querySelector('#chigasaki .next-time').textContent = '--:--';
        document.querySelector('#chigasaki .remaining').textContent = 'データ取得エラー';
        document.querySelector('#tsujido .next-time').textContent = '--:--';
        document.querySelector('#tsujido .remaining').textContent = 'データ取得エラー';
    }
}

// 祝日データの取得
async function fetchHolidayData() {
    try {
        if (USE_INLINE_DATA) {
            // インラインデータを使用
            console.log('インライン祝日データを使用します');
            holidayData = INLINE_HOLIDAY_DATA;
            return;
        }
        
        // 開発時はサンプルデータを使用
        const dataUrl = USE_SAMPLE_DATA ? 'data/sample_holidays.json' : 'data/holidays.json';
        console.log(`ファイルからデータを読み込みます: ${dataUrl}`);
        const response = await fetch(dataUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        holidayData = await response.json();
    } catch (error) {
        console.error('祝日データの取得に失敗しました:', error);
        
        if (USE_INLINE_DATA) {
            // エラー時にインラインデータを使用
            console.log('ファイル読み込みエラーのためインライン祝日データを使用します');
            holidayData = INLINE_HOLIDAY_DATA;
            return;
        }
        
        holidayData = {};
    }
}

// 現在時刻の更新
function updateClock() {
    const now = new Date();
    
    // 日付表示
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const dateString = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 (${days[now.getDay()]})`;
    const dateElement = document.getElementById('current-date');
    dateElement.textContent = dateString;
    
    // 曜日による日付表示の色分け
    const day = now.getDay();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD形式
    
    // 日付の色分け用のクラスをリセット
    dateElement.classList.remove('holiday', 'saturday', 'sunday');
    
    // 祝日、日曜、土曜の色分け
    if (holidayData && holidayData[dateStr]) {
        dateElement.classList.add('holiday');
    } else if (day === 0) {
        dateElement.classList.add('sunday');
    } else if (day === 6) {
        dateElement.classList.add('saturday');
    }
    
    // 時刻表示
    const timeString = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('current-time').textContent = timeString;
    
    // 曜日種別の判定と表示
    checkDayType(now);
}

// 曜日種別の判定
function checkDayType(date) {
    const day = date.getDay();
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD形式
    let newDayType;
    
    // 祝日判定
    if (holidayData && holidayData[dateStr]) {
        newDayType = 'holiday';
        document.getElementById('calendar-type').textContent = '休日ダイヤ';
        document.getElementById('calendar-type').title = holidayData[dateStr]; // 祝日名をツールチップに表示
    } 
    // 日曜判定
    else if (day === 0) {
        newDayType = 'holiday';
        document.getElementById('calendar-type').textContent = '休日ダイヤ';
        document.getElementById('calendar-type').title = '日曜日';
    } 
    // 土曜判定
    else if (day === 6) {
        newDayType = 'saturday';
        document.getElementById('calendar-type').textContent = '土曜ダイヤ';
        document.getElementById('calendar-type').title = '土曜日';
    } 
    // 平日判定
    else {
        newDayType = 'weekday';
        document.getElementById('calendar-type').textContent = '平日ダイヤ';
        document.getElementById('calendar-type').title = '平日';
    }
    
    // 曜日種別が変わった場合にバス時刻を更新
    if (currentDayType !== newDayType) {
        currentDayType = newDayType;
        updateBusTimes();
    }
}

// バス時刻の更新
function updateBusTimes() {
    if (!busData) return;
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentMinutes = currentHour * 60 + currentMinute;
    
    // 茅ヶ崎駅行きの次のバス
    updateNextBus('chigasaki', busData.chigasaki[currentDayType], currentMinutes);
    
    // 辻堂駅行きの次のバス
    updateNextBus('tsujido', busData.tsujido[currentDayType], currentMinutes);
}

// 次のバス時刻の計算と表示
function updateNextBus(stationId, timetable, currentMinutes) {
    if (!timetable || timetable.length === 0) {
        document.querySelector(`#${stationId} .next-time`).textContent = '--:--';
        document.querySelector(`#${stationId} .remaining`).textContent = 'データがありません';
        document.querySelector(`#${stationId} .following-buses`).innerHTML = '';
        return;
    }
    
    // 時刻表から「現在時刻より後」のバスを抽出
    const upcomingBuses = timetable.filter(bus => {
        const busMinutes = parseInt(bus.hour) * 60 + parseInt(bus.minute);
        return busMinutes > currentMinutes;
    });
    
    if (upcomingBuses.length === 0) {
        // 本日の残りのバスが無い場合
        document.querySelector(`#${stationId} .next-time`).textContent = '--:--';
        document.querySelector(`#${stationId} .remaining`).textContent = '本日のバスは終了しました';
        document.querySelector(`#${stationId} .following-buses`).innerHTML = '';
        return;
    }
    
    // 次のバス
    const nextBus = upcomingBuses[0];
    const nextBusTime = `${nextBus.hour}:${nextBus.minute.toString().padStart(2, '0')}`;
    const nextBusMinutes = parseInt(nextBus.hour) * 60 + parseInt(nextBus.minute);
    const minutesRemaining = nextBusMinutes - currentMinutes;
    
    document.querySelector(`#${stationId} .next-time`).textContent = nextBusTime;
    document.querySelector(`#${stationId} .remaining`).textContent = `あと${minutesRemaining}分`;
    
    // 次の次のバス（ある場合）
    if (upcomingBuses.length > 1) {
        const followingBus = upcomingBuses[1];
        const followingBusTime = `${followingBus.hour}:${followingBus.minute.toString().padStart(2, '0')}`;
        const followingBusMinutes = parseInt(followingBus.hour) * 60 + parseInt(followingBus.minute);
        const followingMinutesRemaining = followingBusMinutes - currentMinutes;
        
        document.querySelector(`#${stationId} .following-buses`).innerHTML = 
            `<p>次: ${followingBusTime} (あと${followingMinutesRemaining}分)</p>`;
    } else {
        document.querySelector(`#${stationId} .following-buses`).innerHTML = '';
    }
    
    // 残り時間が近い場合、強調表示
    const remainingElement = document.querySelector(`#${stationId} .remaining`);
    if (minutesRemaining <= 5) {
        remainingElement.classList.add('urgent');
    } else {
        remainingElement.classList.remove('urgent');
    }
}