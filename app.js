// 状態管理
let state = {
  periods: [],
  activePeriodId: null,
  currentView: 'top' // 'top' または 'details'
};

// ローカル時間ベースの日付フォーマット・パースヘルパー
function formatDateLocal(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateLocal(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split(/[-/]/);
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

// カテゴリ定義
const CATEGORIES = [
  { id: 1, name: "1. 作成前の準備段階" },
  { id: 2, name: "2. 指定表への記入作業" },
  { id: 3, name: "3. PCシステムへの入力作業" },
  { id: 4, name: "4. 提出～認証前" },
  { id: 5, name: "5. 認証後～仕上げと次の準備" }
];

// 初期設定のチェック項目テンプレート
const DEFAULT_TASKS_TEMPLATE = [
  { 
    categoryId: 1, 
    text: "小項目１",
    subtasks: [
      { text: "小タスク１" },
      { text: "小タスク２" }
    ]
  },
  { categoryId: 1, text: "小項目２", subtasks: [] },
  { 
    categoryId: 2, 
    text: "小項目１",
    subtasks: [
      { text: "小タスク１" },
      { text: "小タスク２" }
    ]
  },
  { categoryId: 2, text: "小項目２", subtasks: [] },
  { 
    categoryId: 3, 
    text: "小項目１",
    subtasks: [
      { text: "小タスク１" }
    ]
  },
  { categoryId: 3, text: "小項目２", subtasks: [] },
  { 
    categoryId: 4, 
    text: "小項目１",
    subtasks: [
      { text: "小タスク１" },
      { text: "小タスク２" }
    ]
  },
  { categoryId: 4, text: "小項目２", subtasks: [] },
  { 
    categoryId: 5, 
    text: "小項目１",
    subtasks: [
      { text: "小タスク１" }
    ]
  },
  { categoryId: 5, text: "小項目２", subtasks: [] }
];

// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  registerServiceWorker();
  render();
  setupEventListeners();

  // 開始日のデフォルト設定と終了日の自動計算（28日分）
  initDateInputs();
});

// 新規登録フォーム用の祝日一時保持状態
let formHolidays = [];

// 開始日・終了日などの初期設定と自動計算連動
function initDateInputs() {
  const startDateInput = document.getElementById('startDate');

  // 今日以降の直近の日曜日を初期値にする
  const today = new Date();
  const nextSunday = new Date(today);
  const day = today.getDay();
  const diff = day === 0 ? 0 : 7 - day; // 今日が日曜日なら今日、そうでなければ次の日曜日
  nextSunday.setDate(today.getDate() + diff);

  const nextSundayStr = formatDateLocal(nextSunday);
  startDateInput.value = nextSundayStr;

  // 初期計算と祝日の自動取得を実行
  updateFormCalculations(nextSundayStr);

  // 開始日が変更されたら、すべての自動計算項目を更新する
  startDateInput.addEventListener('change', (e) => {
    updateFormCalculations(e.target.value);
  });
}

// フォームの自動計算項目（終了日、保存/確定期限、経推・会議日、祝日）を一括更新
function updateFormCalculations(startDateVal) {
  if (!startDateVal) return;
  const start = parseDateLocal(startDateVal);
  if (!start) return;

  // 1. 終了日 (27日後 = 開始日含め28日間)
  const end = new Date(start);
  end.setDate(start.getDate() + 27);
  const endDateVal = formatDateLocal(end);
  document.getElementById('endDate').value = endDateVal;

  // 表示用テキストの更新 (曜日付き)
  const startDateText = document.getElementById('startDateText');
  if (startDateText) {
    startDateText.innerText = formatDateJapanese(startDateVal);
  }
  const endDateText = document.getElementById('endDateText');
  if (endDateText) {
    endDateText.innerText = formatDateJapanese(endDateVal);
  }

  // 2. 期間の曜日付きテキスト表示の更新
  const formattedStart = formatDateJapanese(startDateVal);
  const formattedEnd = formatDateJapanese(endDateVal);
  document.getElementById('periodDisplayTitle').innerText = `期間： ${formattedStart} 〜 ${formattedEnd}`;

  // 3. 保存入力期限 (36日前)
  const saveDate = new Date(start);
  saveDate.setDate(start.getDate() - 36);
  document.getElementById('saveDeadline').value = formatDateLocal(saveDate);

  // 4. 確定入力期限 (8日前)
  const confirmDate = new Date(start);
  confirmDate.setDate(start.getDate() - 8);
  document.getElementById('confirmDeadline').value = formatDateLocal(confirmDate);

  // 5. 広報 (日付選択) - 初期状態は空欄
  document.getElementById('prDate').value = "";
  const prDateDisplay = document.getElementById('prDateDisplay');
  if (prDateDisplay) prDateDisplay.value = "";
  const prDateDisplayText = document.getElementById('prDateDisplayText');
  if (prDateDisplayText) prDateDisplayText.innerText = "未設定";

  // 6. 祝日の自動取得
  formHolidays = getJapaneseHolidays(startDateVal, endDateVal);

  // 7. 会議日の週・曜日選択から日付を自動算出
  calculateMeetingDate();
}

// 指定年月の第N指定曜日の日付を特定するヘルパー
function getMonthlyNthWeekday(year, month, nth, weekday) {
  let count = 0;
  // year, month, 1日をローカル時間として作成
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    if (d.getDay() === weekday) {
      count++;
      if (count === nth) {
        return new Date(d);
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

// 経推・会議日のセレクトボックス値から日付を自動算出する
function calculateMeetingDate() {
  const startDateVal = document.getElementById('startDate').value;
  if (!startDateVal) return;

  const start = parseDateLocal(startDateVal);
  if (!start) return;
  const end = new Date(start);
  end.setDate(start.getDate() + 27);

  const meetingSelect = document.getElementById('meetingSelect');
  if (!meetingSelect) return;
  const selectVal = meetingSelect.value;
  const [nth, weekday] = selectVal.split('-').map(Number);

  // 1. 開始日の月の第N指定曜日
  let targetDate = getMonthlyNthWeekday(start.getFullYear(), start.getMonth(), nth, weekday);

  // 期間内に入っているか
  if (targetDate && targetDate >= start && targetDate <= end) {
    document.getElementById('meetingDate').value = formatDateLocal(targetDate);
  } else {
    // 2. 入っていない場合、終了日の月の第N指定曜日
    targetDate = getMonthlyNthWeekday(end.getFullYear(), end.getMonth(), nth, weekday);
    if (targetDate && targetDate >= start && targetDate <= end) {
      document.getElementById('meetingDate').value = formatDateLocal(targetDate);
    } else {
      // どちらも期間外なら空にする
      document.getElementById('meetingDate').value = "";
    }
  }

  syncMeetingAndPrEvents();
}

// カレンダー上で広報予定日を選択したときの処理
function selectPrDate(dateStr) {
  const prDateInput = document.getElementById('prDate');
  const prDateDisplay = document.getElementById('prDateDisplay');
  const prDateDisplayText = document.getElementById('prDateDisplayText');
  // すでに選択されている日付をもう一度クリックしたら解除するトグル仕様
  if (prDateInput.value === dateStr) {
    prDateInput.value = "";
    if (prDateDisplay) prDateDisplay.value = "";
    if (prDateDisplayText) prDateDisplayText.innerText = "未設定";
    showToast('広報予定日を解除しました。');
  } else {
    prDateInput.value = dateStr;
    if (prDateDisplay) prDateDisplay.value = dateStr;
    if (prDateDisplayText) prDateDisplayText.innerText = formatDateJapanese(dateStr);
    showToast(`広報予定日を ${formatDateJapanese(dateStr)} に設定しました！`);
  }
  syncMeetingAndPrEvents();
}

// 会議日・広報日のイベントリスト(formHolidays)への自動同期処理
function syncMeetingAndPrEvents() {
  const startDateVal = document.getElementById('startDate').value;
  if (!startDateVal) return;

  // 既存の自動追加イベント（【会議】および【広報】で始まるもの）を除去
  formHolidays = formHolidays.filter(h => !h.name.startsWith("【会議】") && !h.name.startsWith("【広報】"));

  // 新しい会議日の登録
  const meetingVal = document.getElementById('meetingDate').value;
  if (meetingVal) {
    formHolidays.push({
      date: meetingVal,
      name: "【会議】経推・会議日"
    });
  }

  // 新しい広報日の登録
  const prVal = document.getElementById('prDate').value;
  if (prVal) {
    formHolidays.push({
      date: prVal,
      name: "【広報】広報"
    });
  }

  // 日付順にソート
  formHolidays.sort((a, b) => parseDateLocal(a.date) - parseDateLocal(b.date));

  // リストとカレンダーの再描画
  renderFormHolidays();
  renderFormCalendar();
}

// 登録フォーム内の祝日一覧の描画
  function renderFormHolidays() {
    const container = document.getElementById('formHolidaysContainer');
    if (!container) return;
    container.innerHTML = '';

    if (formHolidays.length === 0) {
      container.innerHTML = '<span style="font-size:0.8rem; color:var(--text-secondary);">減区・イベントはありません</span>';
      return;
    }

    const startDateVal = document.getElementById('startDate').value;

    formHolidays.forEach((h, index) => {
      let badgeClass = 'holiday-badge';
      if (h.name.startsWith("【会議】")) {
        badgeClass += ' event-meeting-badge';
      } else if (h.name.startsWith("【広報】")) {
        badgeClass += ' event-pr-badge';
      } else {
        const isCustom = h.name === "振替休日" || h.name === "国民の休日" ? false : !["元日", "成人の日", "建国記念の日", "天皇誕生日", "春分の日", "昭和の日", "憲法記念日", "みどりの日", "こどもの日", "海の日", "山の日", "敬老の日", "秋分の日", "スポーツの日", "文化の日", "勤労感謝の日"].includes(h.name);
        if (isCustom) {
          badgeClass += ' custom-event';
        }
      }

      const badge = document.createElement('div');
      badge.className = badgeClass;

      const d = parseDateLocal(h.date);
      if (!d) return;
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      const hWeek = getWeekMarker(h.date, startDateVal);

      badge.innerHTML = `
      <span>${dateStr} ${escapeHtml(h.name)}${hWeek}</span>
      <button type="button" class="holiday-badge-delete" data-index="${index}" title="削除">✕</button>
    `;

      badge.querySelector('.holiday-badge-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        formHolidays.splice(index, 1);
        renderFormHolidays();
        renderFormCalendar();
      });

      container.appendChild(badge);
    });
  }

  // 登録フォーム内の28日間をハイライトするカレンダーUIの描画
  function renderFormCalendar() {
    const container = document.getElementById('formCalendarContainer');
    if (!container) return;
    container.innerHTML = '';

    const startDateVal = document.getElementById('startDate').value;
    if (!startDateVal) return;

    const start = parseDateLocal(startDateVal);
    if (!start) return;

    const end = new Date(start);
    end.setDate(start.getDate() + 27); // 28日間

    // 表示する月（開始日の月、および終了日が別月なら終了日の月も）
    let rangeTitle = `${start.getFullYear()}年 ${start.getMonth() + 1}月`;
    if (start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()) {
      rangeTitle += ` - ${end.getMonth() + 1}月`;
    }

    const titleEl = document.createElement('div');
    titleEl.className = 'calendar-month-title';
    titleEl.innerText = rangeTitle;
    container.appendChild(titleEl);

    const daysHeader = document.createElement('div');
    daysHeader.className = 'calendar-week-header';
    daysHeader.style.display = 'grid';
    daysHeader.style.gridTemplateColumns = '45px repeat(7, 1fr)';
    ['週', '日', '月', '火', '水', '木', '金', '土'].forEach(dayName => {
      const dayNameEl = document.createElement('div');
      dayNameEl.innerText = dayName;
      daysHeader.appendChild(dayNameEl);
    });
    container.appendChild(daysHeader);

    const daysGrid = document.createElement('div');
    daysGrid.className = 'calendar-days-grid';
    daysGrid.style.display = 'grid';
    daysGrid.style.gridTemplateColumns = '45px repeat(7, 1fr)';

    for (let i = 0; i < 28; i++) {
      // 7日ごとに週ラベルを挿入
      if (i % 7 === 0) {
        const weekLabel = document.createElement('div');
        weekLabel.className = 'calendar-week-label';
        weekLabel.style.display = 'flex';
        weekLabel.style.alignItems = 'center';
        weekLabel.style.justifyContent = 'center';
        weekLabel.style.fontSize = '0.75rem';
        weekLabel.style.fontWeight = 'bold';
        weekLabel.style.color = 'var(--text-secondary)';
        weekLabel.innerText = `第${Math.floor(i / 7) + 1}週`;
        daysGrid.appendChild(weekLabel);
      }

      const current = new Date(start);
      current.setDate(start.getDate() + i);
      const currentStr = formatDateLocal(current);

      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day-cell in-period';
      dayEl.dataset.date = currentStr;

      const currentDay = current.getDay();
      if (currentDay === 0) {
        dayEl.classList.add('day-sunday');
      } else if (currentDay === 6) {
        dayEl.classList.add('day-saturday');
      }

      // 表示する日付テキスト
      // i === 0 (最初の日)、またはその月の1日には月を表示する
      const isMonthStart = current.getDate() === 1;
      const dateText = document.createElement('span');
      dateText.className = 'day-number';
      if (i === 0 || isMonthStart) {
        dateText.innerText = `${current.getMonth() + 1}/${current.getDate()}`;
        dateText.style.fontSize = '0.7rem';
      } else {
        dateText.innerText = current.getDate();
      }
      dayEl.appendChild(dateText);

      if (i === 0) dayEl.classList.add('period-start');
      if (i === 27) dayEl.classList.add('period-end');

      // イベントマッピング
      // 1. 会議日
      const meetingVal = document.getElementById('meetingDate').value;
      if (meetingVal === currentStr) {
        dayEl.classList.add('event-meeting');
        const badge = document.createElement('span');
        badge.className = 'event-tag tag-meeting';
        badge.innerText = `会議${getWeekMarker(currentStr, startDateVal)}`;
        dayEl.appendChild(badge);
      }

      // 2. 広報日
      const prVal = document.getElementById('prDate').value;
      if (prVal === currentStr) {
        dayEl.classList.add('event-pr');
        const badge = document.createElement('span');
        badge.className = 'event-tag tag-pr';
        badge.innerText = `広報${getWeekMarker(currentStr, startDateVal)}`;
        dayEl.appendChild(badge);
      }

      // 3. 祝日 (会議日・広報以外の純粋な祝日・イベント)
      const isHoliday = formHolidays.find(h => h.date === currentStr && !h.name.startsWith("【会議】") && !h.name.startsWith("【広報】"));
      if (isHoliday) {
        const isCustomHoliday = isHoliday.name === "振替休日" || isHoliday.name === "国民の休日" ? false : !["元日", "成人の日", "建国記念の日", "天皇誕生日", "春分の日", "昭和の日", "憲法記念日", "みどりの日", "こどもの日", "海の日", "山の日", "敬老の日", "秋分の日", "スポーツの日", "文化の日", "勤労感謝の日"].includes(isHoliday.name);
        
        if (isCustomHoliday) {
          dayEl.classList.add('event-custom-holiday');
          const badge = document.createElement('span');
          badge.className = 'event-tag tag-custom-holiday';
          badge.innerText = isHoliday.name.slice(0, 3);
          dayEl.appendChild(badge);
        } else {
          dayEl.classList.add('event-holiday');
          const badge = document.createElement('span');
          badge.className = 'event-tag tag-holiday';
          badge.innerText = isHoliday.name.slice(0, 3);
          dayEl.appendChild(badge);
        }
      }

      // マスをクリックした際に広報日を選択する
      dayEl.addEventListener('click', () => {
        selectPrDate(currentStr);
      });

      daysGrid.appendChild(dayEl);
    }

    container.appendChild(daysGrid);
  }

  // データの読み込み
  function loadData() {
    const savedData = localStorage.getItem('shift_manager_data');
    if (savedData) {
      try {
        state.periods = JSON.parse(savedData);

        // 古いデータ形式の互換性維持とマイグレーション
        state.periods.forEach(period => {
          const start = parseDateLocal(period.startDate);
          if (!start) return;

          if (!period.saveDeadline) {
            const saveDate = new Date(start);
            saveDate.setDate(start.getDate() - 36);
            period.saveDeadline = formatDateLocal(saveDate);
          }
          if (!period.confirmDeadline) {
            const confirmDate = new Date(start);
            confirmDate.setDate(start.getDate() - 8);
            period.confirmDeadline = formatDateLocal(confirmDate);
          }
          if (period.meetingDate === undefined) {
            period.meetingDate = getSecondThursday(period.startDate, period.endDate);
          }
          if (period.prDate === undefined) {
            period.prDate = "";
          }
          if (!period.holidays) {
            period.holidays = getJapaneseHolidays(period.startDate, period.endDate);
          }
          if (period.tasks) {
            period.tasks.forEach(task => {
              if (!task.subtasks) {
                task.subtasks = [];
              }
              if (task.checked === undefined) task.checked = false;
              if (task.checked && !task.checkedAt) {
                task.checkedAt = null;
              } else if (!task.checked) {
                task.checkedAt = null;
              }
              task.subtasks.forEach(st => {
                if (st.checked === undefined) st.checked = false;
                if (st.checked && !st.checkedAt) {
                  st.checkedAt = null;
                } else if (!st.checked) {
                  st.checkedAt = null;
                }
              });
            });
          }
        });
        saveData(); // アップグレードしたデータを保存
      } catch (e) {
        console.error('データの解析に失敗しました。初期化します。', e);
        state.periods = [];
      }
    } else {
      // 初回起動時のサンプルデータ作成
      const today = new Date();
      const nextSunday = new Date(today);
      const day = today.getDay();
      const diff = day === 0 ? 0 : 7 - day;
      nextSunday.setDate(today.getDate() + diff);
      const startStr = formatDateLocal(nextSunday);

      // サンプルの終了日（27日後）
      const end = new Date(nextSunday);
      end.setDate(nextSunday.getDate() + 27);
      const endStr = formatDateLocal(end);

      // 期限の計算
      const saveDate = new Date(nextSunday);
      saveDate.setDate(nextSunday.getDate() - 36);
      const confirmDate = new Date(nextSunday);
      confirmDate.setDate(nextSunday.getDate() - 8);

      state.periods = [
        {
          id: Date.now(),
          startDate: startStr,
          endDate: endStr,
          saveDeadline: formatDateLocal(saveDate),
          confirmDeadline: formatDateLocal(confirmDate),
          meetingDate: getSecondThursday(startStr, endStr),
          prDate: "",
          holidays: getJapaneseHolidays(startStr, endStr),
          tasks: DEFAULT_TASKS_TEMPLATE.map((t, idx) => ({
            id: Date.now() + idx,
            categoryId: t.categoryId,
            text: t.text,
            checked: false,
            checkedAt: null,
            subtasks: t.subtasks ? t.subtasks.map((st, sIdx) => ({
              id: Date.now() + idx + 1000 + sIdx,
              text: st.text,
              checked: false,
              checkedAt: null
            })) : []
          }))
        }
      ];
      saveData();
    }
  }

  // データの保存
  function saveData() {
    localStorage.setItem('shift_manager_data', JSON.stringify(state.periods));
  }

  // 画面描画
  function render() {
    // ビューの切り替え
    document.getElementById('topView').classList.toggle('active', state.currentView === 'top');
    document.getElementById('detailsView').classList.toggle('active', state.currentView === 'details');

    if (state.currentView === 'top') {
      renderTopView();
    } else if (state.currentView === 'details') {
      renderDetailsView();
    }
  }

  // トップ画面のレンダリング
// トップ画面のレンダリング
function renderTopView() {
  const periodListContainer = document.getElementById('periodList');
  periodListContainer.innerHTML = '';

  if (state.periods.length === 0) {
    periodListContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <p>登録された期間はありません。<br>上のフォームから新しく追加してください。</p>
      </div>
    `;
    return;
  }

  // 日付順にソート（開始日順）
  const sortedPeriods = [...state.periods].sort((a, b) => parseDateLocal(a.startDate) - parseDateLocal(b.startDate));

    sortedPeriods.forEach(period => {
      const totalTasks = period.tasks.length;
      const completedTasks = period.tasks.filter(t => t.checked).length;
      const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const formattedStart = formatDateJapanese(period.startDate);
      const formattedEnd = formatDateJapanese(period.endDate);

      const saveDeadlineStr = formatDateJapanese(period.saveDeadline);
      const confirmDeadlineStr = formatDateJapanese(period.confirmDeadline);

      // 会議日と広報日に週番号マーカーを付与
      const meetingWeek = getWeekMarker(period.meetingDate, period.startDate);
      const meetingDateStr = period.meetingDate && period.meetingDate !== "なし"
        ? formatDateJapanese(period.meetingDate) + meetingWeek
        : "なし";

      const prWeek = getWeekMarker(period.prDate, period.startDate);
      const prDateStr = period.prDate
        ? formatDateJapanese(period.prDate) + prWeek
        : "未設定";

      // 祝日ミニタグの生成（週番号を追加）
      let holidaysHtml = '';
      if (period.holidays && period.holidays.length > 0) {
        holidaysHtml = `
        <div class="period-card-holidays">
          ${period.holidays.slice(0, 5).map(h => {
          const hWeek = getWeekMarker(h.date, period.startDate);
          const d = new Date(h.date);
          const label = `${d.getMonth() + 1}/${d.getDate()}${escapeHtml(h.name)}${hWeek}`;
          const isCustom = h.name === "振替休日" || h.name === "国民の休日" ? false : !["元日", "成人の日", "建国記念の日", "天皇誕生日", "春分の日", "昭和の日", "憲法記念日", "みどりの日", "こどもの日", "海の日", "山の日", "敬老の日", "秋分の日", "スポーツの日", "文化の日", "勤労感謝の日"].includes(h.name);
          let miniTagClass = 'holiday-mini-tag';
          if (h.name.startsWith("【会議】") || h.name.startsWith("【広報】")) {
            miniTagClass += ' meeting-pr-mini';
          } else if (isCustom) {
            miniTagClass += ' custom-event';
          }
          return `<span class="${miniTagClass}" title="${h.date}">${label}</span>`;
        }).join('')}
          ${period.holidays.length > 5 ? `<span class="holiday-mini-tag" style="background:rgba(255,255,255,0.05); border-color:var(--border-color); color:var(--text-secondary);">他 ${period.holidays.length - 5}件</span>` : ''}
        </div>
      `;
      }

      const card = document.createElement('div');
      card.className = 'period-card';
      card.innerHTML = `
      <div class="period-card-header">
        <div class="period-title">📅 ${formattedStart} 〜 ${formattedEnd}</div>
        <div class="period-stats">${completedTasks}/${totalTasks} 完了</div>
      </div>
      <div class="progress-container">
        <div class="progress-bar" style="width: ${progressPercent}%"></div>
      </div>
      
      <!-- メタ情報 -->
      <div class="period-card-meta">
        <div class="meta-item">
          <span class="meta-label">💾 保存入力期限</span>
          <span class="meta-value highlight-danger">${saveDeadlineStr}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">🔒 確定入力期限</span>
          <span class="meta-value highlight-danger">${confirmDeadlineStr}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">🤝 経推・会議日</span>
          <span class="meta-value highlight-accent">${meetingDateStr}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">📢 広報予定日</span>
          <span class="meta-value">${prDateStr}</span>
        </div>
      </div>
      
      ${holidaysHtml}

      <div class="card-footer">
        <span class="card-hint">👉 タップして作成工程を確認</span>
        <button class="btn-danger-icon delete-period-btn" data-id="${period.id}" title="期間を削除">
          🗑️
        </button>
      </div>
    `;

      // カード本体をタップしたら詳細へ
      card.addEventListener('click', (e) => {
        if (e.target.closest('.delete-period-btn')) {
          return;
        }
        navigateToDetails(period.id);
      });

      // 削除ボタンのイベント
      card.querySelector('.delete-period-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`この期間（${formattedStart} 〜 ${formattedEnd}）の作成工程データをすべて削除しますか？`)) {
          deletePeriod(period.id);
        }
      });

      periodListContainer.appendChild(card);
    });
  }

  // 詳細画面（グループ化されたチェックリスト）のレンダリング
  function renderDetailsView() {
    const period = state.periods.find(p => p.id === state.activePeriodId);
    if (!period) {
      navigateToTop();
      return;
    }

    const formattedStart = formatDateJapanese(period.startDate);
    const formattedEnd = formatDateJapanese(period.endDate);

    // タイトル設定
    document.getElementById('detailsTitle').innerText = `${formattedStart} 〜 ${formattedEnd} 指定表作成`;

    // 全体の進捗数と進捗率、および進行位置の表示更新
    const totalTasks = period.tasks.length;
    const completedTasks = period.tasks.filter(t => t.checked).length;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    document.getElementById('detailsProgressCount').innerText = `${completedTasks}/${totalTasks}`;
    document.getElementById('detailsProgressPercent').innerText = `${progressPercent}%`;
    document.getElementById('detailsProgressBar').style.width = `${progressPercent}%`;

    let currentStatusText = "進捗状況: 未着手";
    if (completedTasks === totalTasks && totalTasks > 0) {
      currentStatusText = "進捗状況: すべての工程が完了しました！🎉";
    } else if (completedTasks > 0) {
      let lastCheckedTask = null;
      let lastCheckedCategoryNum = 0;
      
      CATEGORIES.forEach(cat => {
        const catTasks = period.tasks.filter(t => t.categoryId === cat.id);
        catTasks.forEach(task => {
          if (task.checked) {
            lastCheckedTask = task;
            lastCheckedCategoryNum = cat.id;
          }
        });
      });

      if (lastCheckedTask) {
        currentStatusText = `現在の進捗: 大項目${lastCheckedCategoryNum}の「${escapeHtml(lastCheckedTask.text)}」まで完了`;
      }
    }
    document.getElementById('detailsCurrentStatus').innerText = currentStatusText;

    // 祝日・イベント一覧の描画
    const detailsHolidaysList = document.getElementById('detailsHolidaysList');
    if (detailsHolidaysList) {
      detailsHolidaysList.innerHTML = '';
      if (!period.holidays || period.holidays.length === 0) {
        detailsHolidaysList.innerHTML = '<span style="font-size:0.85rem; color:var(--text-secondary);">減区・イベントはありません。</span>';
      } else {
        period.holidays.forEach((h, idx) => {
          let badgeClass = 'holiday-badge';
          if (h.name.startsWith("【会議】")) {
            badgeClass += ' event-meeting-badge';
          } else if (h.name.startsWith("【広報】")) {
            badgeClass += ' event-pr-badge';
          } else {
            const isCustom = h.name === "振替休日" || h.name === "国民の休日" ? false : !["元日", "成人の日", "建国記念の日", "天皇誕生日", "春分の日", "昭和の日", "憲法記念日", "みどりの日", "こどもの日", "海の日", "山の日", "敬老の日", "秋分の日", "スポーツの日", "文化の日", "勤労感謝の日"].includes(h.name);
            if (isCustom) {
              badgeClass += ' custom-event';
            }
          }
          const badge = document.createElement('div');
          badge.className = badgeClass;

          const d = new Date(h.date);
          const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
          const hWeek = getWeekMarker(h.date, period.startDate);

          badge.innerHTML = `
            <span>${dateStr} ${escapeHtml(h.name)}${hWeek}</span>
          `;

          detailsHolidaysList.appendChild(badge);
        });
      }
    }

    const checklistContainer = document.getElementById('checklist');
    checklistContainer.innerHTML = '';

    // カテゴリごとにタスクをグループ分けして描画
    CATEGORIES.forEach(category => {
      const categoryTasks = period.tasks.filter(t => t.categoryId === category.id);

      // グループヘッダーの作成
      const groupHeader = document.createElement('div');
      groupHeader.className = 'category-group-header';
      groupHeader.style.display = 'flex';
      groupHeader.style.justifyContent = 'space-between';
      groupHeader.style.alignItems = 'center';

      const completedCatTasks = categoryTasks.filter(t => t.checked).length;
      const totalCatTasks = categoryTasks.length;

      groupHeader.innerHTML = `
        <span>${escapeHtml(category.name)}</span>
        <span style="font-size: 0.8rem; font-weight: 600; opacity: 0.8; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 8px;">
          ${completedCatTasks}/${totalCatTasks}
        </span>
      `;
      checklistContainer.appendChild(groupHeader);

      // そのカテゴリにタスクがない場合の表示
      if (categoryTasks.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'category-empty-msg';
        emptyMsg.innerText = 'この工程のチェック項目はありません。';
        checklistContainer.appendChild(emptyMsg);
        return;
      }

      // タスクの描画
      categoryTasks.forEach(task => {
        const hasSubtasks = task.subtasks && task.subtasks.length > 0;
        
        const item = document.createElement('div');
        item.className = 'checklist-item-wrapper';
        item.style.display = 'flex';
        item.style.flexDirection = 'column';
        item.style.gap = '6px';
        item.style.marginBottom = '8px';

        // メインタスク行
        const mainRow = document.createElement('div');
        mainRow.className = `checklist-item ${task.checked ? 'checked' : ''}`;
        
        let subtasksBadgeHtml = '';
        if (hasSubtasks) {
          const completedCount = task.subtasks.filter(st => st.checked).length;
          const totalCount = task.subtasks.length;
          subtasksBadgeHtml = `
            <span class="subtask-badge" style="font-size: 0.75rem; background: var(--accent-color); color: white; padding: 2px 8px; border-radius: 4px; margin-left: 8px; font-weight: 600; cursor: pointer; transition: opacity 0.2s;">
              小タスクあり (${completedCount}/${totalCount})
            </span>
          `;
        }

        let checkedAtHtml = '';
        if (task.checked && task.checkedAt) {
          checkedAtHtml = `
            <span class="checked-at-text" style="font-size: 0.75rem; color: var(--text-secondary); margin-left: auto; padding-right: 8px; font-weight: 500;">
              ✓ ${formatCheckedAt(task.checkedAt)}
            </span>
          `;
        }

        mainRow.innerHTML = `
          <div class="checklist-item-left" style="flex: 1; display: flex; align-items: center;">
            <div class="custom-checkbox">
              <i>✓</i>
            </div>
            <span class="task-text">${escapeHtml(task.text)}</span>
            ${subtasksBadgeHtml}
          </div>
          ${checkedAtHtml}
        `;

        // 親タスククリックイベント
        mainRow.querySelector('.checklist-item-left').addEventListener('click', (e) => {
          if (e.target.closest('.subtask-badge')) {
            return;
          }
          const checkbox = mainRow.querySelector('.custom-checkbox');
          const willCheck = !task.checked;
          toggleTask(period.id, task.id);
          if (willCheck) {
            createSparkles(checkbox);
            mainRow.classList.add('pop-active');
            setTimeout(() => mainRow.classList.remove('pop-active'), 550);
          }
        });

        item.appendChild(mainRow);

        // サブタスクリストの描画
        if (hasSubtasks) {
          const subtaskList = document.createElement('div');
          subtaskList.className = 'subtask-list';
          subtaskList.style.paddingLeft = '32px';
          
          task.subtasks.forEach(st => {
            const subitem = document.createElement('div');
            subitem.className = `checklist-item sub-item ${st.checked ? 'checked' : ''}`;
            subitem.style.padding = '8px 12px';
            subitem.style.borderRadius = '12px';
            subitem.style.fontSize = '0.9rem';
            
            let subCheckedAtHtml = '';
            if (st.checked && st.checkedAt) {
              subCheckedAtHtml = `
                <span class="checked-at-text" style="font-size: 0.7rem; color: var(--text-secondary); margin-left: auto; padding-right: 4px; font-weight: 500;">
                  ✓ ${formatCheckedAt(st.checkedAt)}
                </span>
              `;
            }

            subitem.innerHTML = `
              <div class="checklist-item-left" style="flex: 1; display: flex; align-items: center; gap: 10px;">
                <div class="custom-checkbox" style="width: 20px; height: 20px; border-radius: 6px;">
                  <i style="font-size: 0.7rem;">✓</i>
                </div>
                <span class="task-text" style="font-size: 0.9rem;">${escapeHtml(st.text)}</span>
              </div>
              ${subCheckedAtHtml}
            `;
            
            subitem.querySelector('.checklist-item-left').addEventListener('click', () => {
              const checkbox = subitem.querySelector('.custom-checkbox');
              const willCheck = !st.checked;
              toggleSubtask(period.id, task.id, st.id);
              if (willCheck) {
                createSparkles(checkbox);
                subitem.classList.add('pop-active');
                setTimeout(() => subitem.classList.remove('pop-active'), 550);
              }
            });
            
            subtaskList.appendChild(subitem);
          });
          
          item.appendChild(subtaskList);

          // バッジクリックでのアコーディオン開閉
          const badgeEl = mainRow.querySelector('.subtask-badge');
          if (badgeEl) {
            badgeEl.addEventListener('click', () => {
              const isHidden = subtaskList.style.display === 'none';
              subtaskList.style.display = isHidden ? 'flex' : 'none';
              badgeEl.style.opacity = isHidden ? '1' : '0.6';
            });
          }
        }

        checklistContainer.appendChild(item);
      });
    });

    // 詳細画面カレンダーを描画
    renderDetailsCalendar(period);
  }

  // 完了日時の日本語フォーマット関数
  function formatCheckedAt(dateStringOrTimestamp) {
    if (!dateStringOrTimestamp) return '';
    const date = new Date(dateStringOrTimestamp);
    if (isNaN(date.getTime())) return '';

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayOf = dayNames[date.getDay()];
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');

    return `${y}/${m}/${d}(${dayOf}) ${hh}:${mm}`;
  }

  // チェックボックスの周囲にキラキラ（スパーク）を散らすエフェクト関数
  function createSparkles(element) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    // 8個のパーティクルを放射状に生成
    for (let i = 0; i < 8; i++) {
      const particle = document.createElement('div');
      particle.className = 'sparkle-particle';
      
      // 角度（45度間隔に少しランダム性を加える）と速度
      const angle = (i * 45) + (Math.random() * 20 - 10);
      const speed = 30 + Math.random() * 30; // 飛び散る距離
      const size = 5 + Math.random() * 4;   // パーティクルの大きさ
      
      particle.style.setProperty('--angle', `${angle}deg`);
      particle.style.setProperty('--speed', `${speed}px`);
      particle.style.setProperty('--size', `${size}px`);
      
      // パステル系の華やかな色をランダムに適用
      const colors = ['#2d4a43', '#4d7066', '#a3b899', '#f3b05a', '#ffffff'];
      particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      
      // 初期位置（スクロール分を加算）
      particle.style.left = `${window.scrollX + x}px`;
      particle.style.top = `${window.scrollY + y}px`;
      
      document.body.appendChild(particle);
      
      // アニメーション終了（0.6秒）後に自動消去
      setTimeout(() => {
        particle.remove();
      }, 600);
    }
  }

  // Androidでの触覚フィードバック（短い振動）を発生させる関数
  function triggerHapticFeedback() {
    if (navigator.vibrate) {
      navigator.vibrate(30); // 30ミリ秒の軽い振動
    }
  }

  // 日付を「〇月〇日(曜日)」フォーマットに変換
  function formatDateJapanese(dateString) {
    if (!dateString) return '';
    const date = parseDateLocal(dateString);
    if (!date || isNaN(date.getTime())) return dateString; // "なし" などの文字列はそのまま返す

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayOf = dayNames[date.getDay()];

    return `${y}/${m}/${d}(${dayOf})`;
  }

  // 開始日（日曜日始まり）から何週目にあるかを判定し、丸数字を返す関数
  function getWeekMarker(targetDateStr, startDateStr) {
    if (!targetDateStr || !startDateStr || targetDateStr === "なし") return "";
    const target = parseDateLocal(targetDateStr);
    const start = parseDateLocal(startDateStr);
    if (!target || !start) return "";

    const diffTime = target - start;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 0 && diffDays < 28) {
      const weekNum = Math.floor(diffDays / 7) + 1;
      const markers = ["①", "②", "③", "④"];
      return markers[weekNum - 1] || "";
    }
    return "";
  }

  // HTMLエスケープ処理
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 画面遷移ロジック
  function navigateToDetails(periodId) {
    state.activePeriodId = periodId;
    state.currentView = 'details';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function navigateToTop() {
    state.activePeriodId = null;
    state.currentView = 'top';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 期間の追加
  function addPeriod(startDate, endDate, saveDeadline, confirmDeadline, meetingDate, prDate) {
    console.log("addPeriod inputs:", { startDate, endDate, saveDeadline, confirmDeadline, meetingDate, prDate });
    if (!startDate || !endDate) {
      showToast('開始日と終了日を入力してください。');
      return;
    }

    // テンプレートタスクをコピーして新規期間を追加
    const newPeriod = {
      id: Date.now(),
      startDate: startDate,
      endDate: endDate,
      saveDeadline: saveDeadline,
      confirmDeadline: confirmDeadline,
      meetingDate: meetingDate || "なし",
      prDate: prDate || "",
      holidays: [...formHolidays],
      tasks: DEFAULT_TASKS_TEMPLATE.map((t, idx) => ({
        id: Date.now() + idx + 100,
        categoryId: t.categoryId,
        text: t.text,
        checked: false,
        checkedAt: null,
        subtasks: t.subtasks ? t.subtasks.map((st, sIdx) => ({
          id: Date.now() + idx + 1000 + sIdx,
          text: st.text,
          checked: false,
          checkedAt: null
        })) : []
      }))
    };

    state.periods.push(newPeriod);
    saveData();

    // フォーム用一時データの初期化
    formHolidays = [];

    render();
    showToast('4週間の勤務期間を追加しました！');
  }

  // 祝日の追加（特定の期間データに対して）
  // 祝日の追加
  function addHoliday(periodId, date, name) {
    if (!date || !name.trim()) {
      showToast('日付と減区・イベント名を入力してください。');
      return;
    }

    const period = state.periods.find(p => p.id === periodId);
    if (period) {
      if (!period.holidays) period.holidays = [];
      period.holidays.push({
        date: date,
        name: name.trim()
      });
      // 日付順にソート
      period.holidays.sort((a, b) => parseDateLocal(a.date) - parseDateLocal(b.date));
      saveData();
      render();
      showToast('減区・イベントを追加しました！');
    }
  }

  // 祝日の削除（特定の期間データから）
  function deleteHoliday(periodId, holidayIndex) {
    const period = state.periods.find(p => p.id === periodId);
    if (period && period.holidays) {
      period.holidays.splice(holidayIndex, 1);
      saveData();
      render();
      showToast('減区・イベントを削除しました。');
    }
  }

  // 期間の削除
  function deletePeriod(id) {
    state.periods = state.periods.filter(p => p.id !== id);
    saveData();
    render();
    showToast('期間を削除しました。');
  }

  // タスクの完了トグル
  function toggleTask(periodId, taskId) {
    const period = state.periods.find(p => p.id === periodId);
    if (period) {
      const task = period.tasks.find(t => t.id === taskId);
      if (task) {
        task.checked = !task.checked;
        task.checkedAt = task.checked ? new Date().toISOString() : null;
        if (task.checked) {
          triggerHapticFeedback();
        }
        if (task.subtasks && task.subtasks.length > 0) {
          task.subtasks.forEach(st => {
            st.checked = task.checked;
            st.checkedAt = st.checked ? new Date().toISOString() : null;
          });
        }
        saveData();
        render();
      }
    }
  }

  // サブタスクの完了トグル
  function toggleSubtask(periodId, taskId, subtaskId) {
    const period = state.periods.find(p => p.id === periodId);
    if (period) {
      const task = period.tasks.find(t => t.id === taskId);
      if (task && task.subtasks) {
        const subtask = task.subtasks.find(st => st.id === subtaskId);
        if (subtask) {
          subtask.checked = !subtask.checked;
          subtask.checkedAt = subtask.checked ? new Date().toISOString() : null;
          if (subtask.checked) {
            triggerHapticFeedback();
          }
          
          const allChecked = task.subtasks.every(st => st.checked);
          const wasChecked = task.checked;
          task.checked = allChecked;
          if (task.checked && !wasChecked) {
            task.checkedAt = new Date().toISOString();
          } else if (!task.checked) {
            task.checkedAt = null;
          }
          
          saveData();
          render();
        }
      }
    }
  }

  // タスクの追加
  function addTask(periodId, text, categoryId) {
    if (!text.trim()) {
      showToast('作業項目を入力してください。');
      return;
    }

    const period = state.periods.find(p => p.id === periodId);
    if (period) {
      const newTask = {
        id: Date.now(),
        categoryId: parseInt(categoryId, 10),
        text: text.trim(),
        checked: false
      };
      period.tasks.push(newTask);
      saveData();
      render();
      showToast('作業項目を追加しました！');
    }
  }

  // タスクの削除
  function deleteTask(periodId, taskId) {
    const period = state.periods.find(p => p.id === periodId);
    if (period) {
      period.tasks = period.tasks.filter(t => t.id !== taskId);
      saveData();
      render();
      showToast('項目を削除しました。');
    }
  }

  // トースト通知の表示
  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // イベントリスナーの設定
  function setupEventListeners() {
    // カスタム日付入力欄全体をクリックしたときに日付ピッカーを開く
    document.querySelectorAll('.custom-date-input:not(.readonly)').forEach(wrapper => {
      wrapper.addEventListener('click', () => {
        const input = wrapper.querySelector('input[type="date"]');
        if (input) {
          try {
            input.showPicker();
          } catch (err) {
            console.warn('showPicker is not supported:', err);
          }
        }
      });
    });

    // 期間追加フォーム
    document.getElementById('addPeriodForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const startDate = document.getElementById('startDate').value;
      const endDate = document.getElementById('endDate').value;
      const saveDeadline = document.getElementById('saveDeadline').value;
      const confirmDeadline = document.getElementById('confirmDeadline').value;
      const meetingDate = document.getElementById('meetingDate').value;
      const prDate = document.getElementById('prDate').value;
      addPeriod(startDate, endDate, saveDeadline, confirmDeadline, meetingDate, prDate);
    });

    // 登録フォーム内の祝日追加ボタン
    const addHolidayFormBtn = document.getElementById('addHolidayFormBtn');
    if (addHolidayFormBtn) {
      addHolidayFormBtn.addEventListener('click', () => {
        const holidayDateInput = document.getElementById('newHolidayDate');
        const holidayNameInput = document.getElementById('newHolidayName');
        const dateVal = holidayDateInput.value;
        const nameVal = holidayNameInput.value;

        if (!dateVal || !nameVal.trim()) {
          showToast('日付と減区・イベント名を入力してください。');
          return;
        }

        formHolidays.push({ date: dateVal, name: nameVal.trim() });
        formHolidays.sort((a, b) => parseDateLocal(a.date) - parseDateLocal(b.date));
        renderFormHolidays();
        renderFormCalendar();

        holidayDateInput.value = '';
        holidayNameInput.value = '';
      });
    }

    // 詳細画面での祝日追加ボタン
    const detailAddHolidayBtn = document.getElementById('detailAddHolidayBtn');
    if (detailAddHolidayBtn) {
      detailAddHolidayBtn.addEventListener('click', () => {
        const holidayDateInput = document.getElementById('detailNewHolidayDate');
        const holidayNameInput = document.getElementById('detailNewHolidayName');
        const dateVal = holidayDateInput.value;
        const nameVal = holidayNameInput.value;

        if (!dateVal || !nameVal.trim()) {
          showToast('日付と減区・イベント名を入力してください。');
          return;
        }

        addHoliday(state.activePeriodId, dateVal, nameVal);

        holidayDateInput.value = '';
        holidayNameInput.value = '';
      });
    }

    // 詳細画面から戻るボタン
    document.getElementById('backBtn').addEventListener('click', navigateToTop);

    // 会議日の指定変更イベントハンドラー
    const meetingSelect = document.getElementById('meetingSelect');
    if (meetingSelect) {
      meetingSelect.addEventListener('change', calculateMeetingDate);
    }

    // 広報予定日の日付ピッカー変更イベントハンドラー (カレンダーと相互同期)
    const prDateDisplay = document.getElementById('prDateDisplay');
    if (prDateDisplay) {
      prDateDisplay.addEventListener('change', (e) => {
        const prDateInput = document.getElementById('prDate');
        prDateInput.value = e.target.value;
        const prDateDisplayText = document.getElementById('prDateDisplayText');
        if (prDateDisplayText) {
          prDateDisplayText.innerText = e.target.value ? formatDateJapanese(e.target.value) : "未設定";
        }
        if (e.target.value) {
          showToast(`広報予定日を ${formatDateJapanese(e.target.value)} に設定しました！`);
        } else {
          showToast('広報予定日を解除しました。');
        }
        syncMeetingAndPrEvents();
      });
    }

    // アコーディオンの開閉トグル
    const accordionTrigger = document.getElementById('accordionTrigger');
    const formAccordion = document.getElementById('formAccordion');
    if (accordionTrigger && formAccordion) {
      accordionTrigger.addEventListener('click', () => {
        formAccordion.classList.toggle('active');
      });
    }

    // 新規タスク追加フォーム
    document.getElementById('addTaskForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const taskInput = document.getElementById('newTaskInput');
      const categorySelect = document.getElementById('taskCategorySelect');
      addTask(state.activePeriodId, taskInput.value, categorySelect.value);
      taskInput.value = '';
    });

    // 設定/バックアップモーダルの開閉
    const modal = document.getElementById('backupModal');
    document.getElementById('settingsBtn').addEventListener('click', () => {
      modal.classList.add('active');
    });
    document.getElementById('closeModalBtn').addEventListener('click', () => {
      modal.classList.remove('active');
    });
    window.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });

    // データエクスポート
    document.getElementById('exportBtn').addEventListener('click', () => {
      const dataStr = JSON.stringify(state.periods, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shift_manager_backup_${formatDateLocal(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('バックアップファイルをダウンロードしました。');
    });

    // データインポート
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (Array.isArray(importedData)) {
            state.periods = importedData;
            saveData();
            render();
            modal.classList.remove('active');
            showToast('データを正常にインポートしました！');
          } else {
            showToast('無効なファイル形式です。');
          }
        } catch (err) {
          showToast('ファイルの読み込みに失敗しました。');
        }
      };
      reader.readAsText(file);
    });
  }

  // Service Worker の登録
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((registration) => {
            console.log('Service Worker が正常に登録されました:', registration.scope);
          })
          .catch((error) => {
            console.error('Service Worker の登録に失敗しました:', error);
          });
      });
    }
  }

  // 日本の祝日を自動計算して取得する関数
  function getJapaneseHolidays(startDateStr, endDateStr) {
    const start = parseDateLocal(startDateStr);
    const end = parseDateLocal(endDateStr);
    if (!start || !end) return [];
    const holidays = [];

    // 期間内のすべての年月日をループ
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1; // 1-12
      const date = d.getDate();
      const day = d.getDay(); // 0:日, 1:月, ...

      let holidayName = "";

      // 固定祝日
      if (month === 1 && date === 1) holidayName = "元日";
      else if (month === 2 && date === 11) holidayName = "建国記念の日";
      else if (month === 2 && date === 23 && year >= 2020) holidayName = "天皇誕生日";
      else if (month === 4 && date === 29) holidayName = "昭和の日";
      else if (month === 5 && date === 3) holidayName = "憲法記念日";
      else if (month === 5 && date === 4) holidayName = "みどりの日";
      else if (month === 5 && date === 5) holidayName = "こどもの日";
      else if (month === 8 && date === 11) holidayName = "山の日";
      else if (month === 11 && date === 3) holidayName = "文化の日";
      else if (month === 11 && date === 23) holidayName = "勤労感謝の日";

      // 春分の日・秋分の日の簡易計算 (1980〜2099年対応)
      else if (month === 3) {
        const equinox = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
        if (date === equinox) holidayName = "春分の日";
      } else if (month === 9) {
        const equinox = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
        if (date === equinox) holidayName = "秋分の日";
      }

      // ハッピーマンデー (第X月曜日)
      if (day === 1) {
        const nth = Math.floor((date - 1) / 7) + 1;
        if (month === 1 && nth === 2) holidayName = "成人の日";
        else if (month === 7 && nth === 3) holidayName = "海の日";
        else if (month === 9 && nth === 3) holidayName = "敬老の日";
        else if (month === 10 && nth === 2) holidayName = "スポーツの日";
      }

      if (holidayName) {
        holidays.push({ date: formatDateLocal(d), name: holidayName });
      }
    }

    // 振替休日と国民の休日の適用
    const holidayMap = {};
    holidays.forEach(h => {
      holidayMap[h.date] = h.name;
    });

    const finalHolidays = [...holidays];

    // 期間内を再走査して振替休日・国民の休日を適用
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = formatDateLocal(d);
      if (holidayMap[dateStr]) continue;

      const day = d.getDay();
      // 振替休日判定
      if (day !== 0) {
        let temp = new Date(d);
        temp.setDate(temp.getDate() - 1);
        let prevDateStr = formatDateLocal(temp);

        if (holidayMap[prevDateStr]) {
          let isSubstitute = false;
          let checkDate = new Date(temp);
          while (true) {
            if (checkDate.getDay() === 0) {
              if (holidayMap[formatDateLocal(checkDate)]) {
                isSubstitute = true;
              }
              break;
            }
            if (!holidayMap[formatDateLocal(checkDate)]) {
              break;
            }
            checkDate.setDate(checkDate.getDate() - 1);
          }

          if (isSubstitute) {
            holidayMap[dateStr] = "振替休日";
            finalHolidays.push({ date: dateStr, name: "振替休日" });
          }
        }
      }

      // 国民の休日判定
      if (!holidayMap[dateStr]) {
        let prev = new Date(d);
        prev.setDate(prev.getDate() - 1);
        let next = new Date(d);
        next.setDate(next.getDate() + 1);

        const prevStr = formatDateLocal(prev);
        const nextStr = formatDateLocal(next);

        if (holidayMap[prevStr] && holidayMap[nextStr] && holidayMap[prevStr] !== "振替休日" && holidayMap[nextStr] !== "振替休日") {
          holidayMap[dateStr] = "国民の休日";
          finalHolidays.push({ date: dateStr, name: "国民の休日" });
        }
      }
    }

  // 日付順にソートして返す
  return finalHolidays.sort((a, b) => parseDateLocal(a.date) - parseDateLocal(b.date));
}

// 期間内の第2木曜日を取得する関数
  function getSecondThursday(startDateStr, endDateStr) {
    const start = parseDateLocal(startDateStr);
    const end = parseDateLocal(endDateStr);
    if (!start || !end) return "なし";

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDay();
      const date = d.getDate();
      if (day === 4) { // 木曜日
        if (date >= 8 && date <= 14) {
          return formatDateLocal(d);
        }
      }
    }
    return "なし";
  }

  // 詳細画面内に閲覧専用のカレンダーを描画する関数
  function renderDetailsCalendar(period) {
    const container = document.getElementById('detailsCalendarContainer');
    if (!container) return;
    container.innerHTML = '';

    const startDateVal = period.startDate;
    if (!startDateVal) return;

    const start = parseDateLocal(startDateVal);
    if (!start) return;

    const end = new Date(start);
    end.setDate(start.getDate() + 27); // 28日間

    // 表示する月（開始日の月、および終了日が別月なら終了日の月も）
    let rangeTitle = `${start.getFullYear()}年 ${start.getMonth() + 1}月`;
    if (start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()) {
      rangeTitle += ` - ${end.getMonth() + 1}月`;
    }

    // 枠線を少し丸くしたカード風のスタイルにするためのラッパーを作成
    const wrapper = document.createElement('div');
    wrapper.style.background = '#ffffff';
    wrapper.style.border = '1px solid var(--border-color)';
    wrapper.style.borderRadius = 'var(--border-radius)';
    wrapper.style.padding = '16px';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '8px';

    const titleEl = document.createElement('div');
    titleEl.className = 'calendar-month-title';
    titleEl.innerText = rangeTitle;
    wrapper.appendChild(titleEl);

    const daysHeader = document.createElement('div');
    daysHeader.className = 'calendar-week-header';
    daysHeader.style.display = 'grid';
    daysHeader.style.gridTemplateColumns = '45px repeat(7, 1fr)';
    ['週', '日', '月', '火', '水', '木', '金', '土'].forEach(dayName => {
      const dayNameEl = document.createElement('div');
      dayNameEl.innerText = dayName;
      daysHeader.appendChild(dayNameEl);
    });
    wrapper.appendChild(daysHeader);

    const daysGrid = document.createElement('div');
    daysGrid.className = 'calendar-days-grid';
    daysGrid.style.display = 'grid';
    daysGrid.style.gridTemplateColumns = '45px repeat(7, 1fr)';

    for (let i = 0; i < 28; i++) {
      // 7日ごとに週ラベルを挿入
      if (i % 7 === 0) {
        const weekLabel = document.createElement('div');
        weekLabel.className = 'calendar-week-label';
        weekLabel.style.display = 'flex';
        weekLabel.style.alignItems = 'center';
        weekLabel.style.justifyContent = 'center';
        weekLabel.style.fontSize = '0.75rem';
        weekLabel.style.fontWeight = 'bold';
        weekLabel.style.color = 'var(--text-secondary)';
        weekLabel.innerText = `第${Math.floor(i / 7) + 1}週`;
        daysGrid.appendChild(weekLabel);
      }

      const current = new Date(start);
      current.setDate(start.getDate() + i);
      const currentStr = formatDateLocal(current);

      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day-cell in-period';
      dayEl.dataset.date = currentStr;

      const currentDay = current.getDay();
      if (currentDay === 0) {
        dayEl.classList.add('day-sunday');
      } else if (currentDay === 6) {
        dayEl.classList.add('day-saturday');
      }

      // 表示する日付テキスト
      const isMonthStart = current.getDate() === 1;
      const dateText = document.createElement('span');
      dateText.className = 'day-number';
      if (i === 0 || isMonthStart) {
        dateText.innerText = `${current.getMonth() + 1}/${current.getDate()}`;
        dateText.style.fontSize = '0.7rem';
      } else {
        dateText.innerText = current.getDate();
      }
      dayEl.appendChild(dateText);

      if (i === 0) dayEl.classList.add('period-start');
      if (i === 27) dayEl.classList.add('period-end');

      // イベントマッピング
      // 1. 会議日
      const meetingVal = period.meetingDate;
      if (meetingVal === currentStr) {
        dayEl.classList.add('event-meeting');
        const badge = document.createElement('span');
        badge.className = 'event-tag tag-meeting';
        badge.innerText = `会議${getWeekMarker(currentStr, startDateVal)}`;
        dayEl.appendChild(badge);
      }

      // 2. 広報日
      const prVal = period.prDate;
      if (prVal === currentStr) {
        dayEl.classList.add('event-pr');
        const badge = document.createElement('span');
        badge.className = 'event-tag tag-pr';
        badge.innerText = `広報${getWeekMarker(currentStr, startDateVal)}`;
        dayEl.appendChild(badge);
      }

      // 3. 祝日・手動イベント
      const isHoliday = period.holidays ? period.holidays.find(h => h.date === currentStr && !h.name.startsWith("【会議】") && !h.name.startsWith("【広報】")) : null;
      if (isHoliday) {
        const isCustomHoliday = isHoliday.name === "振替休日" || isHoliday.name === "国民の休日" ? false : !["元日", "成人の日", "建国記念の日", "天皇誕生日", "春分の日", "昭和の日", "憲法記念日", "みどりの日", "こどもの日", "海の日", "山の日", "敬老の日", "秋分の日", "スポーツの日", "文化の日", "勤労感謝の日"].includes(isHoliday.name);
        
        if (isCustomHoliday) {
          dayEl.classList.add('event-custom-holiday');
          const badge = document.createElement('span');
          badge.className = 'event-tag tag-custom-holiday';
          badge.innerText = isHoliday.name.slice(0, 3);
          dayEl.appendChild(badge);
        } else {
          dayEl.classList.add('event-holiday');
          const badge = document.createElement('span');
          badge.className = 'event-tag tag-holiday';
          badge.innerText = isHoliday.name.slice(0, 3);
          dayEl.appendChild(badge);
        }
      }

      daysGrid.appendChild(dayEl);
    }

    wrapper.appendChild(daysGrid);
    container.appendChild(wrapper);
  }
